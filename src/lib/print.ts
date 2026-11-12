'use client';

import { useCallback, useEffect, useState } from 'react';

export type LocalPrinter = {name:string;displayName?:string;description?:string;status?:string};
export type ReceiptData = {
  number:string;
  date:string;
  customer:string;
  title?:string;
  partyLabel?:string;
  items:{name:string;quantity:string|number;price:string;subtotal:string}[];
  total:string;
};

const agentUrl = 'http://localhost:5000';
const ESC=0x1b, GS=0x1d, LF=0x0a;
const encoder = new TextEncoder();

export async function checkPrintAgent() {
  const response=await fetch(`${agentUrl}/health`,{signal:AbortSignal.timeout(5000)});
  if(!response.ok) return false;
  const result=await response.json();
  return result.ok===true;
}

export async function getLocalPrinters():Promise<LocalPrinter[]> {
  const response=await fetch(`${agentUrl}/printers`,{signal:AbortSignal.timeout(10000)});
  if(!response.ok) throw new Error(`Gagal membaca printer (${response.status})`);
  return response.json();
}

function ascii(value:string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,'?');
}
function line(out:number[], value:string) { out.push(...encoder.encode(ascii(value)),LF); }
function columns(left:string,right:string,width=32) {
  const l=ascii(left),r=ascii(right);
  if(l.length+r.length>width) return [l,...wrap(r,width)].join('\n');
  return l+' '.repeat(width-l.length-r.length)+r;
}
function wrap(value:string,width=32) {
  const words=ascii(value).split(/\s+/);const rows:string[]=[];let row='';
  for(const word of words){
    if(word.length>width){if(row)rows.push(row);row='';for(let i=0;i<word.length;i+=width)rows.push(word.slice(i,i+width));continue;}
    if(row&&row.length+word.length+1>width){rows.push(row);row=word;}else row=row?`${row} ${word}`:word;
  }
  if(row)rows.push(row);return rows;
}
function receiptBytes(data:ReceiptData) {
  const out:number[]=[ESC,0x40,ESC,0x61,0x01];
  out.push(ESC,0x45,0x01);line(out,'SEMI JAYA');out.push(ESC,0x45,0x00);
  line(out,data.title||'KASIR MINUMAN');out.push(ESC,0x61,0x00);
  line(out,'='.repeat(32));line(out,columns('No. Transaksi',`#${data.number}`));line(out,columns('Tanggal',data.date));
  line(out,columns(data.partyLabel||'Pembeli',data.customer||'Umum'));line(out,'-'.repeat(32));
  for(const [index,item] of data.items.entries()){
    if(index>0) line(out,'');
    out.push(ESC,0x45,0x01);
    for(const part of wrap(item.name,32)) line(out,part);
    out.push(ESC,0x45,0x00);
    for(const part of wrap(`${item.quantity} x ${item.price}`,32)) line(out,part);
    for(const part of wrap(`Subtotal: ${item.subtotal}`,32)) line(out,part);
  }
  line(out,'-'.repeat(32));out.push(ESC,0x45,0x01);line(out,columns('TOTAL',data.total));out.push(ESC,0x45,0x00);
  line(out,'');out.push(ESC,0x61,0x01);line(out,'Terima kasih');line(out,'');line(out,'');line(out,'');
  out.push(ESC,0x61,0x00,GS,0x56,0x00);
  return new Uint8Array(out);
}

export async function sendReceipt(data:ReceiptData,printer:string) {
  if(!printer) throw new Error('Pilih printer terlebih dahulu.');
  const bytes=receiptBytes(data);
  const binary=Array.from(bytes,byte=>String.fromCharCode(byte)).join('');
  const response=await fetch(`${agentUrl}/job`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({data:btoa(binary),type:'RAW',printer}),
    signal:AbortSignal.timeout(60000),
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok||result.success!==true) throw new Error(result.error||`Cetak gagal (${response.status})`);
}

export function usePrintAgent() {
  const [online,setOnline]=useState(false);
  const [printers,setPrinters]=useState<LocalPrinter[]>([]);
  const [selected,setSelected]=useState('');
  const [checking,setChecking]=useState(true);
  const refresh=useCallback(async()=>{
    setChecking(true);
    try{
      if(!await checkPrintAgent()){setOnline(false);setPrinters([]);return;}
      const found=await getLocalPrinters();setPrinters(found);setOnline(true);
      const saved=typeof window==='undefined'?'':window.localStorage.getItem('homepos-printer')||'';
      const next=found.some(p=>p.name===saved)?saved:(found[0]?.name||'');
      setSelected(next);
      if(next)window.localStorage.setItem('homepos-printer',next);
    }catch{setOnline(false);setPrinters([]);}
    finally{setChecking(false);}
  },[]);
  useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),5000);return()=>clearInterval(timer);},[refresh]);
  function choose(name:string){setSelected(name);if(name)window.localStorage.setItem('homepos-printer',name);else window.localStorage.removeItem('homepos-printer');}
  return {online,printers,selected,checking,refresh,choose};
}
