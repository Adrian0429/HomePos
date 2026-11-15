'use client';
import { useEffect, useRef, useState } from 'react';
import { rupiah, scaled, today } from '@/components/operation';

type View='salesProduct'|'salesBuyer'|'goodsIn'|'transactions';
type Period='today'|'week'|'month'|'custom';
type SalesProduct={product_id:number;product:string;brand:string;quantity:string;total:string;notes:number};
type SalesBuyer={customerName:string;quantity:string;total:string;notes:number};
type GoodsIn={transaksi_id:number;date:string;category:string;product:string;unit:string;party:string;quantity:string;unitPrice:string;subtotal:string};
type Transaction={transaksi_id:number;date:string;noteDate:string|null;event:string;status:string;customerName:string|null;supplierName:string|null;method:string;masuk:string;keluar:string;total:string};
type Report={from:string;to:string;page:number;pageSize:number;counts:Record<View,number>;salesByProduct:SalesProduct[];salesByBuyer:SalesBuyer[];goodsIn:GoodsIn[];transactions:Transaction[]};

const views:{id:View;label:string}[]=[
  {id:'salesProduct',label:'Penjualan per barang'},
  {id:'salesBuyer',label:'Penjualan per pembeli'},
  {id:'goodsIn',label:'Barang masuk'},
  {id:'transactions',label:'Riwayat per nota'},
];
const money=(amount:string)=>rupiah(scaled(amount,2));
const numberFormat=new Intl.NumberFormat('id-ID',{maximumFractionDigits:2});
const dateLabel=(value:string)=>new Date(`${value}T12:00:00`).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
function daysBefore(end:string,days:number){
  const [year,month,day]=end.split('-').map(Number);
  return new Date(Date.UTC(year,month-1,day-days)).toISOString().slice(0,10);
}

