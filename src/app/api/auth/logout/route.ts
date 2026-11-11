import { cookies } from 'next/headers';
import { deleteSession } from '@/lib/session';
export const runtime = 'nodejs';
export async function POST() {
  const store = await cookies();
  await deleteSession(store.get('homepos_session')?.value);
  store.delete('homepos_session');
  return Response.json({ok:true});
}
