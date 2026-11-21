import { z } from 'zod';
import { atomic } from './db';
import { BusinessError, createInput, debtPaymentInput, editTransactionInput, settleInput, unique } from './validation';

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

export async function getTransactionDetails(transactionId:number) {
  return atomic(async db=>{
    const {rows:[transaction]}=await db.query('SELECT * FROM transaksi WHERE transaksi_id=$1',[transactionId]);
    if(!transaction)throw new BusinessError('Transaksi tidak ditemukan',404);
    const beverage=transaction.type==='Jual Minuman'||transaction.type==='Restok Minuman';
    const {rows:items}=beverage
      ?await db.query(`SELECT d.detail_transaksi_product_id AS detail_id,d.product_id AS item_id,p.product_name AS name,
          d.jumlah::text AS quantity,d.harga_satuan::text AS unit_price,d.subtotal::text AS subtotal
        FROM detail_transaksi_product d JOIN product p USING(product_id) WHERE d.transaksi_id=$1 ORDER BY d.detail_transaksi_product_id`,[transactionId])
      :await db.query(`SELECT d.detail_transaksi_plastik_id AS detail_id,d.plastik_id AS item_id,p.plastik_name AS name,
          d.berat_kirim::text AS sent,d.berat_diterima::text AS received,d.harga_satuan::text AS unit_price,d.subtotal::text AS subtotal
        FROM detail_transaksi_plastik d JOIN plastik p USING(plastik_id) WHERE d.transaksi_id=$1 ORDER BY d.detail_transaksi_plastik_id`,[transactionId]);
    return {transaction,items};
  });
}

async function changeProductStock(db:Parameters<Parameters<typeof atomic>[0]>[0],productId:number,delta:number){
  if(!delta)return;
  const {rowCount}=await db.query('UPDATE product SET stok=stok+$2 WHERE product_id=$1 AND stok+$2>=0',[productId,delta]);
  if(!rowCount)throw new BusinessError('Stok minuman tidak cukup untuk perubahan ini');
}
async function consumeProductLots(db:Parameters<Parameters<typeof atomic>[0]>[0],productId:number,quantity:number){
  let remaining=quantity;
  const {rows:lots}=await db.query(`SELECT lot_id,remaining_quantity FROM product_stock_lot
    WHERE product_id=$1 AND remaining_quantity>0 ORDER BY lot_id FOR UPDATE`,[productId]);
  for(const lot of lots){if(remaining<=0)break;const used=Math.min(remaining,Number(lot.remaining_quantity));
    await db.query('UPDATE product_stock_lot SET remaining_quantity=remaining_quantity-$1 WHERE lot_id=$2',[used,lot.lot_id]);remaining-=used;}
  if(remaining>0)throw new BusinessError('Rincian lot stok tidak sesuai dengan stok produk.');
}
async function restoreProductLots(db:Parameters<Parameters<typeof atomic>[0]>[0],productId:number,quantity:number){
  let remaining=quantity;
  const {rows:lots}=await db.query(`SELECT lot_id,initial_quantity,remaining_quantity FROM product_stock_lot
    WHERE product_id=$1 ORDER BY lot_id FOR UPDATE`,[productId]);
  for(const lot of lots){if(remaining<=0)break;const room=Number(lot.initial_quantity)-Number(lot.remaining_quantity);if(room<=0)continue;
    const restored=Math.min(remaining,room);await db.query('UPDATE product_stock_lot SET remaining_quantity=remaining_quantity+$1 WHERE lot_id=$2',[restored,lot.lot_id]);remaining-=restored;}
  if(remaining>0)await db.query(`INSERT INTO product_stock_lot(product_id,restock_transaction_id,initial_quantity,remaining_quantity)
    VALUES($1,NULL,$2,$2)`,[productId,remaining]);
}

