'use client';
import MoneyInput from '@/components/money-input';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { decimalDisplay, rupiah, scaled } from '@/components/operation';
type Product={product_id:number;product_name:string;brand_name:string;price_product:string;stok:number;version:string};
type Plastic={plastik_id:number;plastik_name:string;stok:string;version:string};
type Catalog={products:Product[];plastik:Plastic[];brands:{brand_id:number;brand_name:string}[]};
type Kind='product'|'plastik';
type Draft={kind:Kind;name:string;brandName:string;cost:string;stock:string;id?:number;version?:string};
const blank=(kind:Kind):Draft=>({kind,name:'',brandName:'',cost:'0',stock:'0'});
async function request(init?:RequestInit) {
  const response=await fetch('/api/master',init);
  const data=await response.json();
  if(!response.ok) throw new Error(data.details?.[0]?.message??data.error??'Permintaan gagal');
  return data;
}
export default function Master() {
  const [catalog,setCatalog]=useState<Catalog>({products:[],plastik:[],brands:[]});
  const [kind,setKind]=useState<Kind>('product');
  const [newBrand,setNewBrand]=useState(false);
  const [draft,setDraft]=useState<Draft>(blank('product'));
  const [search,setSearch]=useState('');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [loaded,setLoaded]=useState(false);
  const [message,setMessage]=useState('');
  const saving=useRef(false);
  const form=useRef<HTMLFormElement>(null);
  async function refresh() {
    setLoading(true);
    try {setCatalog(await request());setLoaded(true);}
    finally {setLoading(false);}
  }
  useEffect(()=>{refresh().catch(e=>setMessage(e.message));},[]);
  function change(field:keyof Draft,value:string){setDraft(previous=>({...previous,[field]:value}));}
  function select(next:Kind){setNewBrand(false);setKind(next);setDraft(blank(next));setSearch('');setMessage('');}
  function editProduct(p:Product){setNewBrand(false);setDraft({kind:'product',id:p.product_id,version:p.version,name:p.product_name,brandName:p.brand_name,cost:p.price_product,stock:String(p.stok)});form.current?.scrollIntoView({behavior:'smooth',block:'center'});}
  function editPlastic(p:Plastic){setDraft({...blank('plastik'),id:p.plastik_id,version:p.version,name:p.plastik_name,stock:Number(p.stok).toFixed(2)});form.current?.scrollIntoView({behavior:'smooth',block:'center'});}
  async function submit(event:FormEvent) {
    event.preventDefault();if(saving.current)return;
    saving.current=true;setBusy(true);setMessage('');let saved=false;
    try {
      const item=draft.kind==='product'
        ? {kind:draft.kind,name:draft.name,brandName:draft.brandName,cost:draft.cost,stock:Number(draft.stock)}
        : {kind:draft.kind,name:draft.name,stock:draft.stock};
      await request({method:draft.id?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft.id?{id:draft.id,version:draft.version,item}:item)});
      saved=true;setNewBrand(false);setDraft(blank(kind));setMessage(`${draft.name} berhasil ${draft.id?'diperbarui':'ditambahkan'}.`);
      await refresh();
    }catch(e){setMessage(saved?'Data tersimpan, tetapi daftar gagal dimuat ulang. Klik Muat ulang daftar; jangan simpan ulang.':(e as Error).message);}
    finally{saving.current=false;setBusy(false);}
  }
  const products=catalog.products.filter(p=>`${p.product_name} ${p.brand_name}`.toLowerCase().includes(search.toLowerCase()));
  const plastics=catalog.plastik.filter(p=>p.plastik_name.toLowerCase().includes(search.toLowerCase()));
  return <main className="mx-auto max-w-[1600px] p-4 md:px-6 md:py-5">
    <p className="mb-2 text-sm text-emerald-700">Pengaturan / Katalog</p><h1 className="text-3xl font-bold">Master barang</h1>
    <p className="mb-7 mt-3 text-slate-600">Kelola daftar minuman dan jenis plastik yang digunakan dalam transaksi.</p>
    <div className="mb-6 flex flex-wrap gap-3" aria-label="Jenis barang">
      <button type="button" aria-pressed={kind==='product'} disabled={busy} className={kind==='product'?'ring-2 ring-emerald-700 ring-offset-2':'opacity-70'} onClick={()=>select('product')}>Produk minuman ({catalog.products.length})</button>
      <button type="button" aria-pressed={kind==='plastik'} disabled={busy} className={kind==='plastik'?'ring-2 ring-emerald-700 ring-offset-2':'opacity-70'} onClick={()=>select('plastik')}>Jenis plastik ({catalog.plastik.length})</button>
    </div>
    {message&&<p role="status" className="mb-5 rounded-xl border border-emerald-200 bg-white p-4">{message}</p>}
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Daftar {kind==='product'?'minuman':'plastik'}</h2>
          <button type="button" disabled={busy||loading} onClick={()=>refresh().catch(e=>setMessage(e.message))}>Muat ulang daftar</button></div>
        <label>Cari barang<input type="search" placeholder="Nama barang atau merek" value={search} onChange={e=>setSearch(e.target.value)}/></label>
        {loading&&<p className="mt-5" role="status">Memuat daftar…</p>}
        {!loading&&!loaded&&<p className="mt-5 text-red-700">Daftar gagal dimuat. Coba muat ulang.</p>}
        {loaded&&<div tabIndex={0} role="region" aria-label="Daftar barang, dapat digulir" className="table-scroll mt-5"><table className="w-full text-left text-sm"><caption className="sr-only">Daftar {kind==='product'?'produk minuman':'jenis plastik'}</caption>
          <thead className="border-b border-slate-200 text-slate-500"><tr><th className="p-2">Nama</th>{kind==='product'&&<><th className="p-2">Harga modal</th></>}<th className="p-2">Stok</th><th className="p-2">Aksi</th></tr></thead>
          <tbody>{kind==='product'?products.map(p=><tr key={p.product_id} className="border-b border-slate-100"><td className="p-2"><span className="font-semibold">{p.product_name}</span><span className="block text-xs text-slate-500">{p.brand_name}</span></td><td className="whitespace-nowrap p-2">{rupiah(scaled(p.price_product,2))}</td><td className="whitespace-nowrap p-2">{p.stok} unit</td><td className="p-2"><button type="button" disabled={busy} aria-label={`Edit ${p.product_name}`} onClick={()=>editProduct(p)}>Edit</button></td></tr>)
            :plastics.map(p=><tr key={p.plastik_id} className="border-b border-slate-100"><td className="p-2 font-semibold">{p.plastik_name}</td><td className="whitespace-nowrap p-2">{decimalDisplay(p.stok)} kg</td><td className="p-2"><button type="button" disabled={busy} aria-label={`Edit ${p.plastik_name}`} onClick={()=>editPlastic(p)}>Edit</button></td></tr>)}</tbody>
        </table>{!(kind==='product'?products.length:plastics.length)&&<p className="py-6 text-slate-500">{search?'Tidak ada barang yang cocok.':'Belum ada barang. Tambahkan melalui form di samping.'}</p>}</div>}
      </section>
      <form ref={form} onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-5 text-xl font-semibold">{draft.id?'Edit':'Tambah'} {kind==='product'?'produk minuman':'jenis plastik'}</h2>
        <fieldset disabled={busy||!loaded} className="space-y-4">
          <label>Nama {kind==='product'?'produk':'plastik'}<input required maxLength={kind==='product'?160:120} value={draft.name} onChange={e=>change('name',e.target.value)}/></label>
          {kind==='product'&&<><div className="flex items-end gap-2">
            <label className="min-w-0 flex-1">Merek
              {newBrand?<input required maxLength={120} value={draft.brandName} onChange={e=>change('brandName',e.target.value)} placeholder="Nama merek baru" autoFocus/>
              :<select required value={draft.brandName} onChange={e=>change('brandName',e.target.value)}><option value="">Pilih merek</option>{catalog.brands.map(b=><option key={b.brand_id} value={b.brand_name}>{b.brand_name}</option>)}</select>}
            </label>
            <button type="button" aria-label={newBrand?'Batal tambah merek':'Tambah merek baru'} onClick={()=>{setNewBrand(!newBrand);change('brandName','');}}>{newBrand?'Batal':'+'}</button>
          </div>
            <p className="text-xs text-slate-500">{newBrand?'Merek baru disimpan bersama produk.':'Pilih merek yang tersedia atau klik + untuk merek baru.'}</p>
            <label>Harga modal (Rp)<MoneyInput required value={draft.cost} onValueChange={value=>change('cost',value)}/></label>
</>}
          <label>{draft.id?'Stok saat ini':'Stok awal'} ({kind==='product'?'unit':'kg'})<input required type="number" min="0" max={kind==='product'?'2147483647':'999999999'} step={kind==='product'?'1':'0.01'} value={draft.stock} onChange={e=>change('stock',e.target.value)}/></label>
          {draft.id&&<p className="text-sm text-slate-500">Mengubah stok di sini menetapkan saldo stok terbaru. Untuk pembelian atau penjualan harian, gunakan modul transaksi.</p>}
          <button type="submit" className="w-full">{busy?'Menyimpan…':draft.id?'Simpan perubahan':'Tambah barang'}</button>
          {draft.id&&<button type="button" className="w-full" onClick={()=>{setNewBrand(false);setDraft(blank(kind));}}>Batal edit</button>}
        </fieldset>
      </form>
    </div>
  </main>;
}
