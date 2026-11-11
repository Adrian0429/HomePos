'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:form.get('username'),password:form.get('password')})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Login gagal');
      router.replace('/'); router.refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-[calc(100dvh-60px)] items-center justify-center px-4 py-10">
    <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <p className="mb-2 text-sm font-semibold uppercase tracking-[.16em] text-emerald-700">HomePOS</p>
      <h1 className="text-3xl font-bold">Selamat datang</h1>
      <p className="mb-7 mt-2 text-slate-600">Masuk untuk mengelola kasir dan gudang.</p>
      <form onSubmit={submit} className="space-y-5">
        <label>Username<input name="username" autoComplete="username" required autoFocus/></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required/></label>
        {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button className="w-full" disabled={busy}>{busy?'Memeriksa…':'Masuk'}</button>
      </form>
    </section>
  </main>;
}
