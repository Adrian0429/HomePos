// Gunakan database sementara melalui server TEST_BASE_URL.
import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL;
if(!base) throw new Error('TEST_BASE_URL wajib diisi untuk server tes');
async function post(path,body){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
const p=await post('/api/master',{kind:'plastik',name:`Purchase test ${Date.now()}`,stock:'0'});
assert.equal(p.status,201);
const catalog=await(await fetch(base+'/api/catalog')).json();
const payload={type:'Beli Plastik',transactionDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jayapura'}).format(new Date()),methodId:catalog.methods[0].method_id,supplierName:'Supplier Tes',items:[{plastikId:p.data.plastik_id,berat:'90.50',hargaSatuan:'4000'}]};
const result=await post('/api/transactions',payload);assert.equal(result.status,201);assert.equal(result.data.total_nominal,'362000.00');
const after=await(await fetch(base+'/api/catalog')).json();assert.equal(after.plastik.find(x=>x.plastik_id===p.data.plastik_id).stok,'90.500');
for(const berat of ['0','-1','1.2345']){assert.equal((await post('/api/transactions',{...payload,items:[{...payload.items[0],berat}]})).status,400);}
console.log('PASS pembelian satu berat: nominal, penambahan stok, dan validasi berat.');
