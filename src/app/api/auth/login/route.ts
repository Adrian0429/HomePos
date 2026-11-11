import { cookies } from 'next/headers';
import { pool } from '@/lib/db';
import { createSession, verifyPassword } from '@/lib/session';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (typeof body.username !== 'string' || typeof body.password !== 'string' || body.username.length > 80 || body.password.length > 200)
      return Response.json({error:'Input tidak valid'}, {status:400});
    if (!await verifyPassword(body.username, body.password))
      return Response.json({error:'Username atau password salah'}, {status:401});
    const user = await pool.query('SELECT user_id FROM app_user WHERE username=$1', [body.username]);
    const token = await createSession(user.rows[0].user_id);
    (await cookies()).set('homepos_session', token, {httpOnly:true, secure:process.env.NODE_ENV==='production', sameSite:'lax', path:'/', maxAge:7*24*60*60});
    return Response.json({ok:true});
  } catch { return Response.json({error:'Permintaan tidak valid'}, {status:400}); }
}
