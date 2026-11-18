'use client';
import { useCallback, useEffect, useState } from 'react';
import MoneyInput from '@/components/money-input';
import { rupiah, scaled } from '@/components/operation';

type Debt={transaksi_id:number;transaction_date:string;debt_due_date:string;debt_kind:'restock'|'customer';customer_name:string|null;total_nominal:string;debt_paid:string;items:{name:string;brand:string;quantity:number;unitPrice:string;subtotal:string}[]};
type Product={product_id:number;product_name:string;brand_name:string;stok:number;debt_stock:number;non_debt_stock:number};
type Data={debts:Debt[];products:Product[];stockTotals:{total:number;debt:number;nonDebt:number}};
const money=(value:string|number)=>rupiah(scaled(String(value),2));
const date=(value:string)=>new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeZone:'Asia/Jayapura'}).format(new Date(`${value}T00:00:00+09:00`));

export default function PiutangPage(){
  const [data,setData]=useState<Data>({debts:[],products:[],stockTotals:{total:0,debt:0,nonDebt:0}});
  const [kind,setKind]=useState<'restock'|'customer'>('restock');
  const [payments,setPayments]=useState<Record<number,string>>({});
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const load=useCallback(async()=>{
    const response=await fetch('/api/piutang');const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Data piutang gagal dimuat');
    setData(result);
  },[]);
  useEffect(()=>{void load().catch(e=>setMessage(e.message));},[load]);
  async function pay(debt:Debt,amount:string){
    setBusy(true);setMessage('');
    try{const response=await fetch(`/api/piutang/${debt.transaksi_id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Pembayaran gagal disimpan');setMessage(Number(result.total_nominal)===Number(result.debt_paid)?`Piutang #${debt.transaksi_id} lunas.`:`Pembayaran piutang #${debt.transaksi_id} tersimpan.`);setPayments(previous=>({...previous,[debt.transaksi_id]:''}));await load();}
    catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
  }
  const debts=data.debts.filter(item=>item.debt_kind===kind);
  const outstanding=debts.reduce((sum,item)=>sum+Number(item.total_nominal)-Number(item.debt_paid),0);
  const stock=data.stockTotals;
  return <main className="mx-auto max-w-[1600px] space-y-5 p-4 md:px-6 md:py-5">
    <header><p className="mb-2 text-sm text-emerald-700">Warung / Keuangan</p><h1 className="text-3xl font-bold">Hutang &amp; Piutang</h1><p className="mt-2 text-slate-600">Pantau tagihan pembelian restok dan hutang konsumen, serta stok minuman yang masih terkait dengan restok belum lunas.</p></header>
    {message&&<p role="status" className="rounded-xl border border-emerald-200 bg-white p-4">{message}</p>}
    <section aria-label="Ringkasan stok minuman" className="grid gap-3 sm:grid-cols-3">
      {[['Total stok minuman',stock.total],['Stok dari restok belum lunas',stock.debt],['Stok lainnya / bukan hutang',stock.nonDebt]].map(([label,value])=><article key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold">{Number(value).toLocaleString('id-ID')} <span className="text-base font-medium">unit</span></p></article>)}
    </section>
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Piutang berjalan</h2><p className="mt-1 text-sm text-slate-500">Sisa tagihan: {money(outstanding)}</p></div><div className="flex flex-wrap gap-2" role="group" aria-label="Jenis piutang">
        <button type="button" className={kind==='restock'?'':'!bg-white !text-slate-700 border border-slate-200'} onClick={()=>setKind('restock')}>Hutang restok</button>
        <button type="button" className={kind==='customer'?'':'!bg-white !text-slate-700 border border-slate-200'} onClick={()=>setKind('customer')}>Hutang konsumen</button>
      </div></div>
      {!debts.length?<p className="rounded-lg bg-slate-50 p-5 text-slate-600">Tidak ada {kind==='restock'?'hutang restok':'hutang konsumen'} yang belum lunas.</p>:<div className="table-scroll rounded-lg border border-slate-200"><table className="w-full min-w-[850px] border-collapse text-sm"><thead className="bg-emerald-50 text-left"><tr><th className="p-3">Nota / Pihak</th><th className="p-3">Tanggal / Jatuh tempo</th><th className="p-3">Rincian barang</th><th className="p-3 text-right">Total / Dibayar</th><th className="p-3 text-right">Sisa hutang</th><th className="p-3">Pembayaran</th></tr></thead><tbody>
        {debts.map(debt=>{const remaining=Number(debt.total_nominal)-Number(debt.debt_paid);return <tr key={debt.transaksi_id} className="border-t border-slate-200 align-top"><td className="p-3"><strong>#{debt.transaksi_id}</strong><span className="mt-1 block">{kind==='restock'?'Pembelian restok':debt.customer_name}</span></td><td className="whitespace-nowrap p-3">{date(debt.transaction_date)}<span className="mt-1 block text-slate-500">Tempo {date(debt.debt_due_date)}</span></td><td className="p-3">{debt.items.map((item,index)=><p key={index}>{item.name} · {item.quantity} unit · {money(item.subtotal)}</p>)}</td><td className="whitespace-nowrap p-3 text-right">{money(debt.total_nominal)}<span className="mt-1 block text-slate-500">Dibayar {money(debt.debt_paid)}</span></td><td className="whitespace-nowrap p-3 text-right font-semibold">{money(remaining)}</td><td className="w-56 p-3"><MoneyInput aria-label={`Nominal pembayaran hutang nota ${debt.transaksi_id}`} value={payments[debt.transaksi_id]||''} onValueChange={value=>setPayments(previous=>({...previous,[debt.transaksi_id]:value}))}/><div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={busy||!payments[debt.transaksi_id]} onClick={()=>void pay(debt,payments[debt.transaksi_id])}>Catat bayar</button><button type="button" disabled={busy} className="!bg-emerald-100 !text-emerald-900" onClick={()=>void pay(debt,remaining.toFixed(2))}>Tandai lunas</button></div></td></tr>})}
      </tbody><tfoot className="bg-emerald-50 font-bold"><tr><td colSpan={4} className="p-3 text-right">TOTAL SISA {kind==='restock'?'HUTANG RESTOK':'HUTANG KONSUMEN'}</td><td className="whitespace-nowrap p-3 text-right">{money(outstanding)}</td><td/></tr></tfoot></table></div>}
    </section>
    <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="text-xl font-semibold">Rincian stok minuman</h2><p className="mb-4 mt-1 text-sm text-slate-500">Unit dari nota restok yang belum lunas dihitung sebagai stok hutang. Stok awal, stok yang dibeli tunai, atau stok dari restok yang sudah lunas dihitung sebagai stok lainnya.</p><div className="table-scroll rounded-lg border border-slate-200"><table className="w-full min-w-[650px] border-collapse text-sm"><thead className="bg-emerald-50 text-left"><tr><th className="p-3">Produk</th><th className="p-3 text-right">Total stok</th><th className="p-3 text-right">Stok hutang</th><th className="p-3 text-right">Stok lainnya</th></tr></thead><tbody>{data.products.map(product=><tr key={product.product_id} className="border-t border-slate-200"><td className="p-3">{product.product_name}<span className="ml-2 text-slate-500">{product.brand_name}</span></td><td className="p-3 text-right">{product.stok} unit</td><td className="p-3 text-right">{product.debt_stock} unit</td><td className="p-3 text-right">{product.non_debt_stock} unit</td></tr>)}</tbody><tfoot className="bg-emerald-50 font-bold"><tr><td className="p-3">TOTAL</td><td className="p-3 text-right">{stock.total} unit</td><td className="p-3 text-right">{stock.debt} unit</td><td className="p-3 text-right">{stock.nonDebt} unit</td></tr></tfoot></table></div></section>
  </main>;
}
