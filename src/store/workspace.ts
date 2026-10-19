import { create } from 'zustand'
import { type FsEntry, type FsProvider, basename, dirname, joinPath } from '../fs/types'
import { t } from '../i18n'

export interface Tab {
  path: string
  name: string
}

export type SidebarView = 'explorer' | 'git' | 'settings'
export type Dialog = 'clone' | 'branch' | null

/**
 * Ponte para o módulo do editor (carregado sob demanda), que é dono dos modelos do
 * Monaco. O store não importa o Monaco para manter a abertura da IDE instantânea.
 */
export const editorBridge: {
  renameModel?: (from: string, to: string) => void
  disposeModel?: (path: string) => void
  /** Recarrega do disco um arquivo aberto sem alterações (após pull, checkout…). */
  reloadFromDisk?: (path: string) => Promise<void>
} = {}

/** Abas de diff usam o prefixo "diff:" antes do caminho do arquivo. */
export const DIFF_PREFIX = 'diff:'

interface WorkspaceState {
  fs: FsProvider | null
  tree: Record<string, FsEntry[]>
  expanded: Record<string, boolean>
  selected: string | null
  tabs: Tab[]
  active: string | null
  dirty: Record<string, boolean>
  cursor: { line: number; col: number }
  activeLanguage: string
  sidebarVisible: boolean
  sidebarView: SidebarView
  toast: string | null
  dialog: Dialog

  openProject: (fs: FsProvider) => Promise<void>
  closeProject: () => void
  loadDir: (path: string) => Promise<void>
  toggleDir: (path: string) => Promise<void>
  collapseAll: () => void
  refresh: () => Promise<void>
  select: (path: string | null) => void
  openFile: (path: string) => void
  openDiff: (path: string) => void
  closeTab: (path: string) => void
  setActive: (path: string) => void
  setDirty: (path: string, dirty: boolean) => void
  createEntry: (dir: string, kind: 'file' | 'dir') => Promise<void>
  renameEntry: (path: string) => Promise<void>
  deleteEntry: (path: string) => Promise<void>
  showSidebar: (view: SidebarView) => void
  toggleSidebar: () => void
  notify: (msg: string) => void
  setDialog: (dialog: Dialog) => void
}

const isUnder = (p: string, dir: string) => p === dir || p.startsWith(dir + '/')

