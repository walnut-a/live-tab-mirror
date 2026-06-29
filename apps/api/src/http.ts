import type { Env } from './types';

const DEFAULT_ALLOWED_HEADERS = 'authorization,content-type,x-admin-secret';
const DEFAULT_ALLOWED_METHODS = 'GET,POST,PUT,OPTIONS';

function getAllowedOrigins(env: Env): Set<string> {
  return new Set(
    (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

function resolveCorsOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');

  if (!origin) {
    return '*';
  }

  if (origin.startsWith('chrome-extension://')) {
    return origin;
  }

  return getAllowedOrigins(env).has(origin) ? origin : null;
}

export function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = resolveCorsOrigin(request, env);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': DEFAULT_ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': DEFAULT_ALLOWED_METHODS,
    Vary: 'Origin'
  };

  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

export function optionsResponse(request: Request, env: Env): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, env)
  });
}

export function jsonResponse(request: Request, env: Env, body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(request, env),
      ...init.headers
    }
  });
}

export function errorResponse(request: Request, env: Env, status: number, message: string): Response {
  return jsonResponse(request, env, { error: message }, { status });
}

export async function readJson<T>(request: Request, maxBytes = 256 * 1024): Promise<T> {
  const contentLength = request.headers.get('Content-Length');
  if (contentLength && Number.parseInt(contentLength, 10) > maxBytes) {
    throw new Response('Payload too large', { status: 413 });
  }

  const text = await request.text();
  if (text.length > maxBytes) {
    throw new Response('Payload too large', { status: 413 });
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Response('Invalid JSON', { status: 400 });
  }
}
