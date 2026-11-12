'use client';
import { useState } from 'react';
import MoneyInput from '@/components/money-input';
import CreatableSelect from '@/components/creatable-select';
import { OperationFields, OperationStatus, rupiah, scaled, useOperation } from '@/components/operation';
import PrinterControl from '@/components/printer-control';
import { sendReceipt, usePrintAgent, type ReceiptData } from '@/lib/print';
export default function POS() {
  const o=useOperation();
  const printer=usePrintAgent();
  const [search,setSearch]=useState('');
  const [cart,setCart]=useState<{productId:number;quantity:string;hargaSatuan:string}[]>([]);
  const [customerName,setCustomerName]=useState('');
  const [pendingReceipt,setPendingReceipt]=useState<ReceiptData|null>(null);
  const [printError,setPrintError]=useState('');
  const products=o.catalog.products.filter(p=>`${p.product_name} ${p.brand_name}`.toLowerCase().includes(search.toLowerCase()));
  const total=cart.reduce((sum,item)=>sum+scaled(item.hargaSatuan,2)*BigInt(/^\d+$/.test(item.quantity)?item.quantity:'0'),0n);
  const invalid=cart.some(i=>!/^\d+$/.test(i.quantity)||Number(i.quantity)<1||Number(i.quantity)>Math.min(o.catalog.products.find(p=>p.product_id===i.productId)?.stok??0,1000000)||!/^\d+(\.\d{1,2})?$/.test(i.hargaSatuan));
  function add(productId:number) {
    setCart(previous=>{
      const found=previous.find(i=>i.productId===productId);
      return found ? previous.map(i=>i.productId===productId?{...i,quantity:String(Number(i.quantity)+1)}:i):[...previous,{productId,quantity:'1',hargaSatuan:''}];
    });
  }
  async function retryPrint() {
    if(!pendingReceipt)return;
    try { await sendReceipt(pendingReceipt,printer.selected);setPendingReceipt(null);setPrintError('Struk berhasil dikirim ke printer.'); }
    catch(e) { setPrintError(`Struk belum tercetak: ${(e as Error).message}`); }
  }
  function submitSale() {
    const items=cart.map(item=>{
      const product=o.catalog.products.find(p=>p.product_id===item.productId)!;
      const subtotal=scaled(item.hargaSatuan,2)*BigInt(Number(item.quantity));
      return {name:product.product_name,quantity:Number(item.quantity),price:rupiah(scaled(item.hargaSatuan,2)),subtotal:rupiah(subtotal)};
    });
    const receiptBase={date:o.date,customer:customerName.trim()||'Umum',items};
    const body={type:'Jual Minuman',transactionDate:o.date,methodId:Number(o.method),customerName:customerName.trim()||undefined,items:cart.map(i=>({productId:i.productId,jumlah:Number(i.quantity),hargaSatuan:i.hargaSatuan}))};
    void o.save(body,()=>{setCart([]);setCustomerName('');},true,async saved=>{
      const receipt={...receiptBase,number:String(saved.transaksi_id),total:rupiah(scaled(saved.total_nominal,2))};
      setPendingReceipt(receipt);setPrintError('');
      try {await sendReceipt(receipt,printer.selected);setPendingReceipt(null);setPrintError('Struk berhasil dikirim ke printer.');}
      catch(e) {setPrintError(`Struk belum tercetak: ${(e as Error).message}`);throw e;}
    });
  }
  return <main className="pos-page mx-auto max-w-[1600px] p-4 md:px-6 md:py-5">
    <header className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
      <div className="shrink-0">
        <p className="mb-2 text-sm text-emerald-700">Warung / Penjualan</p>
        <h1 className="text-3xl font-bold">Kasir minuman</h1>
      </div>
      <div className="w-full lg:max-w-[820px] lg:flex-1">
        <PrinterControl printer={printer} className="mb-0"/>
      </div>
    </header>
    <OperationStatus operation={o}/>
    {printError&&<div role="status" className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm ${pendingReceipt?'border-amber-300 bg-amber-50 text-amber-900':'border-emerald-200 bg-white text-emerald-800'}`}>
      <span>{printError}</span>{pendingReceipt&&<button type="button" disabled={!printer.online||!printer.selected} onClick={()=>void retryPrint()}>Cetak ulang struk #{pendingReceipt.number}</button>}
    </div>}
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(360px,1fr)]">
      <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4"><h2 className="mb-2 text-lg font-semibold">Daftar minuman</h2>
        <label>Cari produk atau merek<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Contoh: Air Mineral"/></label>
        {o.loaded && !o.catalog.products.length && <p className="mt-5 text-slate-500">Belum ada produk minuman. Isi master produk terlebih dahulu.</p>}
        {!!o.catalog.products.length && !products.length && <p className="mt-5">Produk tidak ditemukan.</p>}
        <div tabIndex={0} role="region" aria-label="Daftar produk, dapat digulir" className="pos-product-list mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 list-scroll pr-1">{products.map(p=>{
          const amount=Number(cart.find(i=>i.productId===p.product_id)?.quantity??0);
          return <article key={p.product_id} className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs text-slate-500">{p.brand_name}</p><h3 className="mt-1 min-h-10 text-sm font-semibold leading-5 break-words">{p.product_name}</h3>
            <p className="mb-2 mt-2 text-xs text-slate-500">Stok: {p.stok}</p>
            <button type="button" className="w-full !px-2 !py-1.5 text-xs" disabled={!o.loaded||o.busy||amount>=Math.min(p.stok,1000000)||(!amount&&cart.length>=100)} onClick={()=>add(p.product_id)}>{p.stok===0?'Stok habis':amount>=p.stok?'Stok maksimal':'+ Tambah'}</button>
          </article>;
        })}</div>
      </section>
      <form className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 lg:sticky lg:top-4" onSubmit={e=>{e.preventDefault();if(cart.length&&!invalid)submitSale();}}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Keranjang</h2><span className="text-xs text-slate-500">{cart.length} jenis produk</span></div><fieldset disabled={o.busy||!o.loaded} className="space-y-3"><OperationFields operation={o}/><label>Nama pembeli (opsional)
            <CreatableSelect ariaLabel="nama pembeli" value={customerName} onChange={setCustomerName}
              options={o.catalog.customers} placeholder="Pilih nama atau ketik nama baru"/>
          </label>
          {!cart.length && <p className="rounded-lg bg-slate-50 p-5 text-slate-500">Keranjang kosong. Tambahkan minuman dari daftar produk.</p>}
          <ul tabIndex={0} aria-label="Daftar belanja, dapat digulir" className="divide-y divide-slate-200 list-scroll cart-scroll">
          {cart.map(item=>{const p=o.catalog.products.find(p=>p.product_id===item.productId);const quantity=/^\d+$/.test(item.quantity)?Number(item.quantity):0;return <li key={item.productId} className="py-2.5">
            <div className="flex items-start justify-between gap-3"><p className="min-w-0 break-words text-sm font-semibold">{p?.product_name}</p><output className="shrink-0 text-sm font-semibold tabular-nums">{rupiah(scaled(item.hargaSatuan||'0',2)*BigInt(quantity))}</output></div>
            <div className="mt-2 flex items-end gap-3"><label className="min-w-0 flex-1 text-xs text-slate-500">Harga jual / unit<MoneyInput aria-label={`Harga jual ${p?.product_name}`} required value={item.hargaSatuan} onValueChange={value=>setCart(cart.map(i=>i.productId===item.productId?{...i,hargaSatuan:value}:i))}/></label>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" className="!bg-slate-100 !px-2.5 !py-1 !text-slate-700" aria-label={`Kurangi ${p?.product_name}`} disabled={quantity<=1} onClick={()=>setCart(cart.map(i=>i.productId===item.productId?{...i,quantity:String(quantity-1)}:i))}>−</button>
                <input className="!m-0 !w-14 !rounded-md !p-1 text-center text-sm" aria-label={`Jumlah ${p?.product_name}`} required type="number" min="1" max={Math.min(p?.stok??0,1000000)} step="1" value={item.quantity} onChange={e=>setCart(cart.map(i=>i.productId===item.productId?{...i,quantity:e.target.value}:i))}/>
                <button type="button" className="!bg-slate-100 !px-2.5 !py-1 !text-slate-700" aria-label={`Tambah ${p?.product_name}`} disabled={quantity>=Math.min(p?.stok??0,1000000)} onClick={()=>add(item.productId)}>+</button>
                <button type="button" className="delete-button !px-2 !py-1" aria-label={`Hapus ${p?.product_name}`} title="Hapus produk" onClick={()=>setCart(cart.filter(i=>i.productId!==item.productId))}>×</button>
              </div>
            </div>
          </li>;})}</ul>
          {invalid&&<p role="alert" className="text-red-700">Jumlah harus valid, stok cukup, dan harga jual wajib diisi untuk setiap produk.</p>}
          <div className="flex justify-between text-lg font-bold"><span>Total</span><output>{rupiah(total)}</output></div>
          <p className="text-xs text-slate-500">Isi harga jual untuk setiap produk; nama pembeli boleh dikosongkan.</p>
          <button type="submit" className="w-full" disabled={!cart.length||invalid||!o.catalog.methods.length}>{o.busy?'Menyimpan…':'Simpan penjualan'}</button>
        </fieldset>
      </form>
    </div>
  </main>;
}
