// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { completeLoginFromUrl, commitAuthor, startLogin, useAuth, GITHUB_CLIENT_ID, proxyUrl } from '../auth'
import { normalizeRepoUrl } from '../url'
import { useSettings } from '../../store/settings'
import { useWorkspace } from '../../store/workspace'

const user = { login: 'octo', name: 'Octo', id: 7, email: 'octo@example.com', avatar_url: '' }

function setUrl(search: string) {
  history.replaceState(null, '', '/app/' + search)
}

beforeEach(() => {
  useAuth.setState({ token: null, user: null })
  useSettings.setState({ proxyUrl: 'https://proxy.example/' })
  sessionStorage.clear()
  setUrl('')
})

describe('proxyUrl', () => {
  it('remove a barra final', () => {
    expect(proxyUrl()).toBe('https://proxy.example')
  })
})

describe('startLogin', () => {
  it('redireciona para o GitHub com client_id, escopos, state e redirect_uri', () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...location, origin: location.origin, pathname: '/app/', set href(v: string) { assign(v) } })
    startLogin()
    const url = new URL(assign.mock.calls[0][0])
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe(GITHUB_CLIENT_ID)
    expect(url.searchParams.get('scope')).toContain('repo')
    expect(url.searchParams.get('redirect_uri')).toBe(location.origin + '/app/')
    expect(url.searchParams.get('state')).toBe(sessionStorage.getItem('batide.oauthState'))
    vi.unstubAllGlobals()
  })

  it('avisa e não redireciona sem servidor configurado', () => {
    useSettings.setState({ proxyUrl: '' })
    const assign = vi.fn()
    vi.stubGlobal('location', { ...location, set href(v: string) { assign(v) } })
    startLogin()
    expect(assign).not.toHaveBeenCalled()
    expect(useWorkspace.getState().toast).toMatch(/Worker/)
    vi.unstubAllGlobals()
  })
})

describe('completeLoginFromUrl', () => {
  it('não faz nada sem ?code', async () => {
    expect(await completeLoginFromUrl()).toBeNull()
  })

  it('troca o code por token no Worker, busca o usuário e limpa a URL', async () => {
    sessionStorage.setItem('batide.oauthState', 's1')
    setUrl('?code=abc&state=s1')
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url === 'https://proxy.example/oauth/token') return Response.json({ access_token: 'tok' })
      if (url === 'https://api.github.com/user') return Response.json(user)
      throw new Error('inesperado: ' + url)
    })
    vi.stubGlobal('fetch', fetchMock)

    expect(await completeLoginFromUrl()).toEqual({ ok: true })
    expect(useAuth.getState()).toMatchObject({ token: 'tok', user: { login: 'octo' } })
    expect(location.search).toBe('')
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ code: 'abc' })
    vi.unstubAllGlobals()
  })

  it('recusa state diferente (proteção contra CSRF)', async () => {
    sessionStorage.setItem('batide.oauthState', 's1')
    setUrl('?code=abc&state=outro')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await completeLoginFromUrl()).toEqual({ error: expect.any(String) })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(useAuth.getState().token).toBeNull()
    vi.unstubAllGlobals()
  })

  it('repassa o erro quando o usuário cancela no GitHub', async () => {
    setUrl('?error=access_denied&error_description=The+user+denied')
    expect(await completeLoginFromUrl()).toEqual({ error: 'The user denied' })
  })

  it('repassa o erro do Worker', async () => {
    sessionStorage.setItem('batide.oauthState', 's1')
    setUrl('?code=abc&state=s1')
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'bad_verification_code', description: 'expirou' }, { status: 400 })))
    expect(await completeLoginFromUrl()).toEqual({ error: 'expirou' })
    vi.unstubAllGlobals()
  })
})

describe('commitAuthor', () => {
  it('usa nome e e-mail do GitHub', () => {
    useAuth.setState({ token: 't', user })
    expect(commitAuthor()).toEqual({ name: 'Octo', email: 'octo@example.com' })
  })

  it('usa o login quando não há nome, e e-mail noreply quando é privado', () => {
    useAuth.setState({ token: 't', user: { ...user, name: null, email: null } })
    expect(commitAuthor()).toEqual({ name: 'octo', email: '7+octo@users.noreply.github.com' })
  })
})

describe('normalizeRepoUrl', () => {
  it.each([
    ['octo/repo', 'https://github.com/octo/repo.git'],
    ['https://github.com/octo/repo', 'https://github.com/octo/repo.git'],
    ['https://github.com/octo/repo.git', 'https://github.com/octo/repo.git'],
    ['github.com/octo/my.repo/', 'https://github.com/octo/my.repo.git'],
    ['  octo/repo  ', 'https://github.com/octo/repo.git'],
  ])('%s → %s', (input, url) => {
    expect(normalizeRepoUrl(input)).toBe(url)
  })

  it.each(['', 'repo', 'https://gitlab.com/a/b', 'octo/repo/tree/main'])('recusa %j', (input) => {
    expect(normalizeRepoUrl(input)).toBeNull()
  })
})
