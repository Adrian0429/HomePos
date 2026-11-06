import { z } from 'zod';
import { atomic } from './db';
import { BusinessError, createInput, settleInput, unique } from './validation';

export async function createTransaction(input: z.infer<typeof createInput>) {
  return atomic(async db => {
    const { rows: [day] } = await db.query('SELECT $1::date <= CURRENT_DATE AS valid', [input.transactionDate]);
    if (!day.valid) throw new BusinessError('Tanggal transaksi tidak boleh di masa depan', 400);
    const shipping = input.type === 'Kirim Pabrik';
    let supplierId:number|null=null;
    if(input.type==='Beli Plastik') {
      const {rows:[supplier]}=await db.query(`INSERT INTO supplier(supplier_name) VALUES($1)
        ON CONFLICT(supplier_name) DO UPDATE SET supplier_name=EXCLUDED.supplier_name RETURNING supplier_id`,[input.supplierName]);
      supplierId=supplier.supplier_id;
    }
    const { rows: [transaction] } = await db.query(
      `INSERT INTO transaksi(transaction_date, selesai_date, method_id, type, status, customer_name, supplier_id)
       VALUES ($1, CASE WHEN $2 THEN NULL ELSE $1::date END, $3, $4, $5, $6, $7) RETURNING *`,
      [input.transactionDate, shipping, 'methodId' in input ? input.methodId : null,
       input.type, shipping ? 'Menunggu Pabrik' : 'Selesai',
       input.type === 'Jual Minuman' ? input.customerName || null : null,supplierId]);
    const transactionId = transaction.transaksi_id;
    if (input.type === 'Restok Minuman') {
      unique(input.items.map(i => i.productId));
      for (const item of [...input.items].sort((a,b) => a.productId-b.productId)) {
        // Stok bertambah atomik. Harga modal mengikuti pembelian terakhir.
        const result = await db.query(`UPDATE product SET stok=stok+$2, price_product=$3 WHERE product_id=$1 RETURNING product_id`, [item.productId,item.jumlah,item.hargaSatuan]);
        if (!result.rowCount) throw new BusinessError('Produk tidak ditemukan',404);
        await db.query(`INSERT INTO detail_transaksi_product(transaksi_id,product_id,jumlah,harga_satuan) VALUES($1,$2,$3,$4)`, [transactionId,item.productId,item.jumlah,item.hargaSatuan]);
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
