import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.js'

const env = {
  GITHUB_CLIENT_ID: 'cid',
  GITHUB_CLIENT_SECRET: 'secret',
  ALLOWED_ORIGINS: 'https://app.example,http://localhost:5173',
}
const ORIGIN = 'https://app.example'
const req = (path: string, init: RequestInit & { origin?: string } = {}) =>
  new Request('https://worker.example' + path, {
    ...init,
    headers: { origin: init.origin ?? ORIGIN, ...(init.headers as Record<string, string>) },
  })

afterEach(() => vi.unstubAllGlobals())

describe('worker', () => {
  it('recusa origens não permitidas', async () => {
    const res = await worker.fetch(req('/oauth/token', { method: 'POST', origin: 'https://evil.example' }), env)
    expect(res.status).toBe(403)
  })

  it('responde ao preflight CORS', async () => {
    const res = await worker.fetch(req('/oauth/token', { method: 'OPTIONS' }), env)
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN)
  })

  it('troca o code por token usando o client secret', async () => {
    const fetchMock = vi.fn(async () => Response.json({ access_token: 'tok', scope: 'repo' }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await worker.fetch(req('/oauth/token', { method: 'POST', body: JSON.stringify({ code: 'abc' }) }), env)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ access_token: 'tok', scope: 'repo' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://github.com/login/oauth/access_token')
    expect(JSON.parse(init.body as string)).toEqual({ client_id: 'cid', client_secret: 'secret', code: 'abc' })
  })

  it('repassa o erro do GitHub sem token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'bad_verification_code', error_description: 'expired' })))
    const res = await worker.fetch(req('/oauth/token', { method: 'POST', body: JSON.stringify({ code: 'x' }) }), env)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('bad_verification_code')
  })

  it('faz proxy só das rotas do git no github.com', async () => {
    const fetchMock = vi.fn(async () => new Response('refs', { headers: { 'content-type': 'application/x-git-upload-pack-advertisement' } }))
    vi.stubGlobal('fetch', fetchMock)
    const ok = await worker.fetch(req('/github.com/octo/repo.git/info/refs?service=git-upload-pack'), env)
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toBe('application/x-git-upload-pack-advertisement')
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('https://github.com/octo/repo.git/info/refs?service=git-upload-pack')

    for (const path of ['/github.com/octo/repo/settings', '/evil.com/x/y.git/info/refs?service=git-upload-pack', '/api.github.com/user']) {
      expect((await worker.fetch(req(path), env)).status).toBe(404)
    }
    expect((await worker.fetch(req('/github.com/octo/repo.git/info/refs?service=other'), env)).status).toBe(400)
  })
})
