'use client';
import type { usePrintAgent } from '@/lib/print';
type PrinterState=ReturnType<typeof usePrintAgent>;

export default function PrinterControl({printer,className='mb-4'}:{printer:PrinterState;className?:string}) {
  return <section className={`${className} flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3`} aria-label="Status printer kasir">
    <span className={`inline-flex items-center gap-2 text-sm font-semibold ${printer.online?'text-emerald-800':'text-amber-800'}`}>
      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${printer.online?'bg-emerald-600':'bg-amber-500'}`}/>
      {printer.checking?'Memeriksa printer…':!printer.online?'Printer lokal tidak terhubung':printer.printers.length?'Printer lokal terhubung':'Client terhubung, printer tidak ditemukan'}
    </span>
    {printer.online&&<label className="min-w-56 flex-1 sm:flex-none">Pilih printer
      <select aria-label="Pilih printer kasir" className="sm:min-w-56" value={printer.selected} onChange={e=>printer.choose(e.target.value)}>
        {!printer.printers.length&&<option value="">Tidak ada printer tersedia</option>}
        {printer.printers.map(item=><option key={item.name} value={item.name}>{item.displayName||item.name}</option>)}
      </select>
    </label>}
    <button type="button" className="!bg-white !text-emerald-800 border border-emerald-800" disabled={printer.checking} onClick={()=>void printer.refresh()}>{printer.checking?'Memeriksa…':'Periksa lagi'}</button>
    {(!printer.online||!printer.printers.length)&&<p className="w-full text-xs text-slate-500">Pastikan aplikasi printer berjalan dan printer terpasang di komputer kasir pada localhost:5000. Penjualan tetap dapat disimpan saat printer offline.</p>}
  </section>;
}
