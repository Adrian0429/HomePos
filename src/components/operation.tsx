'use client';
import { useEffect, useRef, useState } from 'react';
export type Product = {product_id:number;product_name:string;brand_name:string;price_product:string;stok:number};
export type Plastic = {plastik_id:number;plastik_name:string;stok:string};
type Catalog = {products:Product[];plastik:Plastic[];methods:{method_id:number;payment_method:string}[];suppliers:{supplier_id:number;supplier_name:string}[];customers:string[]};
export const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jayapura',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
// Hitung preview dengan integer berskala; server tetap menentukan nominal final.
export function scaled(value:string, scale:number) {
  if (!/^\d+(\.\d*)?$/.test(value)) return 0n;
  const [whole, fraction=''] = value.split('.');
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale,'0').slice(0,scale));
}
export const decimalDisplay = (value:string|number) => new Intl.NumberFormat('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value));
export const lineTotal = (weight:string, price:string) => (scaled(weight,3)*scaled(price,2)+500n)/1000n;
export function rupiah(cents:bigint) {
  return `Rp ${(cents/100n).toLocaleString('id-ID')},${(cents%100n).toString().padStart(2,'0')}`;
}
async function request(path:string, init?:RequestInit) {
  const response = await fetch(path,init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.details?.[0]?.message ?? data.error ?? 'Permintaan gagal');
  return data;
}
export function useOperation() {
  const [catalog,setCatalog] = useState<Catalog>({products:[],plastik:[],methods:[],suppliers:[],customers:[]});
  const [loaded,setLoaded] = useState(false);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [date,setDate] = useState('');
  const [method,setMethod] = useState('');
  const lock = useRef(false);
  async function refresh() {
    setLoaded(false);
    try { setCatalog(await request('/api/catalog')); setLoaded(true); }
    catch { throw new Error('Katalog gagal dimuat. Periksa koneksi database lalu coba muat ulang.'); }
  }
  useEffect(() => {setDate(today());refresh().catch(e => setMessage(e.message));},[]);
  async function save(body:unknown, clear:()=>void, requiresPayment=true) {
    if (lock.current) return;
    if (requiresPayment && !method) {setMessage('Pilih metode pembayaran terlebih dahulu.');return;}
    lock.current=true;setBusy(true);setMessage('');
    let saved=false;
    try {
      const result = await request('/api/transactions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      saved=true;clear();
      setMessage(`Transaksi #${result.transaksi_id} selesai. Total ${rupiah(scaled(result.total_nominal,2))}.`);
      await refresh();
    } catch(e) {
      setMessage(saved ? 'Transaksi sudah tersimpan, tetapi stok terbaru gagal dimuat. Muat ulang katalog; jangan kirim ulang transaksi.' : (e as Error).message);
    } finally {lock.current=false;setBusy(false);}
  }
  return {catalog,loaded,busy,message,date,setDate,method,setMethod,save,refresh,setMessage};
}
export function OperationFields({operation:o}:{operation:ReturnType<typeof useOperation>}) {
  return <div className="grid gap-4 sm:grid-cols-2">
    <label>Tanggal transaksi<input required type="date" max={today()} value={o.date} onChange={e=>o.setDate(e.target.value)}/></label>
    <label>Metode pembayaran<select required value={o.method} onChange={e=>o.setMethod(e.target.value)}>
      <option value="">Pilih metode bayar</option>{o.catalog.methods.map(m=><option key={m.method_id} value={m.method_id}>{m.payment_method}</option>)}
    </select></label>
  </div>;
}
export function OperationStatus({operation:o}:{operation:ReturnType<typeof useOperation>}) {
  return <>{o.message && <p role="status" className="mb-5 rounded-xl border border-emerald-200 bg-white p-4">{o.message}</p>}
    {!o.loaded && <div className="mb-5"><p className="mb-2 text-sm">Katalog belum tersedia.</p><button type="button" disabled={o.busy} onClick={()=>o.refresh().catch(e=>o.setMessage(e.message))}>Muat ulang katalog</button></div>}
    {o.loaded && !o.catalog.methods.length && <p className="mb-5 text-amber-800">Belum ada metode pembayaran. Isi master metode bayar sebelum membuat transaksi.</p>}</>;
}
