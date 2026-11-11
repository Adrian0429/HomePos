'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
export default function Navigation() {
  const path=usePathname();
  const [busy,setBusy]=useState(false);
  if(path==='/login') return null;
  async function logout(){setBusy(true);await fetch('/api/auth/logout',{method:'POST'});window.location.assign('/login');}
  return <header className="border-b border-slate-200 bg-white"><nav aria-label="Modul operasional" className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3 md:px-6">
    <span className="mr-auto font-bold text-emerald-800">HomePOS</span>
    {[['/pos','Kasir Minuman'],['/restok','Restok Minuman'],['/beli-plastik','Beli Plastik'],['/','Kirim Pabrik'],['/master','Master Barang'],['/rekap','Rekap']].map(([href,label])=><Link key={href} href={href} aria-current={path===href?'page':undefined} className={`rounded-lg px-4 py-2 text-sm font-semibold ${path===href?'bg-emerald-800 text-white':'text-slate-600 hover:bg-slate-100'}`}>{label}</Link>)}
    <button type="button" className="ml-auto !bg-slate-100 !text-slate-700" disabled={busy} onClick={logout}>Keluar</button>
  </nav></header>;
}
