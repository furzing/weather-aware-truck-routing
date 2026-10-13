import { Container } from '@cloudflare/containers';
import { routeRequest } from './router';

interface Env {
  ASSETS: Fetcher;
  BACKEND: DurableObjectNamespace<RoutingBackend>;
  DJANGO_SECRET_KEY: string;
}

export class RoutingBackend extends Container<Env> {
  defaultPort = 8000;
  sleepAfter = '5m';
  enableInternet = true;
  envVars = {
    PORT: '8000',
    DEBUG: 'false',
    SECRET_KEY: this.env.DJANGO_SECRET_KEY,
    ALLOWED_HOSTS: 'localhost,127.0.0.1',
    TRUST_PROXY: 'true',
    SECURE_SSL_REDIRECT: 'true',
  };
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    // One named instance preserves the existing process-local cache and admission limits.
    return routeRequest(request, env, () => env.BACKEND.getByName('assessment'));
  },
} satisfies ExportedHandler<Env>;
