import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const isLogin = request.nextUrl.pathname === '/login' || request.nextUrl.pathname.startsWith('/api/auth/');
  if (isLogin) return NextResponse.next();
  if (!request.cookies.has('homepos_session')) {
    if (request.nextUrl.pathname.startsWith('/api/')) return Response.json({error:'Sesi login diperlukan'}, {status:401});
    return NextResponse.redirect(new URL('/login',request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
