import { create } from 'zustand'
import { BrowserFs } from '../fs/browserFs'
import { DIFF_PREFIX, editorBridge, useWorkspace } from './workspace'
import { t } from '../i18n'
import { dialogs } from '../ui/dialogs'
import type { Change } from '../git/git'

// O isomorphic-git (~300 kB) só é baixado quando um projeto do navegador é aberto.
const loadGit = () => import('../git/git')

interface GitState {
  dir: string | null
  isRepo: boolean
  branch: string | null
  changes: Change[]
  local: string[]
  remote: string[]
  ahead: number
  behind: number
  slug: string | null
  busy: string | null
  progress: string | null
  message: string

  refresh: () => Promise<void>
  /** Transforma o projeto aberto (sem git) em repositório. */
  init: () => Promise<void>
  setMessage: (m: string) => void
  commit: () => Promise<void>
  push: () => Promise<void>
  pull: () => Promise<void>
  sync: () => Promise<void>
  checkout: (ref: string) => Promise<void>
  createBranch: (name: string) => Promise<void>
  discard: (change: Change) => Promise<void>
}

/** O HEAD mudou: diffs abertos ficaram desatualizados. */
function closeDiffTabs() {
  const ws = useWorkspace.getState()
  for (const tab of ws.tabs) if (tab.path.startsWith(DIFF_PREFIX)) ws.closeTab(tab.path)
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export const useGit = create<GitState>()((set, get) => {
  /** Roda uma operação mostrando "ocupado" e erros como toast. */
  async function run(label: string, fn: () => Promise<void>) {
    if (get().busy) return
    set({ busy: label, progress: null })
    try {
      await fn()
    } catch (e) {
      useWorkspace.getState().notify(t('error.generic', { msg: errMsg(e) }))
    } finally {
      set({ busy: null, progress: null })
    }
  }

  const onProgress = (p: { phase: string; loaded: number; total?: number }) =>
    set({ progress: p.total ? `${p.phase} ${Math.round((p.loaded / p.total) * 100)}%` : p.phase })

  /** Depois de mudar arquivos no disco (pull, checkout, descartar): atualiza árvore e editores. */
  async function afterWorkdirChange() {
    closeDiffTabs()
    const ws = useWorkspace.getState()
    await ws.refresh()
    for (const tab of ws.tabs) if (!tab.path.startsWith(DIFF_PREFIX)) await editorBridge.reloadFromDisk?.(tab.path)
    await get().refresh()
  }

  return {
    dir: null,
    isRepo: false,
    branch: null,
    changes: [],
    local: [],
    remote: [],
    ahead: 0,
    behind: 0,
    slug: null,
    busy: null,
    progress: null,
    message: '',

    async refresh() {
      const fs = useWorkspace.getState().fs
      if (!(fs instanceof BrowserFs)) {
        set({ dir: null, isRepo: false, branch: null, changes: [], local: [], remote: [], slug: null })
        return
      }
      const dir = fs.root
      const git = await loadGit()
      if (!(await git.isRepo(dir))) {
        set({ dir, isRepo: false, branch: null, changes: [], local: [], remote: [], slug: null })
        return
      }
      const [branch, changes, br, slug] = await Promise.all([git.currentBranch(dir), git.status(dir), git.branches(dir), git.githubSlug(dir)])
      const ab = branch ? await git.aheadBehind(dir, branch) : { ahead: 0, behind: 0 }
      // O projeto pode ter sido trocado enquanto líamos.
      if ((useWorkspace.getState().fs as BrowserFs | null)?.root !== dir) return
      set({ dir, isRepo: true, branch, changes, local: br.local, remote: br.remote, slug, ...ab })
    },

    init: () =>
      run('init', async () => {
        const fs = useWorkspace.getState().fs
        if (!(fs instanceof BrowserFs)) return
        await (await loadGit()).initRepo(fs.root)
        await get().refresh()
      }),

    setMessage(message) {
      set({ message })
    },

    commit: () =>
      run('commit', async () => {
        const { dir, message, changes } = get()
        if (!dir || !changes.length) return
        const msg = message.trim()
        if (!msg) throw new Error(t('git.needMessage'))
        await (await loadGit()).commitAll(dir, msg)
        set({ message: '' })
        closeDiffTabs()
        await get().refresh()
      }),

    push: () =>
      run('push', async () => {
        const { dir, branch } = get()
        if (!dir || !branch) return
        await (await loadGit()).push(dir, branch, onProgress)
        await get().refresh()
        useWorkspace.getState().notify(t('git.pushed'))
      }),

    pull: () =>
      run('pull', async () => {
        const { dir, branch } = get()
        if (!dir || !branch) return
        await (await loadGit()).pull(dir, branch, onProgress)
        await afterWorkdirChange()
      }),

    async sync() {
      await get().pull()
      if (get().ahead !== 0) await get().push()
    },

    checkout: (ref) =>
      run('checkout', async () => {
        const { dir, changes } = get()
        if (!dir) return
        if (changes.length && !(await dialogs.confirm({ title: t('git.checkoutDirtyTitle'), message: t('git.checkoutDirty'), confirmLabel: t('git.checkoutAnyway') }))) return
        await (await loadGit()).checkout(dir, ref)
        await afterWorkdirChange()
      }),

    createBranch: (name) =>
      run('branch', async () => {
        const { dir } = get()
        if (!dir) return
        await (await loadGit()).createBranch(dir, name)
        await get().refresh()
      }),

    discard: (change) =>
      run('discard', async () => {
        const { dir } = get()
        if (!dir) return
        const ok = await dialogs.confirm({
          title: t('git.discardConfirm', { name: change.file }),
          message: t('confirm.cannotUndo'),
          confirmLabel: t('dialog.discard'),
          danger: true,
        })
        if (!ok) return
        await (await loadGit()).discard(dir, change)
        await afterWorkdirChange()
      }),
  }
})

// Mantém o status do git em dia: ao abrir projeto, salvar, criar ou apagar arquivos.
let timer: ReturnType<typeof setTimeout> | undefined
useWorkspace.subscribe((s, prev) => {
  if (s.fs !== prev.fs) {
    useGit.setState({ dir: null, isRepo: false, branch: null, changes: [], message: '' })
    useGit.getState().refresh()
  } else if (s.dirty !== prev.dirty || s.tree !== prev.tree) {
    clearTimeout(timer)
    timer = setTimeout(() => useGit.getState().refresh(), 400)
  }
})