export async function editTransaction(transactionId:number,input:z.infer<typeof editTransactionInput>){
  return atomic(async db=>{
    const {rows:[transaction]}=await db.query('SELECT * FROM transaksi WHERE transaksi_id=$1 FOR UPDATE',[transactionId]);
    if(!transaction)throw new BusinessError('Transaksi tidak ditemukan',404);
    if(transaction.type!==input.type)throw new BusinessError('Jenis transaksi tidak dapat diubah');
    const beverage=input.type==='Jual Minuman'||input.type==='Restok Minuman';
    const table=beverage?'detail_transaksi_product':'detail_transaksi_plastik';
    const {rows:oldItems}=beverage
      ?await db.query('SELECT product_id AS item_id,jumlah AS quantity FROM detail_transaksi_product WHERE transaksi_id=$1 FOR UPDATE',[transactionId])
      :await db.query('SELECT plastik_id AS item_id,berat_kirim AS sent,berat_diterima AS received FROM detail_transaksi_plastik WHERE transaksi_id=$1 FOR UPDATE',[transactionId]);
    if(beverage){
      const items=input.items as Extract<typeof input,{type:'Jual Minuman'|'Restok Minuman'}>['items'];
      unique(items.map(item=>item.productId));
      const oldById=new Map(oldItems.map(item=>[Number(item.item_id),Number(item.quantity)]));
      const nextById=new Map(items.map(item=>[item.productId,item.jumlah]));
      for(const productId of [...new Set([...oldById.keys(),...nextById.keys()])].sort((a,b)=>a-b)){
        const oldQuantity=oldById.get(productId)??0;const nextQuantity=nextById.get(productId)??0;
        const stockDelta=input.type==='Jual Minuman'?oldQuantity-nextQuantity:nextQuantity-oldQuantity;
        await changeProductStock(db,productId,stockDelta);
        if(input.type==='Jual Minuman'){
          if(stockDelta>0)await restoreProductLots(db,productId,stockDelta);
          if(stockDelta<0)await consumeProductLots(db,productId,-stockDelta);
        }else{
          const {rows:[lot]}=await db.query(`SELECT lot_id,initial_quantity,remaining_quantity FROM product_stock_lot
            WHERE restock_transaction_id=$1 AND product_id=$2 FOR UPDATE`,[transactionId,productId]);
          if(nextQuantity===0){
            if(lot&&Number(lot.remaining_quantity)!==Number(lot.initial_quantity))throw new BusinessError('Produk dari restok ini sudah terjual; baris tersebut tidak dapat dihapus.');
            if(lot)await db.query('DELETE FROM product_stock_lot WHERE lot_id=$1',[lot.lot_id]);
          }else if(lot){
            const consumed=Number(lot.initial_quantity)-Number(lot.remaining_quantity);
            if(nextQuantity<consumed)throw new BusinessError('Jumlah restok tidak boleh kurang dari jumlah yang sudah terjual.');
            await db.query('UPDATE product_stock_lot SET initial_quantity=$2,remaining_quantity=$2-$3 WHERE lot_id=$1',[lot.lot_id,nextQuantity,consumed]);
          }else await db.query(`INSERT INTO product_stock_lot(product_id,restock_transaction_id,initial_quantity,remaining_quantity)
            VALUES($1,$2,$3,$3)`,[productId,transactionId,nextQuantity]);
        }
        const item=items.find(candidate=>candidate.productId===productId);
        if(!item)await db.query('DELETE FROM detail_transaksi_product WHERE transaksi_id=$1 AND product_id=$2',[transactionId,productId]);
        else await db.query(`INSERT INTO detail_transaksi_product(transaksi_id,product_id,jumlah,harga_satuan) VALUES($1,$2,$3,$4)
          ON CONFLICT(transaksi_id,product_id) DO UPDATE SET jumlah=EXCLUDED.jumlah,harga_satuan=EXCLUDED.harga_satuan`,[transactionId,productId,item.jumlah,item.hargaSatuan]);
      }
    }else{
      unique(input.items.map(item=>item.plastikId));
      const oldById=new Map(oldItems.map(item=>[Number(item.item_id),{sent:Number(item.sent),received:Number(item.received)}]));
      const nextById=new Map(input.items.map(item=>[item.plastikId,item]));
      for(const plastikId of [...new Set([...oldById.keys(),...nextById.keys()])].sort((a,b)=>a-b)){
        const old=oldById.get(plastikId)??{sent:0,received:0};const item=nextById.get(plastikId);
        const sent=item?Number(input.type==='Beli Plastik'?(item as Extract<typeof input,{type:'Beli Plastik'}>['items'][number]).berat:(item as Extract<typeof input,{type:'Kirim Pabrik'}>['items'][number]).beratKirim):0;
        const received=item?Number(input.type==='Beli Plastik'?(item as Extract<typeof input,{type:'Beli Plastik'}>['items'][number]).berat:(item as Extract<typeof input,{type:'Kirim Pabrik'}>['items'][number]).beratDiterima):0;
        if(input.type==='Kirim Pabrik'&&transaction.status==='Menunggu Pabrik'&&received>0)throw new BusinessError('Pengiriman harus diselesaikan dari halaman Kirim Pabrik.');
        const delta=Number((input.type==='Beli Plastik'?received-old.received:old.sent-sent).toFixed(3));
        if(delta){const deltaText=delta.toFixed(3);const {rowCount}=await db.query('UPDATE plastik SET stok=stok+$2::numeric WHERE plastik_id=$1 AND stok+$2::numeric>=0',[plastikId,deltaText]);if(!rowCount)throw new BusinessError('Stok plastik tidak cukup untuk perubahan ini.');}
        if(!item)await db.query('DELETE FROM detail_transaksi_plastik WHERE transaksi_id=$1 AND plastik_id=$2',[transactionId,plastikId]);
        else if(input.type==='Beli Plastik')await db.query(`INSERT INTO detail_transaksi_plastik(transaksi_id,plastik_id,berat_kirim,berat_diterima,harga_satuan)
          VALUES($1,$2,$3,$3,$4) ON CONFLICT(transaksi_id,plastik_id) DO UPDATE SET berat_kirim=EXCLUDED.berat_kirim,berat_diterima=EXCLUDED.berat_diterima,harga_satuan=EXCLUDED.harga_satuan`,[transactionId,plastikId,(item as Extract<typeof input,{type:'Beli Plastik'}>['items'][number]).berat,(item as Extract<typeof input,{type:'Beli Plastik'}>['items'][number]).hargaSatuan]);
        else {const shipmentItem=item as Extract<typeof input,{type:'Kirim Pabrik'}>['items'][number];await db.query(`INSERT INTO detail_transaksi_plastik(transaksi_id,plastik_id,berat_kirim,berat_diterima,harga_satuan)
          VALUES($1,$2,$3,$4,$5) ON CONFLICT(transaksi_id,plastik_id) DO UPDATE SET berat_kirim=EXCLUDED.berat_kirim,berat_diterima=EXCLUDED.berat_diterima,harga_satuan=EXCLUDED.harga_satuan`,[transactionId,plastikId,shipmentItem.beratKirim,shipmentItem.beratDiterima,shipmentItem.hargaSatuan]);}
      }
    }
    const debtKind=input.type==='Restok Minuman'?'restock':input.type==='Jual Minuman'&&input.isDebt?'customer':null;
    const supplierId=input.type==='Beli Plastik'?Number((await db.query(`INSERT INTO supplier(supplier_name) VALUES($1)
      ON CONFLICT(supplier_name) DO UPDATE SET supplier_name=EXCLUDED.supplier_name RETURNING supplier_id`,[input.supplierName])).rows[0].supplier_id):null;
    const header={customerName:input.type==='Jual Minuman'?(input.customerName||null):null,
      methodId:input.type==='Jual Minuman'?(input.isDebt?null:input.methodId??null):input.type==='Beli Plastik'?input.methodId:input.type==='Kirim Pabrik'&&transaction.status==='Selesai'?input.methodId??transaction.method_id:null,
      factoryName:input.type==='Kirim Pabrik'?input.factoryName:null};
    const totalQuery=await db.query(`SELECT COALESCE(SUM(subtotal),0)::numeric AS total FROM ${table} WHERE transaksi_id=$1`,[transactionId]);
    if(debtKind&&Number(transaction.debt_paid)>Number(totalQuery.rows[0].total))throw new BusinessError('Nilai transaksi tidak boleh lebih kecil dari pembayaran piutang yang sudah tercatat.');
    if(!debtKind&&Number(transaction.debt_paid)>0)throw new BusinessError('Transaksi dengan pembayaran piutang tidak dapat diubah menjadi lunas.');
    const {rows:[updated]}=await db.query(`UPDATE transaksi SET customer_name=$2,method_id=$3,supplier_id=$4,factory_name=$5,
      debt_kind=$6,debt_due_date=CASE WHEN $6 IS NULL THEN NULL ELSE transaction_date+14 END,total_nominal=$7 WHERE transaksi_id=$1 RETURNING *`,
      [transactionId,header.customerName,header.methodId,supplierId,header.factoryName,debtKind,totalQuery.rows[0].total]);
    return updated;
  });
}

