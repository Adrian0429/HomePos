'use client';
import { useEffect, useRef, useState } from 'react';
import { rupiah, scaled, today } from '@/components/operation';

type Category='minuman'|'plastik';
type View='item'|'party'|'goodsIn'|'transactions';
type Period='today'|'week'|'month'|'custom';
type Supplier={supplier_id:number;supplier_name:string};
type PlasticOption={plastik_id:number;plastik_name:string};
type Buyer={customer_name:string};
type SalesProduct={product_id:number;product:string;brand:string;quantity:string;total:string;notes:number};
type SalesBuyer={customerName:string;quantity:string;total:string;notes:number};
type PlasticProduct={plastik_id:number;product:string;stok:string;masuk:string;dikirim:string;diterima:string;notes:number};
type PlasticPurchase={transaksi_id:number;date:string;supplier:string;quantity:string;unit_price:string;subtotal:string};
type GoodsIn={transaksi_id:number;date:string;category:string;product:string;unit:string;party:string;quantity:string;unitPrice:string;subtotal:string};
type Transaction={transaksi_id:number;date:string;noteDate:string|null;event:string;status:string;customerName:string|null;supplierName:string|null;method:string;masuk:string;keluar:string;total:string};
type Totals={sales:{quantity:string;total:string;notes:number};plastic:{masuk:string;dikirim:string;diterima:string;notes:number};goodsIn:{quantity:string;total:string;notes:number};transactions:{masuk:string;keluar:string;total:string;notes:number}};
type Report={from:string;to:string;category:Category;supplierId:number|null;plastikId:number|null;buyerName:string|null;movement:'purchase'|'shipment';suppliers:Supplier[];plastics:PlasticOption[];buyers:Buyer[];page:number;pageSize:number;counts:{salesProduct:number;salesBuyer:number;plasticProduct:number;goodsIn:number;transactions:number};totals:Totals;salesByProduct:SalesProduct[];salesByBuyer:SalesBuyer[];plasticByProduct:PlasticProduct[];goodsIn:GoodsIn[];transactions:Transaction[]};

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
  const [category,setCategory]=useState<Category>('minuman');
  const [supplierId,setSupplierId]=useState('');
  const [plastikId,setPlastikId]=useState('');
  const [movement,setMovement]=useState<'purchase'|'shipment'>('purchase');
  const [buyerName,setBuyerName]=useState('');
  const [view,setView]=useState<View>('item');
  const [report,setReport]=useState<Report|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [purchaseHistory,setPurchaseHistory]=useState<PlasticPurchase[]>([]);
  const [historyProduct,setHistoryProduct]=useState<PlasticProduct|null>(null);
  const [historyBusy,setHistoryBusy]=useState(false);
  const [historyError,setHistoryError]=useState('');
  const sequence=useRef(0);

  async function load(start:string,end:string,page=1,selectedCategory:Category=category,selectedSupplierId=supplierId,selectedBuyerName=buyerName,selectedPlastikId=plastikId,selectedMovement=movement){
    const seq=++sequence.current;setBusy(true);setError('');
    try{
      const params=new URLSearchParams({from:start,to:end,page:String(page),category:selectedCategory});
      if(selectedSupplierId)params.set('supplierId',selectedSupplierId);
      if(selectedBuyerName)params.set('buyerName',selectedBuyerName);
      if(selectedPlastikId)params.set('plastikId',selectedPlastikId);
      params.set('movement',selectedMovement);
      const response=await fetch(`/api/rekap?${params}`);
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
    setPeriod(next);setFrom(start);setTo(end);void load(start,end,1,category,supplierId,buyerName);
  }
  function chooseCategory(next:Category){
    const nextSupplierId=next==='minuman'?'':supplierId;
    const nextBuyerName=next==='plastik'?'':buyerName;
    setCategory(next);setSupplierId(nextSupplierId);setBuyerName(nextBuyerName);setView('item');
    const start=from||report?.from||today();const end=to||report?.to||today();
    setFrom(start);setTo(end);void load(start,end,1,next,nextSupplierId,nextBuyerName);
  }
  function chooseSupplier(next:string){setSupplierId(next);const start=report?.from||from||today();const end=report?.to||to||today();void load(start,end,1,category,next);}
  function chooseBuyer(next:string){setBuyerName(next);const start=report?.from||from||today();const end=report?.to||to||today();void load(start,end,1,category,supplierId,next);}
  function choosePlastic(next:string){setPlastikId(next);const start=report?.from||from||today();const end=report?.to||to||today();void load(start,end,1,category,supplierId,buyerName,next,movement);}
  function chooseMovement(next:'purchase'|'shipment'){setMovement(next);const start=report?.from||from||today();const end=report?.to||to||today();void load(start,end,1,category,supplierId,buyerName,plastikId,next);}
  function chooseView(next:View){setView(next);if(report)void load(report.from,report.to,1,category,supplierId,buyerName);}
  async function openPurchaseHistory(product:PlasticProduct){
    setHistoryProduct(product);setPurchaseHistory([]);setHistoryError('');setHistoryBusy(true);
    try{
      const response=await fetch(`/api/rekap/plastik/${product.plastik_id}/pembelian`);
      const data=await response.json();
      if(!response.ok)throw new Error(data.error??'Riwayat pembelian gagal dimuat');
      setPurchaseHistory(data);
    }catch(e){setHistoryError((e as Error).message);}
    finally{setHistoryBusy(false);}
  }
  useEffect(()=>{
    if(!historyProduct)return;
    const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==='Escape')setHistoryProduct(null);};
    window.addEventListener('keydown',closeOnEscape);
    return()=>window.removeEventListener('keydown',closeOnEscape);
  },[historyProduct]);
  const viewOptions:{id:View;label:string}[]=[
    {id:'item',label:category==='minuman'?'Penjualan per barang':'Stok Pergerakan Plastik'},
    ...(category==='minuman'?[{id:'party' as View,label:'Penjualan per pembeli'}]:[]),
    {id:'goodsIn',label:category==='plastik'?'Pembelian Plastik (Data Per Supplier)':'Barang masuk'},
    {id:'transactions',label:category==='plastik'?'Riwayat Transaksi Plastik Per Nota':'Riwayat per nota'},
  ];
  const countKey=category==='minuman'
    ?view==='item'?'salesProduct':view==='party'?'salesBuyer':view==='goodsIn'?'goodsIn':'transactions'
    :view==='item'?'plasticProduct':view==='goodsIn'?'goodsIn':'transactions';
  const rowCount=report?.counts[countKey]??0;
  const pageCount=report?Math.max(1,Math.ceil(rowCount/report.pageSize)):1;
  const metrics:{label:string;value:string}[]=[];
  if(report){
    const total=report.totals;
    if((view==='item'||view==='party')&&category==='minuman')metrics.push(
      {label:'Jumlah terjual',value:`${numberFormat.format(Number(total.sales.quantity))} unit`},
      {label:'Total penjualan',value:money(total.sales.total)},
      {label:'Jumlah nota',value:String(total.sales.notes)},
    );
    else if((view==='item'||view==='party')&&category==='plastik'){
      metrics.push({label:'Berat masuk',value:`${numberFormat.format(Number(total.plastic.masuk))} kg`},
        ...(supplierId?[]:[{label:'Berat dikirim',value:`${numberFormat.format(Number(total.plastic.dikirim))} kg`},{label:'Diterima pabrik',value:`${numberFormat.format(Number(total.plastic.diterima))} kg`}]),
        {label:'Jumlah nota',value:String(total.plastic.notes)});
    }
    else if(view==='goodsIn')metrics.push({label:'Jumlah barang masuk',value:`${numberFormat.format(Number(total.goodsIn.quantity))} ${category==='plastik'?'kg':'unit'}`},
      {label:'Total pembelian',value:money(total.goodsIn.total)},{label:'Jumlah nota',value:String(total.goodsIn.notes)});
    else metrics.push({label:'Uang masuk',value:money(total.transactions.masuk)},{label:'Uang keluar',value:money(total.transactions.keluar)},
      {label:'Total nota',value:money(total.transactions.total)},{label:'Jumlah nota',value:String(total.transactions.notes)});
  }

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
    <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Kategori rekap">
      <button type="button" aria-pressed={category==='minuman'} className={category==='minuman'?'':'!bg-white !text-slate-700 border border-slate-200'} onClick={()=>chooseCategory('minuman')}>Minuman</button>
      <button type="button" aria-pressed={category==='plastik'} className={category==='plastik'?'':'!bg-white !text-slate-700 border border-slate-200'} onClick={()=>chooseCategory('plastik')}>Plastik</button>
    </div>
    {category==='plastik'&&<section aria-label="Filter pembelian plastik" className="mb-4 grid max-w-3xl gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <label>Filter jenis plastik
        <select value={plastikId} onChange={event=>choosePlastic(event.target.value)}>
          <option value="">Semua jenis plastik</option>
          {(report?.plastics??[]).map(plastic=><option key={plastic.plastik_id} value={plastic.plastik_id}>{plastic.plastik_name}</option>)}
        </select>
      </label>
      <label>Filter pemasok / supplier
        <select value={supplierId} onChange={event=>chooseSupplier(event.target.value)}>
          <option value="">Semua pemasok</option>
          {(report?.suppliers??[]).map(supplier=><option key={supplier.supplier_id} value={supplier.supplier_id}>{supplier.supplier_name}</option>)}
        </select>
      </label>
      {supplierId&&<p className="mt-2 text-xs text-slate-500">Filter supplier menampilkan pembelian dari supplier tersebut. Pengiriman ke pabrik tidak mencatat asal supplier.</p>}
    </section>}
    {category==='minuman'&&<section aria-label="Filter pembeli minuman" className="mb-4 max-w-md rounded-xl border border-slate-200 bg-white p-4">
      <label>Filter pembeli
        <select value={buyerName} onChange={event=>chooseBuyer(event.target.value)}>
          <option value="">Semua pembeli</option>
          {(report?.buyers??[]).map(buyer=><option key={buyer.customer_name} value={buyer.customer_name}>{buyer.customer_name}</option>)}
        </select>
      </label>
      {buyerName&&view==='goodsIn'&&<p className="mt-2 text-xs text-slate-500">Filter pembeli berlaku untuk penjualan dan riwayat nota; barang masuk tidak terkait dengan pembeli.</p>}
    </section>}
    <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Jenis tampilan rekap">
      {viewOptions.map(item=><button key={item.id} type="button" aria-pressed={view===item.id}
        className={view===item.id?'':'!bg-white !text-slate-700 border border-slate-200'} onClick={()=>chooseView(item.id)}>{item.label}</button>)}
    </div>

    {report&&<section aria-busy={busy} className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold">{category==='plastik'&&(view==='goodsIn'||view==='transactions')?viewOptions.find(item=>item.id===view)?.label:`${viewOptions.find(item=>item.id===view)?.label} · ${category==='minuman'?'Minuman':'Plastik'}`}</h2>
          <p className="mt-1 text-sm text-slate-500">{dateLabel(report.from)} – {dateLabel(report.to)} · {rowCount} baris{busy?' · Memuat data terbaru…':''}</p>
        </div>
        {category==='plastik'&&view==='transactions'&&<div className="flex flex-wrap gap-2" role="group" aria-label="Jenis riwayat transaksi plastik">
          <button type="button" aria-pressed={movement==='purchase'} className={movement==='purchase'?'':'!bg-white !text-slate-700 border border-slate-200'} onClick={()=>chooseMovement('purchase')}>Pembelian Plastik</button>
          <button type="button" aria-pressed={movement==='shipment'} className={movement==='shipment'?'':'!bg-white !text-slate-700 border border-slate-200'} onClick={()=>chooseMovement('shipment')}>Pengiriman Pabrik</button>
        </div>}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(metric=><div key={metric.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-500">{metric.label}</p><p className="mt-1 font-semibold tabular-nums">{metric.value}</p>
        </div>)}
      </div>

      {view==='item'&&category==='minuman'&&<div tabIndex={0} role="region" aria-label="Penjualan minuman per barang, dapat digulir" className="table-scroll bg-white">
        <table className="purchase-sheet w-full min-w-[700px] text-sm"><thead className="bg-emerald-50 text-left"><tr><th>Barang</th><th>Merek</th><th>Jumlah terjual</th><th>Nilai penjualan</th><th>Jumlah nota</th></tr></thead><tbody>
          {report.salesByProduct.map(row=><tr key={row.product_id}><td>{row.product}</td><td>{row.brand}</td><td>{numberFormat.format(Number(row.quantity))} unit</td><td>{money(row.total)}</td><td>{row.notes}</td></tr>)}
          {!report.salesByProduct.length&&<tr><td colSpan={5}>Tidak ada penjualan barang dalam periode ini.</td></tr>}
        </tbody><tfoot className="bg-emerald-50 font-bold"><tr><td colSpan={2}>TOTAL SELURUH FILTER</td><td>{numberFormat.format(Number(report.totals.sales.quantity))} unit</td><td>{money(report.totals.sales.total)}</td><td>{report.totals.sales.notes}</td></tr></tfoot></table>
      </div>}

      {view==='item'&&category==='plastik'&&<div tabIndex={0} role="region" aria-label="Pergerakan plastik per barang, dapat digulir" className="table-scroll bg-white">
        <table className="purchase-sheet w-full min-w-[1000px] text-sm"><thead className="bg-emerald-50 text-left"><tr><th>Jenis plastik</th><th>Stok saat ini</th><th>Berat masuk</th>{!supplierId&&<><th>Berat dikirim</th><th>Diterima pabrik</th></>}<th>Jumlah nota</th><th>Aksi</th></tr></thead><tbody>
          {report.plasticByProduct.map(row=><tr key={row.plastik_id}><td>{row.product}</td><td>{numberFormat.format(Number(row.stok))} kg</td><td>{numberFormat.format(Number(row.masuk))} kg</td>{!supplierId&&<><td>{numberFormat.format(Number(row.dikirim))} kg</td><td>{numberFormat.format(Number(row.diterima))} kg</td></>}<td>{row.notes}</td><td><button type="button" className="!px-3 !py-1.5 text-xs" onClick={()=>void openPurchaseHistory(row)}>Riwayat beli</button></td></tr>)}
          {!report.plasticByProduct.length&&<tr><td colSpan={supplierId?5:7}>Tidak ada pergerakan plastik dalam periode ini.</td></tr>}
        </tbody><tfoot className="bg-emerald-50 font-bold"><tr><td>TOTAL SELURUH FILTER</td><td>—</td><td>{numberFormat.format(Number(report.totals.plastic.masuk))} kg</td>{!supplierId&&<><td>{numberFormat.format(Number(report.totals.plastic.dikirim))} kg</td><td>{numberFormat.format(Number(report.totals.plastic.diterima))} kg</td></>}<td>{report.totals.plastic.notes}</td><td/></tr></tfoot></table>
      </div>}

      {view==='party'&&category==='minuman'&&<div tabIndex={0} role="region" aria-label="Penjualan per pembeli, dapat digulir" className="table-scroll bg-white">
        <table className="purchase-sheet w-full min-w-[640px] text-sm"><thead className="bg-emerald-50 text-left"><tr><th>Pembeli</th><th>Jumlah barang</th><th>Total pembelian</th><th>Jumlah nota</th></tr></thead><tbody>
          {report.salesByBuyer.map(row=><tr key={row.customerName}><td>{row.customerName}</td><td>{numberFormat.format(Number(row.quantity))} unit</td><td>{money(row.total)}</td><td>{row.notes}</td></tr>)}
          {!report.salesByBuyer.length&&<tr><td colSpan={4}>Tidak ada penjualan per pembeli dalam periode ini.</td></tr>}
        </tbody><tfoot className="bg-emerald-50 font-bold"><tr><td>TOTAL SELURUH FILTER</td><td>{numberFormat.format(Number(report.totals.sales.quantity))} unit</td><td>{money(report.totals.sales.total)}</td><td>{report.totals.sales.notes}</td></tr></tfoot></table>
      </div>}

      {view==='goodsIn'&&<div tabIndex={0} role="region" aria-label={`Barang masuk ${category}, termasuk harga beli, dapat digulir`} className="table-scroll bg-white">
        <table className="purchase-sheet w-full min-w-[900px] text-sm"><thead className="bg-emerald-50 text-left"><tr><th>Tanggal</th>{category==='minuman'&&<th>Kategori</th>}<th>Barang</th><th>Pemasok</th><th>Jumlah masuk</th><th>Harga beli / unit</th><th>Subtotal</th><th>No. nota</th></tr></thead><tbody>
          {report.goodsIn.map((row,index)=><tr key={`${row.transaksi_id}-${row.product}-${index}`}><td>{dateLabel(row.date)}</td>{category==='minuman'&&<td>{row.category}</td>}<td>{row.product}</td><td>{row.party}</td><td>{numberFormat.format(Number(row.quantity))} {row.unit}</td><td>{money(row.unitPrice)}{row.unit==='kg'?' / kg':' / unit'}</td><td>{money(row.subtotal)}</td><td>#{row.transaksi_id}</td></tr>)}
          {!report.goodsIn.length&&<tr><td colSpan={category==='plastik'?7:8}>Tidak ada barang masuk pada periode ini.</td></tr>}
        </tbody><tfoot className="bg-emerald-50 font-bold"><tr><td colSpan={category==='plastik'?3:4}>TOTAL SELURUH FILTER</td><td>{numberFormat.format(Number(report.totals.goodsIn.quantity))} {category==='plastik'?'kg':'unit'}</td><td>—</td><td>{money(report.totals.goodsIn.total)}</td><td>{report.totals.goodsIn.notes}</td></tr></tfoot></table>
      </div>}

      {view==='transactions'&&<div tabIndex={0} role="region" aria-label={`Riwayat nota ${category}, dapat digulir`} className="table-scroll bg-white">
        <table className="purchase-sheet w-full min-w-[1120px] text-sm"><thead className="bg-emerald-50 text-left"><tr><th>Tanggal transaksi</th><th>Tanggal nota pabrik</th><th>No. nota</th><th>Kegiatan</th><th>Pembeli / pemasok</th><th>Status</th><th>Metode</th><th>Uang masuk</th><th>Uang keluar</th><th>Total nota</th></tr></thead><tbody>
          {report.transactions.map(row=><tr key={row.transaksi_id}><td>{dateLabel(row.date)}</td><td>{row.noteDate?dateLabel(row.noteDate):'—'}</td><td>#{row.transaksi_id}</td><td>{row.event}</td><td>{row.customerName||row.supplierName||(category==='plastik'&&row.event==='Kirim Pabrik'?'Pabrik':'—')}</td><td>{row.status}</td><td>{row.method}</td><td>{money(row.masuk)}</td><td>{money(row.keluar)}</td><td>{money(row.total)}</td></tr>)}
          {!report.transactions.length&&<tr><td colSpan={10}>Tidak ada nota dalam periode ini.</td></tr>}
        </tbody><tfoot className="bg-emerald-50 font-bold"><tr><td colSpan={7}>TOTAL SELURUH FILTER · {report.totals.transactions.notes} nota</td><td>{money(report.totals.transactions.masuk)}</td><td>{money(report.totals.transactions.keluar)}</td><td>{money(report.totals.transactions.total)}</td></tr></tfoot></table>
      </div>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-slate-600">Halaman {report.page} dari {pageCount}</span>
        <div className="flex gap-2"><button type="button" className="!bg-white !text-slate-700 border border-slate-200" disabled={busy||report.page<=1} onClick={()=>void load(report.from,report.to,report.page-1,category,supplierId)}>Sebelumnya</button>
          <button type="button" disabled={busy||report.page>=pageCount} onClick={()=>void load(report.from,report.to,report.page+1,category,supplierId)}>Berikutnya</button></div>
      </div>
    </section>}
    {historyProduct&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={event=>{if(event.target===event.currentTarget)setHistoryProduct(null);}}>
      <section role="dialog" aria-modal="true" aria-labelledby="plastic-purchase-history-title" className="max-h-[90dvh] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div><p className="text-sm text-emerald-700">Riwayat pembelian semua periode</p><h2 id="plastic-purchase-history-title" className="mt-1 text-xl font-bold">{historyProduct.product}</h2></div>
          <button type="button" className="!bg-slate-100 !px-3 !py-1.5 !text-slate-700" aria-label="Tutup riwayat pembelian" onClick={()=>setHistoryProduct(null)}>Tutup</button>
        </header>
        <div className="p-5">
          {historyBusy&&<p role="status" className="py-8 text-center text-slate-500">Memuat riwayat pembelian…</p>}
          {historyError&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{historyError}</p>}
          {!historyBusy&&!historyError&&!purchaseHistory.length&&<p className="rounded-lg bg-slate-50 p-5 text-slate-600">Belum ada riwayat pembelian untuk jenis plastik ini.</p>}
          {!historyBusy&&!historyError&&!!purchaseHistory.length&&<div className="table-scroll rounded-lg border border-slate-200">
            <table className="purchase-sheet w-full min-w-[700px] border-collapse text-sm"><thead className="bg-emerald-50 text-left"><tr><th>Tanggal</th><th>Supplier</th><th>Jumlah beli</th><th>Harga beli / kg</th></tr></thead><tbody>
              {purchaseHistory.map(row=><tr key={`${row.transaksi_id}-${row.date}-${row.supplier}`}><td>{dateLabel(row.date)}</td><td>{row.supplier}</td><td>{numberFormat.format(Number(row.quantity))} kg</td><td>{money(row.unit_price)} / kg</td></tr>)}
            </tbody></table>
          </div>}
        </div>
      </section>
    </div>}
  </main>;
}
