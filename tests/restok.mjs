// Server dan TEST_DATABASE_URL harus menunjuk database tes yang sama.
import assert from 'node:assert/strict';
import pg from 'pg';
if(!process.env.TEST_DATABASE_URL||!process.env.TEST_BASE_URL)throw new Error('Isi konfigurasi database dan server tes');
const db=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});const base=process.env.TEST_BASE_URL;
async function post(path,body){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
try{
 const suffix=Date.now();const day='2002-05-06';
 const p=await post('/api/master',{kind:'product',name:`Restock ${suffix}`,brandName:'Restock test',cost:'1000',price:'2000',stock:5});assert.equal(p.status,201);
 const productId=p.data.product_id;
 const catalog=await(await fetch(base+'/api/catalog')).json();const methodId=catalog.methods[0].method_id;
 const report=async()=>await(await fetch(`${base}/api/rekap?from=${day}&to=${day}`)).json();
 const before=await report();const expense=r=>r.cash.reduce((n,c)=>n+Number(c.keluar),0);
 const payload={type:'Restok Minuman',transactionDate:day,methodId,items:[{productId,jumlah:10,hargaSatuan:'1250.50'}]};
 const result=await post('/api/transactions',payload);assert.equal(result.status,201,JSON.stringify(result.data));assert.equal(result.data.total_nominal,'12505.00');
 let product=(await db.query('SELECT * FROM product WHERE product_id=$1',[productId])).rows[0];assert.equal(product.stok,15);assert.equal(product.price_product,'1250.50');assert.equal(product.sell_price,'2000.00');
 const after=await report();assert.equal(expense(after)-expense(before),12505);assert.equal(after.goods.find(g=>g.category==='Minuman'&&g.id===productId).masuk,'10');assert.equal(after.events.find(e=>e.transaksi_id===result.data.transaksi_id).keluar,'12505.00');
 const count=(await db.query('SELECT COUNT(*) FROM transaksi')).rows[0].count;
 const failed=await post('/api/transactions',{...payload,items:[...payload.items,{productId:2147483647,jumlah:2,hargaSatuan:'500'}]});assert.equal(failed.status,404);
 product=(await db.query('SELECT * FROM product WHERE product_id=$1',[productId])).rows[0];assert.equal(product.stok,15);assert.equal((await db.query('SELECT COUNT(*) FROM transaksi')).rows[0].count,count);
 assert.equal((await post('/api/transactions',{...payload,methodId:null})).status,400);
 assert.equal((await post('/api/transactions',{...payload,items:[...payload.items,...payload.items]})).status,400);
 assert.equal((await post('/api/transactions',{...payload,items:[{...payload.items[0],jumlah:1.5}]})).status,400);
 const concurrent=await Promise.all([1,2].map(()=>post('/api/transactions',payload)));assert.deepEqual(concurrent.map(r=>r.status),[201,201]);assert.equal((await db.query('SELECT stok FROM product WHERE product_id=$1',[productId])).rows[0].stok,35);
 console.log('PASS restok: stok, harga modal, harga jual tetap, nominal, rekap barang/uang, rollback, validasi, konkurensi.');
}finally{await db.end();}
