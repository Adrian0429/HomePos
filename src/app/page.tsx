'use client';
import MoneyInput from '@/components/money-input';
import { useEffect, useState, type FormEvent } from 'react';
import { decimalDisplay, lineTotal, rupiah } from '@/components/operation';
type Plastic = {plastik_id:number; plastik_name:string; stok:string};
type Method = {method_id:number; payment_method:string};
type Detail = {detail_transaksi_plastik_id:number; plastik_id:number; berat_kirim:string};
type Shipment = {transaksi_id:number; items:Detail[]};
type Draft = {plastikId:string; beratKirim:string};
async function api(path:string, init?:RequestInit) {
  const response = await fetch(path, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Permintaan gagal');
  return data;
}
const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Jayapura',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export default function Home() {
  const [plastics,setPlastics] = useState<Plastic[]>([]);
  const [methods,setMethods] = useState<Method[]>([]);
  const [pending,setPending] = useState<Shipment[]>([]);
  const [date,setDate] = useState('');
  const [section,setSection] = useState<1|2>(1);
  const [lines,setLines] = useState<Draft[]>([{plastikId:'',beratKirim:''}]);
  const [selected,setSelected] = useState('');
  const [nota,setNota] = useState<Record<number,{beratDiterima:string;hargaSatuan:string}>>({});
  const [method,setMethod] = useState('');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [loaded,setLoaded] = useState(false);
  const shipment = pending.find(t => String(t.transaksi_id) === selected);
  async function refresh() {
    const [catalog,transactions] = await Promise.all([api('/api/catalog'),api('/api/transactions')]);
    setPlastics(catalog.plastik); setMethods(catalog.methods); setPending(transactions); setLoaded(true);
  }
  useEffect(() => { setDate(today()); refresh().catch(e => setMessage(e.message)); }, []);
  async function submit(event:FormEvent, stage:1|2) {
    event.preventDefault();
    if(stage===2&&!method){setMessage('Pilih metode pembayaran terlebih dahulu.');return;}
    setBusy(true); setMessage('');
    let saved = false;
    try {
      const result = stage === 1
        ? await api('/api/transactions', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
            type:'Kirim Pabrik',transactionDate:date,items:lines.map(l => ({plastikId:Number(l.plastikId),beratKirim:l.beratKirim}))
          })})
        : await api(`/api/transactions/${selected}/settle`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({
            methodId:Number(method),
            items:shipment!.items.map(d => ({detailId:d.detail_transaksi_plastik_id,...nota[d.detail_transaksi_plastik_id]}))
          })});
      saved = true;
      if (stage === 1) setLines([{plastikId:'',beratKirim:''}]);
      else { setSelected(''); setNota({}); setMethod(''); }
      setMessage(`Transaksi #${result.transaksi_id} tersimpan — ${result.status}. Total Rp ${result.total_nominal}.`);
      await refresh();
    } catch (e) {
      setMessage(saved ? 'Transaksi tersimpan, tetapi pemuatan ulang gagal. Muat ulang halaman; jangan kirim ulang.' : (e as Error).message);
    } finally { setBusy(false); }
  }
  const totalNota = (shipment?.items ?? []).reduce((sum,d) => {
    const row=nota[d.detail_transaksi_plastik_id];
    return sum+lineTotal(row?.beratDiterima??'',row?.hargaSatuan??'');
  },0n);
  return <main className="mx-auto max-w-[1600px] p-4 md:px-6 md:py-5">
    <p className="mb-2 text-sm text-emerald-700">Gudang / Pengiriman</p>
    <h1 className="text-3xl font-bold">Pengiriman ke pabrik</h1>
    <p className="mb-5 mt-2 text-slate-600">Catat truk berangkat, lalu selesaikan transaksi saat nota pabrik diterima.</p>
    {message && <p role="status" className="mb-5 rounded-xl border border-emerald-200 bg-white p-4">{message}</p>}
    <div className="mb-5 flex flex-wrap gap-2" aria-label="Tahap pengiriman" >
      <button type="button" aria-pressed={section===1} disabled={busy} className={section===1?'ring-2 ring-emerald-700 ring-offset-2':'!bg-white !text-slate-600 border border-slate-200'} onClick={()=>setSection(1)}>01 · Truk berangkat</button>
      <button type="button" aria-pressed={section===2} disabled={busy} className={section===2?'ring-2 ring-emerald-700 ring-offset-2':'!bg-white !text-slate-600 border border-slate-200'} onClick={()=>setSection(2)}>02 · Nota pabrik ({pending.length})</button>
    </div>
    {!loaded&&<p role="status" className="mb-4 text-sm text-slate-500">Katalog belum tersedia. <button type="button" onClick={()=>refresh().catch(e=>setMessage(e.message))}>Muat ulang</button></p>}
    <div>
      <form hidden={section!==1} onSubmit={e => submit(e,1)} className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-lg font-semibold">01 · Truk berangkat</h2>
        <p className="mb-3 text-sm text-slate-500">Stok berkurang sesuai berat kirim. Nilai transaksi masih Rp 0.</p>
        <fieldset disabled={busy || !loaded} className="space-y-3">
          <label className="max-w-sm">Tanggal pengiriman<input required type="date" value={date} max={today()} onChange={e => setDate(e.target.value)}/></label>
          <div tabIndex={0} role="region" aria-label="Rincian pengiriman, dapat digulir" className="table-scroll border border-slate-300 bg-white">
            <table className="purchase-sheet w-full min-w-[620px] border-collapse text-sm">
              <caption className="sr-only">Rincian truk berangkat</caption>
              <thead className="bg-emerald-50 text-left"><tr><th scope="col" className="w-12">No.</th><th scope="col">Jenis plastik</th><th scope="col" className="w-56">Berat kirim (kg)</th><th scope="col" className="w-24">Aksi</th></tr></thead>
              <tbody>{lines.map((line,index) => <tr key={index}>
                <th scope="row" className="bg-slate-50 text-center font-normal">{index+1}</th>
                <td><select aria-label={`Jenis plastik baris ${index+1}`} required value={line.plastikId} onChange={e => setLines(lines.map((l,i) => i===index ? {...l,plastikId:e.target.value}:l))}>
                  <option value="">Pilih plastik</option>{plastics.map(p => <option key={p.plastik_id} value={p.plastik_id} disabled={lines.some((l,i)=>i!==index&&l.plastikId===String(p.plastik_id))}>{p.plastik_name} · {decimalDisplay(p.stok)} kg tersedia</option>)}
                </select></td>
                <td><input aria-label={`Berat kirim baris ${index+1} (kg)`} required type="number" min="0.01" step="0.01" max="999999999" value={line.beratKirim} onChange={e => setLines(lines.map((l,i) => i===index ? {...l,beratKirim:e.target.value}:l))}/></td>
                <td><button type="button" className="delete-button" aria-label={`Hapus baris ${index+1}`} onClick={() => setLines(previous=>previous.length===1?[{plastikId:'',beratKirim:''}]:previous.filter((_,i)=>i!==index))}>Hapus</button></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-between gap-3">
            <button type="button" disabled={lines.length>=Math.min(plastics.length,100)} onClick={() => setLines([...lines,{plastikId:'',beratKirim:''}])}>+ Tambah baris</button>
            <button disabled={!plastics.length} type="submit">Simpan pengiriman</button>
          </div>
        </fieldset>
      </form>
      <form hidden={section!==2} onSubmit={e => submit(e,2)} className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-lg font-semibold">02 · Nota pabrik turun</h2>
        <p className="mb-3 text-sm text-slate-500">Nilai dihitung dari berat diterima × harga pabrik. Stok tetap.</p>
        <fieldset disabled={busy || !loaded} className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <label>Pengiriman menunggu nota<select required value={selected} onChange={e => {setSelected(e.target.value);setNota({});}}>
              <option value="">Pilih pengiriman</option>{pending.map(t => <option key={t.transaksi_id} value={t.transaksi_id}>Pengiriman #{t.transaksi_id}</option>)}
            </select></label>
            <label>Metode bayar<select required value={method} onChange={e => setMethod(e.target.value)}><option value="">Pilih metode bayar</option>{methods.map(m => <option key={m.method_id} value={m.method_id}>{m.payment_method}</option>)}</select></label>
          </div>
          <div tabIndex={0} role="region" aria-label="Rincian nota pabrik, dapat digulir" className="table-scroll border border-slate-300 bg-white">
            <table className="purchase-sheet w-full min-w-[800px] border-collapse text-sm">
              <caption className="sr-only">Rincian nota pabrik</caption>
              <thead className="bg-emerald-50 text-left"><tr><th scope="col" className="w-12">No.</th><th scope="col">Jenis plastik</th><th scope="col" className="w-36">Berat kirim (kg)</th><th scope="col" className="w-44">Berat diterima (kg)</th><th scope="col" className="w-44">Harga / kg (Rp)</th><th scope="col" className="w-48">Subtotal</th></tr></thead>
              <tbody>{shipment?.items.map((d,index) => <tr key={d.detail_transaksi_plastik_id}>
                <th scope="row" className="bg-slate-50 text-center font-normal">{index+1}</th>
                <td>{plastics.find(p => p.plastik_id===d.plastik_id)?.plastik_name}</td>
                <td className="text-right tabular-nums">{decimalDisplay(d.berat_kirim)}</td>
                {(['beratDiterima','hargaSatuan'] as const).map(field => <td key={field}>
                  {field==='hargaSatuan'
                    ? <MoneyInput aria-label={`Harga per kg nota baris ${index+1}`} required value={nota[d.detail_transaksi_plastik_id]?.hargaSatuan??''} onValueChange={value=>setNota({...nota,[d.detail_transaksi_plastik_id]:{...nota[d.detail_transaksi_plastik_id],hargaSatuan:value}})}/>
                    : <input aria-label={`Berat diterima nota baris ${index+1}`} required type="number" min="0" max="999999999" step="0.01" value={nota[d.detail_transaksi_plastik_id]?.beratDiterima??''} onChange={e=>setNota({...nota,[d.detail_transaksi_plastik_id]:{...nota[d.detail_transaksi_plastik_id],beratDiterima:e.target.value}})}/>}

                </td>)}
                <td className="whitespace-nowrap text-right tabular-nums"><output>{rupiah(lineTotal(nota[d.detail_transaksi_plastik_id]?.beratDiterima??'',nota[d.detail_transaksi_plastik_id]?.hargaSatuan??''))}</output></td>
              </tr>)}
              {!shipment&&<tr><td colSpan={6} className="text-center text-slate-500">{loaded&&!pending.length?'Belum ada pengiriman menunggu nota.':'Pilih pengiriman untuk mengisi nota pabrik.'}</td></tr>}
              </tbody>
              <tfoot className="bg-emerald-50 font-bold"><tr><td colSpan={5} className="text-right">Total nota</td><td className="whitespace-nowrap text-right tabular-nums"><output>{rupiah(totalNota)}</output></td></tr></tfoot>
            </table>
          </div>
          <div className="flex justify-end"><button disabled={!shipment || busy} type="submit">Selesaikan nota pabrik</button></div>
        </fieldset>
      </form>
    </div>
    <p className="mt-5 text-xs text-slate-500">Tanggal nota menggunakan zona waktu Asia/Jayapura. Selesai berarti nota diterima; pencatatan pelunasan piutang terpisah belum termasuk.</p>
  </main>;
}