export const useWorkspace = create<WorkspaceState>()((set, get) => {
  const fail = (e: unknown) => get().notify(t('error.generic', { msg: e instanceof Error ? e.message : String(e) }))

  return {
    fs: null,
    tree: {},
    expanded: {},
    selected: null,
    tabs: [],
    active: null,
    dirty: {},
    cursor: { line: 1, col: 1 },
    activeLanguage: '',
    sidebarVisible: true,
    sidebarView: 'explorer',
    toast: null,
    dialog: null,

    async openProject(fs) {
      get().closeProject()
      set({ fs, expanded: { '/': true }, sidebarVisible: true, sidebarView: 'explorer' })
      await get().loadDir('/')
    },

    closeProject() {
      for (const tab of get().tabs) editorBridge.disposeModel?.(tab.path)
      set({ fs: null, tree: {}, expanded: {}, selected: null, tabs: [], active: null, dirty: {} })
    },

    async loadDir(path) {
      const fs = get().fs
      if (!fs) return
      try {
        // A pasta .git não aparece no explorador (como no VS Code).
        const entries = (await fs.readDir(path)).filter((e) => !(path === '/' && e.name === '.git'))
        set((s) => ({ tree: { ...s.tree, [path]: entries } }))
      } catch (e) {
        fail(e)
      }
    },

    async toggleDir(path) {
      const open = !get().expanded[path]
      set((s) => ({ expanded: { ...s.expanded, [path]: open } }))
      if (open && !get().tree[path]) await get().loadDir(path)
    },

    collapseAll() {
      set({ expanded: { '/': true } })
    },

    async refresh() {
      const { expanded } = get()
      set({ tree: {} })
      await Promise.all(
        Object.keys(expanded)
          .filter((p) => expanded[p])
          .map((p) => get().loadDir(p)),
      )
    },

    select(path) {
      set({ selected: path })
    },

    openFile(path) {
      const { tabs } = get()
      if (!tabs.some((t) => t.path === path)) set({ tabs: [...tabs, { path, name: basename(path) }] })
      set({ active: path, selected: path })
    },

    openDiff(path) {
      const id = DIFF_PREFIX + path
      const { tabs } = get()
      if (!tabs.some((t) => t.path === id)) set({ tabs: [...tabs, { path: id, name: basename(path) }] })
      set({ active: id })
    },

    closeTab(path) {
      const { tabs, active, dirty } = get()
      if (dirty[path] && !confirm(t('confirm.unsaved', { name: basename(path) }))) return
      const idx = tabs.findIndex((t) => t.path === path)
      const next = tabs.filter((t) => t.path !== path)
      const nextActive = active === path ? (next[idx] ?? next[idx - 1])?.path ?? null : active
      const { [path]: _, ...restDirty } = dirty
      set({ tabs: next, active: nextActive, dirty: restDirty })
      editorBridge.disposeModel?.(path)
    },

    setActive(path) {
      set({ active: path, selected: path.startsWith(DIFF_PREFIX) ? get().selected : path })
    },

    setDirty(path, dirty) {
      if (!!get().dirty[path] === dirty) return
      set((s) => ({ dirty: { ...s.dirty, [path]: dirty } }))
    },

    async createEntry(dir, kind) {
      const fs = get().fs
      if (!fs) return
      const name = prompt(t(kind === 'file' ? 'prompt.fileName' : 'prompt.folderName'))?.trim()
      if (!name) return
      const path = joinPath(dir, name)
      try {
        if (await fs.exists(path)) return get().notify(t('error.exists'))
        // Permite "pasta/sub/arquivo.ts": cria as pastas intermediárias.
        const parts = name.split('/').filter(Boolean)
        let cur = dir
        for (const part of parts.slice(0, kind === 'file' ? -1 : undefined)) {
          cur = joinPath(cur, part)
          if (!(await fs.exists(cur))) await fs.mkdir(cur)
        }
        if (kind === 'file') await fs.writeFile(path, '')
        set((s) => ({ expanded: { ...s.expanded, [dir]: true } }))
        await get().refresh()
        if (kind === 'file') get().openFile(path)
        else get().select(path)
      } catch (e) {
        fail(e)
      }
    },

    async renameEntry(path) {
      const fs = get().fs
      if (!fs || path === '/') return
      const name = prompt(t('prompt.newName'), basename(path))?.trim()
      if (!name || name === basename(path)) return
      const to = joinPath(dirname(path), name)
      try {
        if (await fs.exists(to)) return get().notify(t('error.exists'))
        await fs.rename(path, to)
        const remap = (p: string) => (isUnder(p, path) ? to + p.slice(path.length) : p)
        for (const tab of get().tabs) if (isUnder(tab.path, path)) editorBridge.renameModel?.(tab.path, remap(tab.path))
        set((s) => ({
          tabs: s.tabs.map((tab) => ({ path: remap(tab.path), name: basename(remap(tab.path)) })),
          active: s.active && remap(s.active),
          selected: to,
          dirty: Object.fromEntries(Object.entries(s.dirty).map(([p, d]) => [remap(p), d])),
          expanded: Object.fromEntries(Object.entries(s.expanded).map(([p, d]) => [remap(p), d])),
        }))
        await get().refresh()
      } catch (e) {
        fail(e)
      }
    },

    async deleteEntry(path) {
      const fs = get().fs
      if (!fs || path === '/') return
      if (!confirm(t('confirm.delete', { name: basename(path) }))) return
      try {
        await fs.remove(path)
        const doomed = get().tabs.filter((tab) => isUnder(tab.path, path))
        for (const tab of doomed) {
          set((s) => ({ dirty: { ...s.dirty, [tab.path]: false } }))
          get().closeTab(tab.path)
        }
        await get().refresh()
      } catch (e) {
        fail(e)
      }
    },

    showSidebar(view) {
      const s = get()
      set({ sidebarVisible: !(s.sidebarVisible && s.sidebarView === view), sidebarView: view })
    },

    toggleSidebar() {
      set((s) => ({ sidebarVisible: !s.sidebarVisible }))
    },

    setDialog(dialog) {
      set({ dialog })
    },

    notify(msg) {
      set({ toast: msg })
      setTimeout(() => get().toast === msg && set({ toast: null }), 4000)
    },
  }
})
