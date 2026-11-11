import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/session';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get('homepos_session')?.value;

  if (!(await isAuthenticated(token))) {
    redirect('/login');
  }

  return children;
}
