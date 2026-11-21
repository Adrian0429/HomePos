import { z } from 'zod';
import { atomic } from './db';
import { BusinessError, createInput, debtPaymentInput, settleInput, unique } from './validation';

export async function createTransaction(input: z.infer<typeof createInput>) {
  return atomic(async db => {
    const { rows: [day] } = await db.query('SELECT $1::date <= CURRENT_DATE AS valid', [input.transactionDate]);
    if (!day.valid) throw new BusinessError('Tanggal transaksi tidak boleh di masa depan', 400);
    const shipping = input.type === 'Kirim Pabrik';
    const isDebtSale = input.type === 'Jual Minuman' && input.isDebt === true;
    const debtKind = input.type === 'Restok Minuman' ? 'restock'
      : isDebtSale ? 'customer' : null;
    let supplierId:number|null=null;
    if(input.type==='Beli Plastik') {
      const {rows:[supplier]}=await db.query(`INSERT INTO supplier(supplier_name) VALUES($1)
        ON CONFLICT(supplier_name) DO UPDATE SET supplier_name=EXCLUDED.supplier_name RETURNING supplier_id`,[input.supplierName]);
      supplierId=supplier.supplier_id;
    }
    const { rows: [transaction] } = await db.query(
      `INSERT INTO transaksi(transaction_date, selesai_date, method_id, type, status, customer_name, supplier_id, debt_kind, debt_due_date, factory_name)
       VALUES ($1, CASE WHEN $2 THEN NULL ELSE $1::date END, $3, $4, $5, $6, $7, $8::varchar,
         CASE WHEN $8::varchar IS NOT NULL THEN $1::date + 14 ELSE NULL END,$9::varchar) RETURNING *`,
      [input.transactionDate, shipping, 'methodId' in input && !isDebtSale ? input.methodId ?? null : null,
       input.type, shipping ? 'Menunggu Pabrik' : 'Selesai',
       input.type === 'Jual Minuman' ? input.customerName || null : null,supplierId,debtKind,
       input.type === 'Kirim Pabrik' ? input.factoryName : null]);
    const transactionId = transaction.transaksi_id;
    if (input.type === 'Restok Minuman') {
      unique(input.items.map(i => i.productId));
      for (const item of [...input.items].sort((a,b) => a.productId-b.productId)) {
        // Stok bertambah atomik. Harga modal mengikuti pembelian terakhir.
        const result = await db.query(`UPDATE product SET stok=stok+$2, price_product=$3 WHERE product_id=$1 RETURNING product_id`, [item.productId,item.jumlah,item.hargaSatuan]);
        if (!result.rowCount) throw new BusinessError('Produk tidak ditemukan',404);
        await db.query(`INSERT INTO detail_transaksi_product(transaksi_id,product_id,jumlah,harga_satuan) VALUES($1,$2,$3,$4)`, [transactionId,item.productId,item.jumlah,item.hargaSatuan]);
        await db.query(`INSERT INTO product_stock_lot(product_id,restock_transaction_id,initial_quantity,remaining_quantity)
          VALUES($1,$2,$3,$3)`,[item.productId,transactionId,item.jumlah]);
      }
    } else if (input.type === 'Jual Minuman') {
      unique(input.items.map(i => i.productId));
      // Urutan ID konsisten mengurangi risiko deadlock antar keranjang.
      for (const item of [...input.items].sort((a,b) => a.productId-b.productId)) {
        const result = await db.query(
          `UPDATE product SET stok = stok - $2 WHERE product_id = $1 AND stok >= $2 RETURNING product_id`,
          [item.productId, item.jumlah]);
        if (!result.rowCount) throw new BusinessError('Produk tidak ada atau stok tidak cukup');
        await db.query(`INSERT INTO detail_transaksi_product(transaksi_id, product_id, jumlah, harga_satuan)
          VALUES ($1,$2,$3,$4)`, [transactionId,item.productId,item.jumlah,item.hargaSatuan]);
        // Stok master yang ditambahkan manual tetap tercatat sebagai stok non-piutang.
        const lotTotal = await db.query(`SELECT COALESCE(SUM(remaining_quantity),0)::int AS quantity
          FROM product_stock_lot WHERE product_id=$1`,[item.productId]);
        const currentStock = await db.query('SELECT stok FROM product WHERE product_id=$1',[item.productId]);
        const untracked = Number(currentStock.rows[0].stok)+item.jumlah-Number(lotTotal.rows[0].quantity);
        if(untracked>0) await db.query(`INSERT INTO product_stock_lot(product_id,restock_transaction_id,initial_quantity,remaining_quantity)
          VALUES($1,NULL,$2,$2)`,[item.productId,untracked]);
        let remaining=item.jumlah;
        const {rows:lots}=await db.query(`SELECT lot_id,remaining_quantity FROM product_stock_lot
          WHERE product_id=$1 AND remaining_quantity>0 ORDER BY lot_id FOR UPDATE`,[item.productId]);
        for(const lot of lots){
          if(remaining<=0)break;
          const used=Math.min(remaining,Number(lot.remaining_quantity));
          await db.query('UPDATE product_stock_lot SET remaining_quantity=remaining_quantity-$1 WHERE lot_id=$2',[used,lot.lot_id]);
          remaining-=used;
        }
        if(remaining>0) throw new BusinessError('Rincian lot stok tidak sesuai dengan stok produk. Muat ulang stok di Master Barang.');
      }
    } else {
      unique(input.items.map(i => i.plastikId));
      for (const item of [...input.items].sort((a,b) => a.plastikId-b.plastikId)) {
        // Pembelian memakai satu berat; kolom lama tetap kompatibel dengan pengiriman dua tahap.
        const sent = 'berat' in item ? item.berat : item.beratKirim;
        const received = 'berat' in item ? item.berat : '0';
        const price = 'hargaSatuan' in item ? item.hargaSatuan : '0';
        const result = shipping
          ? await db.query(`UPDATE plastik SET stok = stok - $2::numeric WHERE plastik_id=$1 AND stok >= $2::numeric RETURNING plastik_id`, [item.plastikId,sent])
          : await db.query(`UPDATE plastik SET stok = stok + $2::numeric WHERE plastik_id=$1 RETURNING plastik_id`, [item.plastikId,received]);
        if (!result.rowCount) throw new BusinessError('Plastik tidak ada atau stok tidak cukup');
        await db.query(`INSERT INTO detail_transaksi_plastik(transaksi_id,plastik_id,berat_kirim,berat_diterima,harga_satuan)
          VALUES ($1,$2,$3,$4,$5)`,[transactionId,item.plastikId,sent,received,price]);
      }
    }
    // Nama tabel hanya berasal dari konstanta internal; semua input memakai parameter.
    const detailTable = (input.type === 'Jual Minuman' || input.type === 'Restok Minuman') ? 'detail_transaksi_product' : 'detail_transaksi_plastik';
    const { rows: [result] } = await db.query(`UPDATE transaksi SET total_nominal =
      (SELECT COALESCE(SUM(subtotal),0) FROM ${detailTable} WHERE transaksi_id=$1)
      WHERE transaksi_id=$1 RETURNING *`, [transactionId]);
    return result;
  });
}

