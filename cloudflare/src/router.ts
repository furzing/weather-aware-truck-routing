type Fetcher = { fetch: (request: Request) => Promise<Response> };
export type RouterEnvironment = {
  ASSETS: Fetcher;
  DJANGO_SECRET_KEY?: string;
};

// Keep the existing origin contract: API paths go to Django, only known pages use index.html.
export async function routeRequest(
  request: Request,
  env: RouterEnvironment,
  backend: () => Fetcher,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    if (!env.DJANGO_SECRET_KEY) return unavailable();
    const origin = request.headers.get('Origin');
    if (request.method === 'POST' && origin && origin !== url.origin)
      return Response.json({ error: { code: 'origin_rejected', message: "Compare trips from this site's planner." } }, { status: 403 });
    const headers = new Headers(request.headers);
    if (origin === url.origin) headers.set('Origin', 'http://localhost');
    headers.set('Host', 'localhost');
    headers.set('X-Forwarded-Proto', 'https');
    for (const name of ['Forwarded', 'X-Forwarded-Host', 'X-Forwarded-For', 'X-Real-IP'])
      headers.delete(name);
    url.protocol = 'http:';
    url.host = 'localhost';
    try {
      const result = await backend().fetch(new Request(url, new Request(request, { headers })));
      if (
        result.status >= 500 &&
        !result.headers.get('Content-Type')?.includes('application/json')
      ) {
        await result.body?.cancel();
        return unavailable();
      }
      const response = new Response(result.body, result);
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('X-Content-Type-Options', 'nosniff');
      return response;
    } catch {
      // Infrastructure failures never become a successful empty plan; do not expose exception data.
      return unavailable();
    }
  }
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return new Response('Method not allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' },
    });
  const page = ['/', '/rules', '/rules/'].includes(url.pathname);
  if (page) url.pathname = '/';
  const result = await env.ASSETS.fetch(new Request(url, request));
  const response = new Response(result.body, result);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (page) response.headers.set('Cache-Control', 'no-cache');
  else if (
    result.status === 200 &&
    /^\/assets\/.+[-.][A-Za-z0-9_-]{8,12}\.(?:js|css|woff2)$/.test(url.pathname)
  )
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return response;
}

function unavailable() {
  return Response.json(
    {
      error: {
        code: 'unavailable',
        message: 'The planner is temporarily unavailable. Please retry.',
      },
    },
    {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': '10' },
    },
  );
}