export default function Recap(){
  const [from,setFrom]=useState('');
  const [to,setTo]=useState('');
  const [period,setPeriod]=useState<Period>('today');
  const [view,setView]=useState<View>('salesProduct');
  const [report,setReport]=useState<Report|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const sequence=useRef(0);

  async function load(start:string,end:string,page=1){
    const seq=++sequence.current;setBusy(true);setError('');
    try{
      const response=await fetch(`/api/rekap?${new URLSearchParams({from:start,to:end,page:String(page)})}`);
      const data=await response.json();
      if(!response.ok)throw new Error(data.details?.[0]?.message??data.error??'Rekap gagal dimuat');
      if(seq===sequence.current)setReport(data);
    }catch(e){if(seq===sequence.current)setError((e as Error).message);}
    finally{if(seq===sequence.current)setBusy(false);}
  }

  useEffect(()=>{
    const end=today();setFrom(end);setTo(end);void load(end,end);
    return()=>{sequence.current++;};
  },[]);

  function choosePeriod(next:Exclude<Period,'custom'>){
    const end=today();
    const start=next==='today'?end:daysBefore(end,next==='week'?6:29);
    setPeriod(next);setFrom(start);setTo(end);void load(start,end,1);
  }
  function chooseView(next:View){setView(next);if(report)void load(report.from,report.to,1);}
  const rowCount=report?.counts[view]??0;
  const pageCount=report?Math.max(1,Math.ceil(rowCount/report.pageSize)):1;
  const rows=view==='salesProduct'?report?.salesByProduct:view==='salesBuyer'?report?.salesByBuyer:view==='goodsIn'?report?.goodsIn:report?.transactions;

  return <main className="mx-auto max-w-[1600px] p-4 md:px-6 md:py-5">
    <p className="mb-2 text-sm text-emerald-700">Laporan / Operasional</p>
    <h1 className="text-3xl font-bold">Rekap</h1>
    <p className="mb-5 mt-2 text-slate-600">Pilih jenis laporan dan rentang tanggal untuk melihat data transaksi.</p>

    <section aria-label="Filter periode" className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 font-semibold">Periode</h2>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter tanggal cepat">
        {([
          ['today','Hari ini'],['week','7 hari terakhir'],['month','30 hari terakhir'],
        ] as const).map(([id,label])=><button key={id} type="button" aria-pressed={period===id}
          className={period===id?'':'!bg-white !text-slate-700 border border-slate-200'} onClick={()=>choosePeriod(id)}>{label}</button>)}
        <button type="button" aria-pressed={period==='custom'} className={period==='custom'?'':'!bg-white !text-slate-700 border border-slate-200'} onClick={()=>setPeriod('custom')}>Kustom</button>
      </div>
      <form className="flex flex-wrap items-end gap-3" onSubmit={event=>{event.preventDefault();if(from&&to&&from<=to){setPeriod('custom');void load(from,to,1);}}}>
        <label>Dari tanggal<input required type="date" value={from} max={to||undefined} onChange={event=>{setFrom(event.target.value);setPeriod('custom');}}/></label>
        <label>Sampai tanggal<input required type="date" value={to} min={from||undefined} max={today()} onChange={event=>{setTo(event.target.value);setPeriod('custom');}}/></label>
        <button type="submit" disabled={busy||!from||!to||from>to}>{busy?'Memuat…':'Terapkan tanggal'}</button>
      </form>
    </section>

    {error&&<p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-800">Rekap gagal dimuat: {error}</p>}
    <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Jenis tampilan rekap">
      {views.map(item=><button key={item.id} type="button" aria-pressed={view===item.id}
        className={view===item.id?'':'!bg-white !text-slate-700 border border-slate-200'} onClick={()=>chooseView(item.id)}>{item.label}</button>)}
    </div>

    {report&&<section aria-busy={busy} className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold">{views.find(item=>item.id===view)?.label}</h2>
          <p className="mt-1 text-sm text-slate-500">{dateLabel(report.from)} – {dateLabel(report.to)} · {rowCount} baris{busy?' · Memuat data terbaru…':''}</p>
        </div>
      </div>

      {view==='salesProduct'&&<div tabIndex={0} role="region" aria-label="Penjualan per barang, dapat digulir" className="table-scroll bg-white">
        <table className="purchase-sheet w-full min-w-[700px] text-sm"><thead className="bg-emerald-50 text-left"><tr><th>Barang</th><th>Merek</th><th>Jumlah terjual</th><th>Nilai penjualan</th><th>Jumlah nota</th></tr></thead><tbody>
          {report.salesByProduct.map(row=><tr key={row.product_id}><td>{row.product}</td><td>{row.brand}</td><td>{numberFormat.format(Number(row.quantity))} unit</td><td>{money(row.total)}</td><td>{row.notes}</td></tr>)}
          {!report.salesByProduct.length&&<tr><td colSpan={5}>Tidak ada penjualan barang dalam periode ini.</td></tr>}
        </tbody></table>
      </div>}

      {view==='salesBuyer'&&<div tabIndex={0} role="region" aria-label="Penjualan per pembeli, dapat digulir" className="table-scroll bg-white">
        <table className="purchase-sheet w-full min-w-[640px] text-sm"><thead className="bg-emerald-50 text-left"><tr><th>Pembeli</th><th>Jumlah barang</th><th>Total pembelian</th><th>Jumlah nota</th></tr></thead><tbody>
          {report.salesByBuyer.map(row=><tr key={row.customerName}><td>{row.customerName}</td><td>{numberFormat.format(Number(row.quantity))} unit</td><td>{money(row.total)}</td><td>{row.notes}</td></tr>)}
          {!report.salesByBuyer.length&&<tr><td colSpan={4}>Tidak ada penjualan per pembeli dalam periode ini.</td></tr>}
        </tbody></table>
      </div>}

      {view==='goodsIn'&&<div tabIndex={0} role="region" aria-label="Barang masuk dan harga beli, dapat digulir" className="table-scroll bg-white">
        <table className="purchase-sheet w-full min-w-[980px] text-sm"><thead className="bg-emerald-50 text-left"><tr><th>Tanggal</th><th>Kategori</th><th>Barang</th><th>Pemasok</th><th>Jumlah masuk</th><th>Harga beli / unit</th><th>Subtotal</th><th>No. nota</th></tr></thead><tbody>
          {report.goodsIn.map((row,index)=><tr key={`${row.transaksi_id}-${row.product}-${index}`}><td>{dateLabel(row.date)}</td><td>{row.category}</td><td>{row.product}</td><td>{row.party}</td><td>{numberFormat.format(Number(row.quantity))} {row.unit}</td><td>{money(row.unitPrice)}{row.unit==='kg'?' / kg':' / unit'}</td><td>{money(row.subtotal)}</td><td>#{row.transaksi_id}</td></tr>)}
          {!report.goodsIn.length&&<tr><td colSpan={8}>Tidak ada barang masuk pada periode ini.</td></tr>}
        </tbody></table>
      </div>}

      {view==='transactions'&&<div tabIndex={0} role="region" aria-label="Riwayat transaksi per nota, dapat digulir" className="table-scroll bg-white">
        <table className="purchase-sheet w-full min-w-[1120px] text-sm"><thead className="bg-emerald-50 text-left"><tr><th>Tanggal transaksi</th><th>Tanggal nota pabrik</th><th>No. nota</th><th>Kegiatan</th><th>Pembeli / pemasok</th><th>Status</th><th>Metode</th><th>Uang masuk</th><th>Uang keluar</th><th>Total nota</th></tr></thead><tbody>
          {report.transactions.map(row=><tr key={row.transaksi_id}><td>{dateLabel(row.date)}</td><td>{row.noteDate?dateLabel(row.noteDate):'—'}</td><td>#{row.transaksi_id}</td><td>{row.event}</td><td>{row.customerName||row.supplierName||'—'}</td><td>{row.status}</td><td>{row.method}</td><td>{money(row.masuk)}</td><td>{money(row.keluar)}</td><td>{money(row.total)}</td></tr>)}
          {!report.transactions.length&&<tr><td colSpan={10}>Tidak ada nota dalam periode ini.</td></tr>}
        </tbody></table>
      </div>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-slate-600">Halaman {report.page} dari {pageCount}</span>
        <div className="flex gap-2"><button type="button" className="!bg-white !text-slate-700 border border-slate-200" disabled={busy||report.page<=1} onClick={()=>void load(report.from,report.to,report.page-1)}>Sebelumnya</button>
          <button type="button" disabled={busy||report.page>=pageCount} onClick={()=>void load(report.from,report.to,report.page+1)}>Berikutnya</button></div>
      </div>
    </section>}
  </main>;
}
