'use client';
import MoneyInput from '@/components/money-input';
import CreatableSelect from '@/components/creatable-select';
import { useState } from 'react';
import { decimalDisplay, lineTotal, OperationFields, OperationStatus, rupiah, scaled, useOperation } from '@/components/operation';
import PrinterControl from '@/components/printer-control';
import ReceiptCopyModal from '@/components/receipt-copy-modal';
import { usePrintAgent, useReceiptCopies, type ReceiptData } from '@/lib/print';
type Line={plastikId:string;berat:string;hargaSatuan:string};
const empty=():Line=>({plastikId:'',berat:'',hargaSatuan:''});
export default function Purchase() {
  const o=useOperation();
  const printer=usePrintAgent();
  const copies=useReceiptCopies(printer);
  const [lines,setLines]=useState<Line[]>([empty()]);
  const [supplierName,setSupplierName]=useState('');
  const total=lines.reduce((sum,l)=>sum+lineTotal(l.berat,l.hargaSatuan),0n);
  function update(index:number,field:keyof Line,value:string){setLines(lines.map((l,i)=>i===index?{...l,[field]:value}:l));}
  function submitPurchase() {
    if(copies.blocked)return;
    const items=lines.map(line=>{
      const plastic=o.catalog.plastik.find(p=>p.plastik_id===Number(line.plastikId));
      return {name:plastic?.plastik_name||'Plastik',quantity:`${decimalDisplay(line.berat)} kg`,price:`${rupiah(scaled(line.hargaSatuan,2))}/kg`,subtotal:rupiah(lineTotal(line.berat,line.hargaSatuan))};
    });
    const receiptBase={title:'PEMBELIAN PLASTIK',partyLabel:'Supplier',date:o.date,customer:supplierName.trim(),items};
    void o.save({type:'Beli Plastik',transactionDate:o.date,methodId:Number(o.method),supplierName:supplierName.trim(),items:lines.map(l=>({...l,plastikId:Number(l.plastikId)}))},()=>{setLines([empty()]);setSupplierName('');},true,async saved=>{
      const receipt={...receiptBase,number:String(saved.transaksi_id),total:rupiah(scaled(saved.total_nominal,2))};
      await copies.start(receipt);
    });
  }
  return <main className="pos-page mx-auto max-w-[1600px] p-4 md:px-6 md:py-5">
    <header className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
      <div className="shrink-0"><p className="mb-2 text-sm text-emerald-700">Gudang / Pembelian</p><h1 className="text-3xl font-bold">Beli plastik dari pengepul</h1>
        <p className="mt-2 text-slate-600">Masukkan barang per baris. Stok bertambah sesuai berat pembelian.</p>
      </div>
      <div className="w-full lg:max-w-[820px] lg:flex-1"><PrinterControl printer={printer} className="mb-0"/></div>
    </header>
    <OperationStatus operation={o}/>
    <ReceiptCopyModal copies={copies} printer={printer}/>
    {o.loaded&&!o.catalog.plastik.length&&<p className="mb-5 text-amber-800">Belum ada jenis plastik. Isi master plastik terlebih dahulu.</p>}
    <form onSubmit={e=>{e.preventDefault();submitPurchase();}}>
      <fieldset disabled={o.busy||!o.loaded||copies.blocked} className="space-y-5"><OperationFields operation={o}/>
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
          <button type="submit" disabled={copies.blocked||!o.catalog.methods.length||!o.catalog.plastik.length}>{o.busy?'Menyimpan…':'Simpan pembelian'}</button>
        </div>
        <p className="text-sm text-slate-500">Subtotal = berat × harga per kg. Gunakan Tab untuk berpindah sel.</p>
      </fieldset>
    </form>
  </main>;
}
