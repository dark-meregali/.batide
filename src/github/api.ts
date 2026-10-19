import type { GithubUser } from './auth'

export interface GithubRepo {
  id: number
  full_name: string
  name: string
  private: boolean
  description: string | null
  clone_url: string
  default_branch: string
  updated_at: string
}

async function gh<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.json().catch(() => ({}))).message ?? res.statusText}`)
  return res.json()
}

export async function getUser(token: string): Promise<GithubUser> {
  const user = await gh<GithubUser>(token, '/user')
  if (!user.email) {
    // E-mail privado: tenta o e-mail principal (precisa do escopo user:email).
    const emails = await gh<{ email: string; primary: boolean; verified: boolean }[]>(token, '/user/emails').catch(() => [])
    user.email = emails.find((e) => e.primary && e.verified)?.email ?? null
  }
  return user
}

/** Repositórios do usuário (próprios, de organizações e de colaboração), mais recentes primeiro. */
export async function listRepos(token: string): Promise<GithubRepo[]> {
  const all: GithubRepo[] = []
  for (let page = 1; page <= 5; page++) {
    const batch = await gh<GithubRepo[]>(token, `/user/repos?sort=updated&per_page=100&page=${page}`)
    all.push(...batch)
    if (batch.length < 100) break
  }
  return all
}
