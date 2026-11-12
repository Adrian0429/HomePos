'use client';
import type { usePrintAgent, useReceiptCopies } from '@/lib/print';

export default function ReceiptCopyStatus({copies,printer}:{
  copies:ReturnType<typeof useReceiptCopies>;
  printer:ReturnType<typeof usePrintAgent>;
}) {
  if(!copies.ready&&!copies.stage)return <p role="status" className="mb-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">Memeriksa status nota…</p>;
  if(!copies.stage&&!copies.message)return null;
  const canPrint=printer.online&&Boolean(printer.selected)&&!copies.busy;
  return <div role="status" aria-live="polite" className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm ${copies.stage?'border-amber-300 bg-amber-50 text-amber-900':'border-emerald-200 bg-white text-emerald-800'}`}>
    <span>{copies.message}</span>
    {copies.stage==='cut'&&<button type="button" disabled={!canPrint} onClick={()=>void copies.printSellerCopy()}>Sudah dipotong — cetak salinan penjual</button>}
    {(copies.stage==='buyer'||copies.stage==='seller')&&<button type="button" disabled={!canPrint} onClick={()=>void copies.retry()}>{copies.busy?'Mengirim…':`Coba cetak salinan ${copies.stage==='buyer'?'pembeli':'penjual'} lagi`}</button>}
  </div>;
}
