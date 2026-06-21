import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const AUTHORIZED_IP = '95.94.55.106';
const BYPASS_TOKEN = 'julia2026';
const COOKIE_NAME = 'secure_access';
const COOKIE_VALUE = 'granted';

export function proxy(request: NextRequest) {
  // Captura o IP real do visitante passado pelo Render
  let ipVisitante = request.headers.get('x-forwarded-for') || request.ip || request.headers.get('x-real-ip') || '';

  // Se o cabeçalho tiver múltiplos IPs (proxies encadeados), pega apenas no primeiro
  if (ipVisitante && ipVisitante.includes(',')) {
    ipVisitante = ipVisitante.split(',')[0].trim();
  }

  // 2. Verificar bypass por token na URL (?vip=julia2026)
  const { searchParams } = request.nextUrl;
  const vipToken = searchParams.get('vip');

  if (vipToken === BYPASS_TOKEN) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/';
    redirectUrl.searchParams.delete('vip'); // Limpa o token da URL para o utilizador

    const response = NextResponse.redirect(redirectUrl);

    // Injeta o cookie seguro persistente por 30 dias
    response.cookies.set(COOKIE_NAME, COOKIE_VALUE, {
      maxAge: 30 * 24 * 60 * 60, // 30 dias (em segundos)
      httpOnly: true,            // Proteção XSS
      secure: process.env.NODE_ENV === 'production', // Apenas HTTPS em produção
      sameSite: 'lax',
      path: '/',
    });

    console.log(`[Segurança] Token VIP válido de ${ipVisitante}. Cookie injetado. Redirecionando...`);
    return response;
  }

  // 3. Verificar se o cookie de acesso existe
  const hasAccessCookie = request.cookies.get(COOKIE_NAME)?.value === COOKIE_VALUE;

  // 4. Verificar se o IP é o autorizado
  const isAuthorizedIp = ipVisitante === AUTHORIZED_IP;

  // Permitir localhost apenas em modo de desenvolvimento para facilitar o trabalho local
  const isLocalhostInDev = process.env.NODE_ENV !== 'production' && (ipVisitante === '127.0.0.1' || ipVisitante === '::1');

  if (isAuthorizedIp || hasAccessCookie || isLocalhostInDev) {
    return NextResponse.next();
  }

  // 5. Bloqueio padrão para qualquer outra situação (403 Forbidden)
  console.warn(`[Acesso Rejeitado] IP: ${ipVisitante} tentou aceder sem cookie ou autorização.`);
  return new NextResponse('Acesso Restrito', {
    status: 403,
    statusText: 'Forbidden',
  });
}

// Configurar o matcher para aplicar o proxy em todas as páginas,
// exceto nos assets estáticos do Next.js internos, imagens e favicon.
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - logo.svg
     * - robots.txt
     */
    '/((?!_next/static|_next/image|favicon.ico|logo.svg|robots.txt).*)',
  ],
};