export async function recordDebtPayment(transactionId:number, input:z.infer<typeof debtPaymentInput>) {
  return atomic(async db=>{
    const {rows:[transaction]}=await db.query(`SELECT transaksi_id,debt_kind,total_nominal,debt_paid
      FROM transaksi WHERE transaksi_id=$1 FOR UPDATE`,[transactionId]);
    if(!transaction || !transaction.debt_kind) throw new BusinessError('Piutang tidak ditemukan',404);
    const {rows:[updated]}=await db.query(`UPDATE transaksi SET debt_paid=debt_paid+$2
      WHERE transaksi_id=$1 AND debt_paid+$2<=total_nominal
      RETURNING transaksi_id,debt_kind,total_nominal,debt_paid,debt_due_date`,[transactionId,input.amount]);
    if(!updated) throw new BusinessError('Pembayaran melebihi sisa piutang');
    await db.query('INSERT INTO transaksi_debt_payment(transaksi_id,amount) VALUES($1,$2)',[transactionId,input.amount]);
    return updated;
  });
}

export async function settleTransaction(transactionId: number, input: z.infer<typeof settleInput>) {
  unique(input.items.map(i => i.detailId));
  return atomic(async db => {
    // Lock induk: hanya satu permintaan boleh menyelesaikan nota ini.
    const { rows: [transaction] } = await db.query('SELECT * FROM transaksi WHERE transaksi_id=$1 FOR UPDATE', [transactionId]);
    if (!transaction) throw new BusinessError('Transaksi tidak ditemukan', 404);
    if (transaction.type !== 'Kirim Pabrik' || transaction.status !== 'Menunggu Pabrik')
      throw new BusinessError('Transaksi bukan pengiriman yang menunggu nota');
    const { rows: details } = await db.query('SELECT detail_transaksi_plastik_id FROM detail_transaksi_plastik WHERE transaksi_id=$1', [transactionId]);
    const ids = new Set(details.map(d => d.detail_transaksi_plastik_id));
    if (ids.size !== input.items.length || input.items.some(i => !ids.has(i.detailId)))
      throw new BusinessError('Nota harus memuat seluruh detail pengiriman yang sama', 400);
    for (const item of input.items) {
      await db.query(`UPDATE detail_transaksi_plastik SET berat_diterima=$1, harga_satuan=$2
        WHERE detail_transaksi_plastik_id=$3 AND transaksi_id=$4`,
        [item.beratDiterima,item.hargaSatuan,item.detailId,transactionId]);
    }
    // Stok TIDAK diubah lagi. Selisih timbangan menjadi penyusutan.
    const { rows: [result] } = await db.query(`UPDATE transaksi SET status='Selesai', selesai_date=CURRENT_DATE,
      method_id=$2, total_nominal=(SELECT SUM(subtotal) FROM detail_transaksi_plastik WHERE transaksi_id=$1)
      WHERE transaksi_id=$1 RETURNING *`, [transactionId,input.methodId]);
    return result;
  });
}
