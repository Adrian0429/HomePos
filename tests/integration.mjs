// Jalankan HANYA pada database tes berisi schema + seed baru.
// App harus berjalan dengan DATABASE_URL database tes yang sama.
import assert from 'node:assert/strict';
import pg from 'pg';
const db = new pg.Pool({connectionString:process.env.DATABASE_URL});
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const date = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jayapura'}).format(new Date());
async function request(path, method, body) {
  const response = await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body ? JSON.stringify(body):undefined});
  return {status:response.status,body:await response.json()};
}
async function stock(table,id) {
  return (await db.query(`SELECT stok FROM ${table} WHERE ${table}_id=$1`,[id])).rows[0].stok;
}
const ship = items => request('/api/transactions','POST',{type:'Kirim Pabrik',transactionDate:date,items});
try {
  assert.equal(await stock('plastik',1),'1000.000','Gunakan seed baru');
  let result = await request('/api/transactions','POST',{type:'Jual Minuman',transactionDate:date,methodId:1,items:[{productId:1,jumlah:2}]});
  assert.equal(result.status,201); assert.equal(result.body.total_nominal,'10000.00'); assert.equal(await stock('product',1),98);
  result = await request('/api/transactions','POST',{type:'Beli Plastik',transactionDate:date,methodId:1,supplierName:'Supplier Test',items:[{plastikId:1,berat:'90.5',hargaSatuan:'4000'}]});
  assert.equal(result.status,201); assert.equal(result.body.total_nominal,'362000.00'); assert.equal(await stock('plastik',1),'1090.500');
  const created = await ship([{plastikId:1,beratKirim:'100'}]);
  assert.equal(created.status,201); assert.equal(created.body.total_nominal,'0.00'); assert.equal(created.body.status,'Menunggu Pabrik');
  assert.equal(await stock('plastik',1),'990.500');
  const pending = await request('/api/transactions','GET');
  const detailId = pending.body.find(t => t.transaksi_id===created.body.transaksi_id).items[0].detail_transaksi_plastik_id;
  const path = `/api/transactions/${created.body.transaksi_id}/settle`;
  assert.equal((await request(path,'PATCH',{methodId:1,items:[{detailId:2147483647,beratDiterima:'95',hargaSatuan:'6000'}]})).status,400);
  const settled = await Promise.all([1,2].map(() => request(path,'PATCH',{methodId:1,items:[{detailId,beratDiterima:'95',hargaSatuan:'6000'}]})));
  assert.deepEqual(settled.map(r => r.status).sort(),[200,409]);
  assert.equal(settled.find(r => r.status===200).body.total_nominal,'570000.00');
  assert.equal(await stock('plastik',1),'990.500');
  const before = (await db.query('SELECT COUNT(*) FROM transaksi')).rows[0].count;
  const rollback = await ship([{plastikId:1,beratKirim:'10'},{plastikId:2,beratKirim:'999999'}]);
  assert.equal(rollback.status,409); assert.equal(await stock('plastik',1),'990.500');
  assert.equal((await db.query('SELECT COUNT(*) FROM transaksi')).rows[0].count,before);
  const competing = await Promise.all([1,2].map(() => ship([{plastikId:3,beratKirim:'400'}])));
  assert.deepEqual(competing.map(r => r.status).sort(),[201,409]); assert.equal(await stock('plastik',3),'100.000');
  assert.equal((await ship([{plastikId:1,beratKirim:'1'},{plastikId:1,beratKirim:'1'}])).status,400);
  assert.equal((await ship([{plastikId:1,beratKirim:"1; DROP TABLE plastik;"}])).status,400);
  console.log('PASS: POS, pembelian, pengiriman, nota simultan, rollback, stok simultan, duplikasi, validasi.');
} finally { await db.end(); }
