'use client';
import MoneyInput from '@/components/money-input';
import CreatableSelect from '@/components/creatable-select';
import { useState } from 'react';
import { decimalDisplay, lineTotal, OperationFields, OperationStatus, rupiah, useOperation } from '@/components/operation';
type Line={plastikId:string;berat:string;hargaSatuan:string};
const empty=():Line=>({plastikId:'',berat:'',hargaSatuan:''});
export default function Purchase() {
  const o=useOperation();
  const [lines,setLines]=useState<Line[]>([empty()]);
  const [supplierName,setSupplierName]=useState('');
  const total=lines.reduce((sum,l)=>sum+lineTotal(l.berat,l.hargaSatuan),0n);
  function update(index:number,field:keyof Line,value:string){setLines(lines.map((l,i)=>i===index?{...l,[field]:value}:l));}
  return <main className="mx-auto max-w-[1600px] p-4 md:px-6 md:py-5">
    <p className="mb-2 text-sm text-emerald-700">Gudang / Pembelian</p><h1 className="text-3xl font-bold">Beli plastik dari pengepul</h1>
    <p className="mb-7 mt-3 text-slate-600">Masukkan barang per baris. Stok bertambah sesuai berat pembelian.</p><OperationStatus operation={o}/>
    {o.loaded&&!o.catalog.plastik.length&&<p className="mb-5 text-amber-800">Belum ada jenis plastik. Isi master plastik terlebih dahulu.</p>}
    <form onSubmit={e=>{e.preventDefault();void o.save({type:'Beli Plastik',transactionDate:o.date,methodId:Number(o.method),supplierName:supplierName.trim(),items:lines.map(l=>({...l,plastikId:Number(l.plastikId)}))},()=>{setLines([empty()]);setSupplierName('');});}}>
      <fieldset disabled={o.busy||!o.loaded} className="space-y-5"><OperationFields operation={o}/>
        <label>Supplier / pengepul
          <CreatableSelect ariaLabel="supplier atau pengepul" required value={supplierName} onChange={setSupplierName}
            options={o.catalog.suppliers.map(s=>s.supplier_name)} placeholder="Pilih supplier atau ketik nama baru"/>
        </label>
        <div tabIndex={0} role="region" aria-label="Rincian pembelian plastik, dapat digulir" className="table-scroll border border-slate-300 bg-white">
          <table className="purchase-sheet w-full min-w-[760px] border-collapse text-sm">
            <caption className="sr-only">Rincian pembelian plastik</caption>
            <thead className="bg-emerald-50 text-left"><tr>
              <th scope="col" className="w-12">No.</th><th scope="col">Jenis plastik</th><th scope="col" className="w-36">Berat (kg)</th><th scope="col" className="w-44">Harga / kg (Rp)</th><th scope="col" className="w-48">Subtotal</th><th scope="col" className="w-20">Aksi</th>
            </tr></thead>
            <tbody>{lines.map((line,index)=><tr key={index}>
              <th scope="row" className="bg-slate-50 text-center font-normal text-slate-500">{index+1}</th>
              <td><select aria-label={`Jenis plastik baris ${index+1}`} required value={line.plastikId} onChange={e=>update(index,'plastikId',e.target.value)}>
                <option value="">Pilih plastik</option>{o.catalog.plastik.map(p=><option key={p.plastik_id} value={p.plastik_id} disabled={lines.some((l,i)=>i!==index&&l.plastikId===String(p.plastik_id))}>{p.plastik_name} · stok {decimalDisplay(p.stok)} kg</option>)}
              </select></td>
              <td><input aria-label={`Berat baris ${index+1} (kg)`} required type="number" min="0.01" step="0.01" max="999999999" value={line.berat} onChange={e=>update(index,'berat',e.target.value)}/></td>
              <td><MoneyInput aria-label={`Harga baris ${index+1} per kg (Rp)`} required value={line.hargaSatuan} onValueChange={value=>update(index,'hargaSatuan',value)}/></td>
              <td className="whitespace-nowrap text-right font-medium tabular-nums"><output>{rupiah(lineTotal(line.berat,line.hargaSatuan))}</output></td>
              <td><button type="button" className="delete-button" aria-label={`Hapus baris ${index+1}`} onClick={()=>setLines(previous=>previous.length===1?[empty()]:previous.filter((_,i)=>i!==index))}>Hapus</button></td>
            </tr>)}</tbody>
            <tfoot className="bg-emerald-50 font-bold"><tr><td colSpan={4} className="text-right">Total pembelian</td><td className="whitespace-nowrap text-right tabular-nums"><output>{rupiah(total)}</output></td><td/></tr></tfoot>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button type="button" disabled={lines.length>=Math.min(o.catalog.plastik.length,100)} onClick={()=>setLines([...lines,empty()])}>+ Tambah baris</button>
          <button type="submit" disabled={!o.catalog.methods.length||!o.catalog.plastik.length}>{o.busy?'Menyimpan…':'Simpan pembelian'}</button>
        </div>
        <p className="text-sm text-slate-500">Subtotal = berat × harga per kg. Gunakan Tab untuk berpindah sel.</p>
      </fieldset>
    </form>
  </main>;
}
