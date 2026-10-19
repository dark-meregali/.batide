import { useEffect, useState } from 'react'
import { QuickPick, type PickItem } from './QuickPick'
import { useT } from '../i18n'
import { useAuth, startLogin, proxyUrl } from '../github/auth'
import { useGit } from '../store/git'
import { useWorkspace } from '../store/workspace'
import { BrowserFs, listBrowserProjects } from '../fs/browserFs'
import { IconBranch, IconGithub, IconGlobe, IconLock, IconPlus } from './Icons'
import type { GithubRepo } from '../github/api'
import { normalizeRepoUrl } from '../github/url'

export function BranchPicker({ onClose }: { onClose: () => void }) {
  const t = useT()
  const { local, remote, branch, checkout, createBranch } = useGit()

  const items: PickItem[] = [
    ...local.map((b) => ({ id: 'l:' + b, label: b, icon: <IconBranch size={14} />, badge: b === branch ? t('git.current') : undefined })),
    ...remote.map((b) => ({ id: 'r:' + b, label: b, icon: <IconGlobe size={14} />, badge: 'origin' })),
  ]

  return (
    <QuickPick
      placeholder={t('git.pickBranch')}
      items={items}
      emptyText={t('git.noBranches')}
      createItem={(q) => {
        const name = q.replace(/\s+/g, '-')
        return name && !local.includes(name) ? { id: 'new', label: t('git.createBranch', { name }), icon: <IconPlus size={14} /> } : null
      }}
      onPick={(item, q) => {
        onClose()
        if (item.id === 'new') createBranch(q.replace(/\s+/g, '-'))
        else if (item.label !== branch) checkout(item.label)
      }}
      onClose={onClose}
    />
  )
}

/** Escolhe um repositório do GitHub (ou cola uma URL) e clona para um projeto no navegador. */
export function CloneDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const token = useAuth((s) => s.token)
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [loading, setLoading] = useState(!!token)
  const [cloning, setCloning] = useState<string | null>(null)
  const [progress, setProgress] = useState('')

  useEffect(() => {
    if (!token) return
    import('../github/api')
      .then(({ listRepos }) => listRepos(token))
      .then(setRepos)
      .catch((e) => useWorkspace.getState().notify(String(e?.message ?? e)))
      .finally(() => setLoading(false))
  }, [token])

  const clone = async (url: string, baseName: string) => {
    if (!proxyUrl()) return useWorkspace.getState().notify(t('git.needProxy'))
    const existing = await listBrowserProjects()
    let name = baseName
    for (let i = 2; existing.includes(name); i++) name = `${baseName}-${i}`
    setCloning(name)
    try {
      const git = await import('../git/git')
      await git.clone(url, name, (p) => setProgress(p.total ? `${p.phase} ${Math.round((p.loaded / p.total) * 100)}%` : p.phase))
      onClose()
      await useWorkspace.getState().openProject(new BrowserFs(name))
    } catch (e) {
      useWorkspace.getState().notify(t('error.generic', { msg: e instanceof Error ? e.message : String(e) }))
      setCloning(null)
    }
  }

  if (cloning) {
    return (
      <div className="overlay">
        <div className="quick-pick clone-progress">
          <IconGithub size={18} />
          <div>
            <div>{t('git.cloning', { name: cloning })}</div>
            <div className="muted">{progress || '…'}</div>
          </div>
        </div>
      </div>
    )
  }

  const items: PickItem[] = repos.map((r) => ({
    id: r.clone_url,
    label: r.full_name,
    detail: r.description ?? undefined,
    icon: r.private ? <IconLock size={14} /> : <IconGithub size={14} />,
  }))

  return (
    <QuickPick
      placeholder={t(token ? 'git.clonePlaceholder' : 'git.cloneUrlPlaceholder')}
      items={items}
      loading={loading}
      emptyText={token ? t('git.noRepos') : t('git.cloneUrlHint')}
      createItem={(q) => {
        const url = normalizeRepoUrl(q)
        return url ? { id: 'url', label: t('git.cloneUrl', { url }), icon: <IconPlus size={14} /> } : null
      }}
      onPick={(item, q) => {
        const url = item.id === 'url' ? normalizeRepoUrl(q)! : item.id
        clone(url, url.replace(/\.git$/, '').split('/').pop() || 'repo')
      }}
      onClose={onClose}
      footer={
        !token && (
          <button className="link-btn" onClick={startLogin}>
            <IconGithub size={14} /> {t('github.login')}
          </button>
        )
      }
    />
  )
}
