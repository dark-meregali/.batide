/**
 * Cloudflare Worker da Batide. Faz duas coisas que o navegador não consegue sozinho:
 *
 * 1. POST /oauth/token  — troca o "code" do login OAuth por um token, usando o client
 *    secret (que nunca vai para o navegador).
 * 2. /github.com/...    — proxy CORS para o protocolo HTTP do git (clone, pull, push),
 *    porque o github.com não envia cabeçalhos CORS. Só repassa rotas do git.
 *
 * Variáveis: GITHUB_CLIENT_ID, ALLOWED_ORIGINS (separadas por vírgula) e o segredo
 * GITHUB_CLIENT_SECRET (`npx wrangler secret put GITHUB_CLIENT_SECRET`).
 */

const GIT_PATH = /^\/github\.com\/[\w.-]+\/[\w.-]+?(\.git)?\/(info\/refs|git-upload-pack|git-receive-pack)$/
const GIT_SERVICES = new Set(['git-upload-pack', 'git-receive-pack'])
const FORWARD_REQUEST_HEADERS = ['accept', 'authorization', 'content-type', 'git-protocol']
const FORWARD_RESPONSE_HEADERS = ['content-type', 'cache-control', 'expires', 'pragma', 'www-authenticate']

export default {
  /** @param {Request} request @param {Record<string, string>} env */
  async fetch(request, env) {
    const origin = request.headers.get('origin') ?? ''
    const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    const originOk = allowed.includes(origin)
    const cors = originOk
      ? {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'authorization, content-type, git-protocol, accept',
          'access-control-expose-headers': FORWARD_RESPONSE_HEADERS.join(', '),
          'access-control-max-age': '86400',
          vary: 'origin',
        }
      : {}

    if (!originOk) return new Response('Origin not allowed', { status: 403 })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

    const url = new URL(request.url)

    if (url.pathname === '/oauth/token' && request.method === 'POST') {
      return exchangeCode(request, env, cors)
    }

    if (GIT_PATH.test(url.pathname)) {
      if (url.pathname.endsWith('/info/refs') && !GIT_SERVICES.has(url.searchParams.get('service') ?? '')) {
        return new Response('Bad service', { status: 400, headers: cors })
      }
      return proxyGit(request, url, cors)
    }

    return new Response('Not found', { status: 404, headers: cors })
  },
}

async function exchangeCode(request, env, cors) {
  let code
  try {
    ;({ code } = await request.json())
  } catch {
    return json({ error: 'invalid_request' }, 400, cors)
  }
  if (typeof code !== 'string' || !code) return json({ error: 'missing_code' }, 400, cors)

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'batide-auth' },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code }),
  })
  const data = await res.json()
  if (data.error || !data.access_token) {
    return json({ error: data.error ?? 'exchange_failed', description: data.error_description }, 400, cors)
  }
  return json({ access_token: data.access_token, scope: data.scope }, 200, cors)
}

async function proxyGit(request, url, cors) {
  const target = 'https://' + url.pathname.slice(1) + url.search
  const headers = new Headers({ 'user-agent': 'git/batide' })
  for (const h of FORWARD_REQUEST_HEADERS) {
    const v = request.headers.get(h)
    if (v) headers.set(h, v)
  }
  const res = await fetch(target, {
    method: request.method,
    headers,
    // Corpo em memória: funciona igual no Workers e no Node (dev-proxy), sem streams half-duplex.
    body: request.method === 'POST' ? await request.arrayBuffer() : undefined,
    redirect: 'follow',
  })
  const out = new Headers(cors)
  for (const h of FORWARD_RESPONSE_HEADERS) {
    const v = res.headers.get(h)
    if (v) out.set(h, v)
  }
  return new Response(res.body, { status: res.status, headers: out })
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } })
}
