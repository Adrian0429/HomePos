'use client';
import { useEffect, useRef, useState } from 'react';
import { rupiah, scaled, today } from '@/components/operation';
type Cash={method:string;masuk:string;keluar:string};
type Goods={category:string;id:number;name:string;unit:string;masuk:string;keluar:string;net:string};
type Event={transaksi_id:number;date:string;event:string;status:string;customerName:string|null;supplierName:string|null;method:string;masuk:string;keluar:string;nota:string};
type Report={from:string;to:string;cash:Cash[];goods:Goods[];factory:{pending:number;notes:number;nominal:string};events:Event[];count:number;page:number;pageSize:number};
const money=(v:bigint)=>v<0n?`−${rupiah(-v)}`:rupiah(v);
const weight=(v:string)=>new Intl.NumberFormat('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v));
export default function Recap(){
  const [from,setFrom]=useState('');const [to,setTo]=useState('');
  const [report,setReport]=useState<Report|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const sequence=useRef(0);
  async function load(start:string,end:string,page=1){
    const seq=++sequence.current;setBusy(true);setError('');
    try{
      const res=await fetch(`/api/rekap?${new URLSearchParams({from:start,to:end,page:String(page)})}`);
      const data=await res.json();if(!res.ok)throw new Error(data.details?.[0]?.message??data.error);
      if(seq===sequence.current)setReport(data);
    }catch(e){if(seq===sequence.current)setError((e as Error).message);}
    finally{if(seq===sequence.current)setBusy(false);}
  }
  useEffect(()=>{const end=today();const start=end.slice(0,8)+'01';setFrom(start);setTo(end);void load(start,end);return()=>{sequence.current++;};},[]);
  const masuk=report?.cash.reduce((sum,r)=>sum+scaled(r.masuk,2),0n)??0n;
  const keluar=report?.cash.reduce((sum,r)=>sum+scaled(r.keluar,2),0n)??0n;
  return <main className="mx-auto max-w-[1600px] p-4 md:px-6 md:py-5">
    <p className="mb-2 text-sm text-emerald-700">Laporan / Operasional</p><h1 className="text-3xl font-bold">Rekap barang & uang</h1>
    <p className="mb-5 mt-2 text-slate-600">Ringkasan pergerakan barang dan transaksi pembayaran dalam satu periode.</p>
    <form className="mb-5 flex flex-wrap items-end gap-3" onSubmit={e=>{e.preventDefault();void load(from,to);}}>
      <label>Dari tanggal<input required type="date" value={from} max={to||undefined} onChange={e=>setFrom(e.target.value)}/></label>
      <label>Sampai tanggal<input required type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)}/></label>
      <button disabled={busy} type="submit">{busy?'Memuat…':'Tampilkan rekap'}</button>
    </form>
    {error&&<p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-800">Rekap gagal dimuat: {error}</p>}
    {report&&<div aria-busy={busy} className="space-y-6">
      <p className="text-sm text-slate-500">Periode ditampilkan: {report.from} s.d. {report.to} · tanggal operasional Asia/Jayapura{busy?' · Memuat data terbaru…':''}</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[['Pendapatan · minuman + nota pabrik',rupiah(masuk)],['Uang keluar · plastik + restok minuman',rupiah(keluar)],['Selisih uang masuk − keluar',money(masuk-keluar)],['Nota pabrik · bagian dari pendapatan',rupiah(scaled(report.factory.nominal,2))]].map(([label,value])=><div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-xl font-bold tabular-nums">{value}</p></div>)}
      </div>
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Pendapatan mencakup penjualan minuman dan nota pabrik yang selesai. Nota dihitung sekali pada tanggal selesai, termasuk data lama yang belum memiliki metode bayar. Nilai nota adalah rincian dari total pendapatan, bukan tambahan. Selisih bukan saldo kas akhir atau laba.</p>
      <section><h2 className="mb-3 text-lg font-semibold">Uang per metode pembayaran</h2><div tabIndex={0} role="region" aria-label="Rekap metode pembayaran, dapat digulir" className="table-scroll bg-white"><table className="purchase-sheet w-full min-w-[560px] text-sm"><thead className="bg-emerald-50 text-left"><tr><th>Metode</th><th>Masuk</th><th>Keluar</th><th>Selisih</th></tr></thead><tbody>
        {report.cash.map(r=><tr key={r.method}><td>{r.method}</td><td>{rupiah(scaled(r.masuk,2))}</td><td>{rupiah(scaled(r.keluar,2))}</td><td>{money(scaled(r.masuk,2)-scaled(r.keluar,2))}</td></tr>)}
        {!report.cash.length&&<tr><td colSpan={4}>Belum ada transaksi pembayaran dalam periode ini.</td></tr>}
      </tbody></table></div></section>
      <section><h2 className="mb-2 text-lg font-semibold">Barang masuk & keluar</h2><p className="mb-3 text-sm text-slate-500">Berdasarkan tanggal transaksi/pengiriman. Nota pabrik tidak mengurangi stok lagi. Stok awal dan perubahan manual di Master Barang tidak termasuk.</p>
        <div tabIndex={0} role="region" aria-label="Rekap barang, dapat digulir" className="table-scroll bg-white"><table className="purchase-sheet w-full min-w-[640px] text-sm"><thead className="bg-emerald-50 text-left"><tr><th>Jenis</th><th>Barang</th><th>Satuan</th><th>Masuk</th><th>Keluar</th><th>Perubahan</th></tr></thead><tbody>
          {report.goods.map(r=><tr key={`${r.category}-${r.id}`}><td>{r.category}</td><td>{r.name}</td><td>{r.unit}</td><td>{r.unit==='kg'?weight(r.masuk):r.masuk}</td><td>{r.unit==='kg'?weight(r.keluar):r.keluar}</td><td>{r.unit==='kg'?weight(r.net):r.net}</td></tr>)}
          {!report.goods.length&&<tr><td colSpan={6}>Belum ada pergerakan barang dalam periode ini.</td></tr>}
        </tbody></table></div>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-4"><h2 className="font-semibold">Pengiriman & nota pabrik</h2><p className="mt-2 text-sm">{report.factory.pending} pengiriman berangkat pada periode ini masih menunggu nota saat ini. {report.factory.notes} nota selesai pada periode ini, senilai {rupiah(scaled(report.factory.nominal,2))}.</p></section>
      <section><h2 className="mb-2 text-lg font-semibold">Riwayat transaksi & nota</h2><p className="mb-3 text-sm text-slate-500">Nota menggunakan tanggal selesai; transaksi lainnya menggunakan tanggal input. Transaksi batal tidak dihitung. Status yang ditampilkan adalah status saat ini.</p>
        <div tabIndex={0} role="region" aria-label="Riwayat transaksi, dapat digulir" className="table-scroll bg-white"><table className="purchase-sheet w-full min-w-[1200px] text-sm"><thead className="bg-emerald-50 text-left"><tr><th>Tanggal</th><th>No.</th><th>Kegiatan</th><th>Pembeli</th><th>Supplier / pengepul</th><th>Status</th><th>Metode</th><th>Uang masuk</th><th>Uang keluar</th><th>Nilai nota</th></tr></thead><tbody>
          {report.events.map(r=><tr key={`${r.transaksi_id}-${r.event}`}><td>{r.date}</td><td>#{r.transaksi_id}</td><td>{r.event}</td><td>{r.customerName||'—'}</td><td>{r.supplierName||'—'}</td><td>{r.status}</td><td>{r.event==='Kirim Pabrik'?'—':r.method}</td><td>{rupiah(scaled(r.masuk,2))}</td><td>{rupiah(scaled(r.keluar,2))}</td><td>{rupiah(scaled(r.nota,2))}</td></tr>)}
          {!report.events.length&&<tr><td colSpan={10}>Tidak ada transaksi dalam periode ini.</td></tr>}
        </tbody></table></div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="text-sm">{report.count} catatan · Halaman {report.page} / {Math.max(1,Math.ceil(report.count/report.pageSize))}</span><div className="flex gap-2"><button disabled={busy||report.page<=1} onClick={()=>load(report.from,report.to,report.page-1)}>Sebelumnya</button><button disabled={busy||report.page*report.pageSize>=report.count} onClick={()=>load(report.from,report.to,report.page+1)}>Berikutnya</button></div></div>
      </section>
    </div>}
  </main>;
}
