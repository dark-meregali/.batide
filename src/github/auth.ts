import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useSettings } from '../store/settings'
import { useWorkspace } from '../store/workspace'
import { t } from '../i18n'

export const GITHUB_CLIENT_ID = 'Ov23lieSJoRLk2tDkKDa'
const SCOPES = 'repo read:user user:email'

export interface GithubUser {
  login: string
  name: string | null
  avatar_url: string
  id: number
  email: string | null
}

interface AuthState {
  token: string | null
  user: GithubUser | null
  setSession: (token: string, user: GithubUser) => void
  logout: () => void
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'batide.github' },
  ),
)

export const proxyUrl = () => (useSettings.getState().proxyUrl || import.meta.env.VITE_PROXY_URL || '').replace(/\/+$/, '')

/** Para onde o GitHub devolve depois do login: a própria página, sem query. */
const redirectUri = () => location.origin + location.pathname

/** Inicia o login OAuth (fluxo web): redireciona para o GitHub. */
export function startLogin() {
  if (!proxyUrl()) {
    useWorkspace.getState().notify(t('git.needProxy'))
    return
  }
  const state = crypto.randomUUID()
  sessionStorage.setItem('batide.oauthState', state)
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    scope: SCOPES,
    state,
    redirect_uri: redirectUri(),
    allow_signup: 'false',
  })
  location.href = `https://github.com/login/oauth/authorize?${params}`
}

/**
 * Se a página abriu com ?code=… (volta do GitHub), troca o code por um token no Worker.
 * Retorna null se não havia login pendente.
 */
export async function completeLoginFromUrl(): Promise<{ ok: true } | { error: string } | null> {
  const params = new URLSearchParams(location.search)
  const code = params.get('code')
  const state = params.get('state')
  const error = params.get('error_description') ?? params.get('error')
  if (!code && !error) return null

  history.replaceState(null, '', redirectUri() + location.hash)
  if (error) return { error }
  const expected = sessionStorage.getItem('batide.oauthState')
  sessionStorage.removeItem('batide.oauthState')
  if (!state || state !== expected) return { error: 'state inválido' }

  const res = await fetch(`${proxyUrl()}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.access_token) return { error: data.description ?? data.error ?? `HTTP ${res.status}` }
  await loginWithToken(data.access_token)
  return { ok: true }
}

/** Valida um token (OAuth ou Personal Access Token) e guarda a sessão. */
export async function loginWithToken(token: string) {
  const { getUser } = await import('./api')
  const user = await getUser(token)
  useAuth.getState().setSession(token, user)
}

/** Autor dos commits: nome e e-mail do GitHub (ou o e-mail noreply, se o e-mail for privado). */
export function commitAuthor() {
  const user = useAuth.getState().user
  if (!user) return { name: 'Batide', email: 'batide@users.noreply.github.com' }
  return { name: user.name || user.login, email: user.email || `${user.id}+${user.login}@users.noreply.github.com` }
}
