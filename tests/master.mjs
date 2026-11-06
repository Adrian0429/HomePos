// Hanya gunakan server dengan database sementara, bukan database bisnis.
import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL;
if(!base) throw new Error('Isi TEST_BASE_URL server pengujian');
const suffix=Date.now();
async function call(method,body){const r=await fetch(`${base}/api/master`,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
const product={kind:'product',name:`Tes minuman ${suffix}`,brandName:`Merek ${suffix}`,cost:'3000',price:'5000',stock:10};
const p=await call('POST',product);assert.equal(p.status,201);
const updated=await call('PATCH',{id:p.data.product_id,version:p.data.version,item:{...product,price:'6500',stock:12}});assert.equal(updated.status,200);assert.equal(updated.data.sell_price,'6500.00');
assert.equal((await call('PATCH',{id:p.data.product_id,version:p.data.version,item:product})).status,409);
const plastic={kind:'plastik',name:`Tes PET ${suffix}`,stock:'12.34'};
const q=await call('POST',plastic);assert.equal(q.status,201);
assert.equal((await call('POST',plastic)).status,409);
const change=await call('PATCH',{id:q.data.plastik_id,version:q.data.version,item:{...plastic,name:`Tes PP ${suffix}`,stock:'15.12'}});assert.equal(change.status,200);assert.equal(change.data.stok,'15.120');
assert.equal((await call('POST',{...plastic,stock:'-1'})).status,400);
assert.equal((await call('POST',{...product,name:'   '})).status,400);
// Simulasikan transaksi gudang yang mengubah stok setelah form dibuka.
await fetch(`${base}/api/transactions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'Kirim Pabrik',transactionDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jayapura'}).format(new Date()),items:[{plastikId:q.data.plastik_id,beratKirim:'1'}]})});
assert.equal((await call('PATCH',{id:q.data.plastik_id,version:change.data.version,item:plastic})).status,409);
const catalog=await(await fetch(`${base}/api/catalog`)).json();assert.equal(catalog.products.find(x=>x.product_id===p.data.product_id).sell_price,'6500.00');
console.log('PASS tambah/edit minuman dan plastik, merek baru, duplikasi, validasi, konflik edit/stok, sinkronisasi katalog.');
