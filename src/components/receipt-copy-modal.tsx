'use client';
import { useEffect, useRef } from 'react';
import type { usePrintAgent, useReceiptCopies } from '@/lib/print';

export default function ReceiptCopyModal({copies,printer}:{
  copies:ReturnType<typeof useReceiptCopies>;
  printer:ReturnType<typeof usePrintAgent>;
}) {
  const dialogRef=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const dialog=dialogRef.current;
    if(!copies.stage||!dialog)return;
    if(!dialog.open)dialog.showModal();
    const keepOpen=(event:Event)=>event.preventDefault();
    dialog.addEventListener('cancel',keepOpen);
    return ()=>{dialog.removeEventListener('cancel',keepOpen);if(dialog.open)dialog.close();};
  },[Boolean(copies.stage)]);
  if(!copies.stage)return null;
  const canPrint=printer.online&&Boolean(printer.selected)&&!copies.busy;
  const isCutStep=copies.stage==='cut';
  return <dialog ref={dialogRef} aria-labelledby="receipt-copy-title" aria-describedby="receipt-copy-description" className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border-0 bg-white p-5 shadow-2xl backdrop:bg-slate-950/60 sm:p-6">
      <h2 id="receipt-copy-title" className="text-xl font-bold text-slate-900">Nota ganda belum selesai</h2>
      <p id="receipt-copy-description" className="mt-2 text-sm leading-6 text-slate-600">
        {isCutStep
          ? 'Salinan pembeli sudah tercetak. Potong kertas sampai terpisah sebelum mencetak salinan penjual.'
          : `Selesaikan pencetakan salinan ${copies.stage==='buyer'?'pembeli':'penjual'} untuk transaksi ini.`}
      </p>
      <p role="status" aria-live="polite" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{copies.message}</p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        {printer.online&&<label className="min-w-0 flex-1">Pilih printer
          <select aria-label="Pilih printer untuk nota" value={printer.selected} onChange={e=>printer.choose(e.target.value)}>
            {!printer.printers.length&&<option value="">Tidak ada printer tersedia</option>}
            {printer.printers.map(item=><option key={item.name} value={item.name}>{item.displayName||item.name}</option>)}
          </select>
        </label>}
        <button type="button" className="!bg-white !text-emerald-800 border border-emerald-800" disabled={printer.checking} onClick={()=>void printer.refresh()}>{printer.checking?'Memeriksa printer…':'Periksa printer'}</button>
      </div>
      {!printer.online&&<p className="mt-3 text-sm text-amber-800">Printer lokal belum terhubung. Sambungkan printer, lalu tekan “Periksa printer” untuk melanjutkan.</p>}

      <div className="mt-5 flex justify-end">
        {isCutStep
          ? <button type="button" disabled={!canPrint} onClick={()=>void copies.printSellerCopy()}>{copies.busy?'Mengirim salinan penjual…':'Saya sudah memotong — cetak salinan penjual'}</button>
          : <button type="button" disabled={!canPrint} onClick={()=>void copies.retry()}>{copies.busy?'Mengirim ke printer…':`Coba cetak salinan ${copies.stage==='buyer'?'pembeli':'penjual'} lagi`}</button>}
      </div>
  </dialog>;
}