export async function deleteTransaction(transactionId:number){
  return atomic(async db=>{
    const {rows:[transaction]}=await db.query('SELECT * FROM transaksi WHERE transaksi_id=$1 FOR UPDATE',[transactionId]);
    if(!transaction)throw new BusinessError('Transaksi tidak ditemukan',404);
    const {rows:[payments]}=await db.query('SELECT COUNT(*)::int AS count FROM transaksi_debt_payment WHERE transaksi_id=$1',[transactionId]);
    if(payments.count)throw new BusinessError('Nota memiliki pembayaran piutang; selesaikan atau hapus pembayaran piutang terlebih dahulu.');
    if(transaction.type==='Jual Minuman'||transaction.type==='Restok Minuman'){
      const {rows:items}=await db.query('SELECT product_id,jumlah FROM detail_transaksi_product WHERE transaksi_id=$1 FOR UPDATE',[transactionId]);
      for(const item of items){const quantity=Number(item.jumlah);
        if(transaction.type==='Jual Minuman'){await changeProductStock(db,item.product_id,quantity);await restoreProductLots(db,item.product_id,quantity);}
        else {const {rows:[lot]}=await db.query('SELECT initial_quantity,remaining_quantity FROM product_stock_lot WHERE restock_transaction_id=$1 AND product_id=$2 FOR UPDATE',[transactionId,item.product_id]);
          if(lot&&Number(lot.initial_quantity)!==Number(lot.remaining_quantity))throw new BusinessError('Produk dari nota restok ini sudah terjual; nota tidak dapat dihapus.');
          const {rowCount}=await db.query('UPDATE product SET stok=stok-$2 WHERE product_id=$1 AND stok >= $2',[item.product_id,quantity]);if(!rowCount)throw new BusinessError('Stok minuman tidak cukup untuk menghapus nota.');
          await db.query('DELETE FROM product_stock_lot WHERE restock_transaction_id=$1 AND product_id=$2',[transactionId,item.product_id]);}
      }
      await db.query('DELETE FROM detail_transaksi_product WHERE transaksi_id=$1',[transactionId]);
    }else{
      const {rows:items}=await db.query('SELECT plastik_id,berat_kirim,berat_diterima FROM detail_transaksi_plastik WHERE transaksi_id=$1 FOR UPDATE',[transactionId]);
      for(const item of items){const delta=transaction.type==='Beli Plastik'?-Number(item.berat_diterima):Number(item.berat_kirim);
        if(delta<0){const {rowCount}=await db.query('UPDATE plastik SET stok=stok+$2::numeric WHERE plastik_id=$1 AND stok+$2::numeric>=0',[item.plastik_id,String(delta)]);if(!rowCount)throw new BusinessError('Stok plastik tidak cukup untuk menghapus nota pembelian.');}
        else await db.query('UPDATE plastik SET stok=stok+$2::numeric WHERE plastik_id=$1',[item.plastik_id,String(delta)]);
      }
      await db.query('DELETE FROM detail_transaksi_plastik WHERE transaksi_id=$1',[transactionId]);
    }
    await db.query('DELETE FROM transaksi WHERE transaksi_id=$1',[transactionId]);
    return {transaksi_id:transactionId,deleted:true};
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
