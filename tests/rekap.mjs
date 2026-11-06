// Hanya database khusus pengujian: fixture mengubah data, jangan gunakan database bisnis.
import assert from 'node:assert/strict';
import pg from 'pg';
if(!process.env.TEST_DATABASE_URL||!process.env.TEST_BASE_URL)throw new Error('Isi TEST_DATABASE_URL dan TEST_BASE_URL');
const db=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
const base=process.env.TEST_BASE_URL;
const q=(sql,args)=>db.query(sql,args);
try{
  // Periode khusus fixture; tes dijalankan pada database sementara.
  const date='2001-02-03', done='2001-02-04';
  const b=(await q('INSERT INTO brand(brand_name) VALUES($1) RETURNING brand_id',[`Report ${Date.now()}`])).rows[0].brand_id;
  const p=(await q('INSERT INTO product(product_name,brand_id,price_product,sell_price,stok) VALUES($1,$2,100,200,10) RETURNING product_id',['Report drink',b])).rows[0].product_id;
  const pl=(await q('INSERT INTO plastik(plastik_name,stok) VALUES($1,100) RETURNING plastik_id',[`Report plastic ${Date.now()}`])).rows[0].plastik_id;
  const method=(await q('SELECT method_id FROM metode_bayar LIMIT 1')).rows[0].method_id;
  async function transaction(type,status,total,day=date,finished=day){return (await q('INSERT INTO transaksi(transaction_date,selesai_date,total_nominal,method_id,type,status) VALUES($1,$2,$3,$4,$5,$6) RETURNING transaksi_id',[day,finished,total,status==='Menunggu Pabrik'?null:method,type,status])).rows[0].transaksi_id;}
  const sale=await transaction('Jual Minuman','Selesai','400');await q('INSERT INTO detail_transaksi_product(transaksi_id,product_id,jumlah,harga_satuan) VALUES($1,$2,2,200)',[sale,p]);
  const buy=await transaction('Beli Plastik','Selesai','300');await q('INSERT INTO detail_transaksi_plastik(transaksi_id,plastik_id,berat_kirim,berat_diterima,harga_satuan) VALUES($1,$2,10,10,30)',[buy,pl]);
  const ship=await transaction('Kirim Pabrik','Selesai','160',date,done);await q('INSERT INTO detail_transaksi_plastik(transaksi_id,plastik_id,berat_kirim,berat_diterima,harga_satuan) VALUES($1,$2,5,4,40)',[ship,pl]);
  const pending=await transaction('Kirim Pabrik','Menunggu Pabrik','0',date,null);await q('INSERT INTO detail_transaksi_plastik(transaksi_id,plastik_id,berat_kirim) VALUES($1,$2,2)',[pending,pl]);
  await transaction('Jual Minuman','Batal','999');
  async function report(from,to,page=1){const r=await fetch(`${base}/api/rekap?from=${from}&to=${to}&page=${page}`);const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;}
  const a=await report(date,date);
  assert.equal(a.cash.reduce((n,r)=>n+Number(r.masuk),0),400);
  assert.equal(a.cash.reduce((n,r)=>n+Number(r.keluar),0),300);
  assert.equal(a.goods.find(r=>r.category==='Minuman'&&r.id===p).keluar,'2');
  const plastic=a.goods.find(r=>r.category==='Plastik'&&r.id===pl);assert.equal(Number(plastic.masuk),10);assert.equal(Number(plastic.keluar),7);
  assert.equal(a.factory.pending,1);assert.equal(a.factory.notes,0);assert.equal(a.count,4);
  const n=await report(done,done);assert.equal(n.goods.length,0);assert.equal(n.cash.reduce((sum,r)=>sum+Number(r.masuk),0),160);assert.equal(n.events[0].masuk,'160.00');assert.equal(n.factory.nominal,'160.00');assert.equal(n.events[0].event,'Nota Pabrik');
  const all=await report(date,done);assert.equal(all.count,5);assert.equal(all.cash.reduce((sum,r)=>sum+Number(r.masuk),0),560);
  assert.equal((await report(date,done,2)).events.length,0);
  assert.equal((await fetch(`${base}/api/rekap?from=${done}&to=${date}`)).status,400);
  console.log('PASS rekap: uang, barang, nota lintas tanggal, status batal, pending, batas tanggal, pagination dan validasi.');
}finally{await db.end();}
