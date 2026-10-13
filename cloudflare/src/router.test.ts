import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeRequest } from './router.ts';

const secret = 'test-only-deployment-secret';
const noBackend = () => {
  throw new Error('Static requests must never start a container');
};

test('planner and Rules serve the same revalidated HTML without waking Django', async () => {
  for (const path of ['/', '/rules', '/rules/']) {
    const response = await routeRequest(
      new Request(`https://example.workers.dev${path}`),
      {
        ASSETS: {
          fetch: async (request) => {
            assert.equal(new URL(request.url).pathname, '/');
            return new Response('<html>planner</html>');
          },
        },
      },
      noBackend,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-cache');
    assert.equal(await response.text(), '<html>planner</html>');
  }
});

test('fingerprinted assets are immutable; unknown paths and invalid methods stay errors', async () => {
  const env = {
    ASSETS: {
      fetch: async (request: Request) =>
        new Response('', {
          status: new URL(request.url).pathname.startsWith('/assets/') ? 200 : 404,
        }),
    },
  };
  const asset = await routeRequest(
    new Request('https://example.workers.dev/assets/index-Abcdef12.js'),
    env,
    noBackend,
  );
  assert.match(asset.headers.get('Cache-Control')!, /immutable/);
  assert.equal(
    (await routeRequest(new Request('https://example.workers.dev/missing'), env, noBackend)).status,
    404,
  );
  const post = await routeRequest(
    new Request('https://example.workers.dev/rules', { method: 'POST' }),
    env,
    noBackend,
  );
  assert.equal(post.status, 405);
});

test('API forwarding preserves body/query and replaces untrusted proxy headers', async () => {
  const request = new Request('https://example.workers.dev/api/plan?q=1', {
    method: 'POST',
    body: '{"load_lb":38000}',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-Proto': 'http',
      'X-Forwarded-Host': 'attacker.example',
      'X-Forwarded-For': '1.2.3.4',
      Forwarded: 'host=attacker.example',
    },
  });
  const response = await routeRequest(
    request,
    {
      ASSETS: {
        fetch: async () => {
          throw new Error('API must not use assets');
        },
      },
      DJANGO_SECRET_KEY: secret,
    },
    () => ({
      fetch: async (forwarded) => {
        assert.equal(forwarded.url, 'http://localhost/api/plan?q=1');
        assert.equal(forwarded.headers.get('Host'), 'localhost');
        assert.equal(forwarded.headers.get('X-Forwarded-Proto'), 'https');
        for (const header of ['Forwarded', 'X-Forwarded-Host', 'X-Forwarded-For'])
          assert.equal(forwarded.headers.get(header), null);
        assert.equal(await forwarded.text(), '{"load_lb":38000}');
        return Response.json({ error: 'invalid trip' }, { status: 400 });
      },
    }),
  );
  assert.equal(response.status, 400);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('missing secret and container failure produce explicit non-cacheable 503 responses', async () => {
  const env = { ASSETS: { fetch: async () => new Response('') } };
  const missing = await routeRequest(
    new Request('https://example.workers.dev/api/health'),
    env,
    noBackend,
  );
  assert.equal(missing.status, 503);
  const failed = await routeRequest(
    new Request('https://example.workers.dev/api/health'),
    { ...env, DJANGO_SECRET_KEY: secret },
    () => ({
      fetch: async () => {
        throw new Error('sensitive infrastructure detail');
      },
    }),
  );
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get('Cache-Control'), 'no-store');
  assert.doesNotMatch(await failed.text(), /sensitive/);
  const startup = await routeRequest(
    new Request('https://example.workers.dev/api/plan'),
    { ...env, DJANGO_SECRET_KEY: secret },
    () => ({
      fetch: async () => new Response('sensitive container startup detail', { status: 500 }),
    }),
  );
  assert.equal(startup.status, 503);
  assert.doesNotMatch(await startup.text(), /sensitive/);
});
