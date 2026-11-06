'use client';
import { useState } from 'react';
import Link from 'next/link';
import MoneyInput from '@/components/money-input';
import { OperationStatus, rupiah, scaled, today, useOperation } from '@/components/operation';
type Line={productId:string;jumlah:string;hargaSatuan:string};
const empty=():Line=>({productId:'',jumlah:'1',hargaSatuan:''});
const subtotal=(line:Line)=>scaled(line.hargaSatuan,2)*BigInt(/^\d+$/.test(line.jumlah)?line.jumlah:'0');
export default function Restock(){
  const o=useOperation();const [lines,setLines]=useState<Line[]>([empty()]);
  const total=lines.reduce((sum,line)=>sum+subtotal(line),0n);
  function update(index:number,field:keyof Line,value:string){setLines(previous=>previous.map((line,i)=>i!==index?line:{...line,[field]:value,...(field==='productId'?{hargaSatuan:o.catalog.products.find(p=>String(p.product_id)===value)?.price_product??''}:{})}));}
  return <main className="mx-auto max-w-[1600px] p-4 md:px-6 md:py-5">
    <p className="mb-2 text-sm text-emerald-700">Warung / Pembelian</p><h1 className="text-3xl font-bold">Restok minuman</h1>
    <p className="mb-5 mt-2 text-slate-600">Catat pembelian minuman. Stok bertambah dan total pembelian dicatat sebagai uang keluar.</p>
    {o.message&&<p role="status" className="mb-5 rounded-xl border border-emerald-200 bg-white p-4">{o.message}</p>}{!o.loaded&&<p role="status" className="mb-5">Memuat katalog…</p>}
    {o.loaded&&!o.catalog.products.length&&<p className="mb-4">Belum ada produk. <Link className="underline text-emerald-800" href="/master">Tambahkan produk di Master Barang</Link> terlebih dahulu.</p>}
    <form onSubmit={e=>{e.preventDefault();void o.save({type:'Restok Minuman',transactionDate:o.date,items:lines.map(line=>({productId:Number(line.productId),jumlah:Number(line.jumlah),hargaSatuan:line.hargaSatuan}))},()=>setLines([empty()]),false);}}>
      <fieldset disabled={o.busy||!o.loaded} className="space-y-4">
<label className="max-w-sm">Tanggal transaksi<input required type="date" max={today()} value={o.date} onChange={e=>o.setDate(e.target.value)}/></label>
        <div tabIndex={0} role="region" aria-label="Rincian restok minuman, dapat digulir" className="table-scroll border border-slate-300 bg-white"><table className="purchase-sheet w-full min-w-[800px] border-collapse text-sm">
          <caption className="sr-only">Rincian restok minuman</caption><thead className="bg-emerald-50 text-left"><tr><th scope="col" className="w-12">No.</th><th scope="col">Produk minuman</th><th scope="col" className="w-32">Jumlah (unit)</th><th scope="col" className="w-48">Harga beli / unit (Rp)</th><th scope="col" className="w-48">Subtotal</th><th scope="col" className="w-24">Aksi</th></tr></thead>
          <tbody>{lines.map((line,index)=><tr key={index}><th scope="row" className="bg-slate-50 font-normal">{index+1}</th><td>
            <select required aria-label={`Produk baris ${index+1}`} value={line.productId} onChange={e=>update(index,'productId',e.target.value)}><option value="">Pilih produk minuman</option>{o.catalog.products.map(p=><option key={p.product_id} value={p.product_id} disabled={lines.some((l,i)=>i!==index&&l.productId===String(p.product_id))}>{p.product_name}   -   {p.brand_name}</option>)}</select>
          </td><td><input required aria-label={`Jumlah baris ${index+1}`} type="number" min="1" max="1000000" step="1" value={line.jumlah} onChange={e=>update(index,'jumlah',e.target.value)}/></td>
          <td><MoneyInput required aria-label={`Harga beli baris ${index+1}`} value={line.hargaSatuan} onValueChange={value=>update(index,'hargaSatuan',value)}/></td>
          <td className="text-right whitespace-nowrap tabular-nums "><output>{rupiah(subtotal(line))}</output></td><td><button type="button" className="delete-button" aria-label={`Hapus baris ${index+1}`} onClick={()=>setLines(previous=>previous.length===1?[empty()]:previous.filter((_,i)=>i!==index))}>Hapus</button></td></tr>)}</tbody>
          <tfoot className="bg-emerald-50 font-bold"><tr><td colSpan={4} className="text-right">Total uang keluar</td><td className="text-right whitespace-nowrap tabular-nums"><output>{rupiah(total)}</output></td><td/></tr></tfoot>
        </table></div>
        <div className="flex flex-wrap justify-between gap-3"><button type="button" disabled={lines.length>=Math.min(o.catalog.products.length,100)} onClick={()=>setLines([...lines,empty()])}>+ Tambah baris</button><button type="submit" disabled={!o.catalog.products.length}>{o.busy?'Menyimpan…':'Simpan restok'}</button></div>
        <p className="text-sm text-slate-500">Restok tidak mencatat metode pembayaran. Harga modal mengikuti harga beli terakhir; harga jual diisi berbeda saat transaksi kasir.</p>
      </fieldset>
    </form>
  </main>;
}
