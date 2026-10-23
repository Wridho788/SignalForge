import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { checkRequest } from '@/lib/security/request-guard';

// Next.js 16: `proxy` replaces `middleware`. Server Actions are POSTs to the page route, so this
// also covers them; they additionally get Next's own Origin-vs-Host check.
export function proxy(request: NextRequest) {
  const result = checkRequest({
    method: request.method,
    host: request.headers.get('host'),
    origin: request.headers.get('origin'),
  });
  if (!result.allowed) {
    return new NextResponse('Forbidden', { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
