import { create } from 'zustand'
import { type FsEntry, type FsProvider, basename, dirname, joinPath } from '../fs/types'
import { t } from '../i18n'
import { dialogs } from '../ui/dialogs'

export interface Tab {
  path: string
  name: string
}

export type SidebarView = 'explorer' | 'git' | 'settings'
export type Dialog = 'clone' | 'branch' | null

/** Linha de edição inline na árvore: criando um item numa pasta ou renomeando um item. */
export type Editing = { mode: 'create'; dir: string; kind: 'file' | 'dir' } | { mode: 'rename'; path: string } | null

/**
 * Ponte para o módulo do editor (carregado sob demanda), que é dono dos modelos do
 * Monaco. O store não importa o Monaco para manter a abertura da IDE instantânea.
 */
export const editorBridge: {
  renameModel?: (from: string, to: string) => void
  disposeModel?: (path: string) => void
  /** Recarrega do disco um arquivo aberto sem alterações (após pull, checkout…). */
  reloadFromDisk?: (path: string) => Promise<void>
  /** Salva no disco o conteúdo atual do editor para esse arquivo. */
  save?: (path: string) => Promise<void>
  /** Liga/desliga o modo "Tab move o foco" do editor (Ctrl+M). */
  toggleTabFocus?: () => void
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
  /** Tela estreita (celular): a barra lateral sobrepõe o editor e sai da frente ao abrir arquivo. */
  narrow: boolean
  /** Editor no modo "Tab move o foco" (Ctrl+M) em vez de indentar. */
  tabFocus: boolean
  toast: string | null
  dialog: Dialog
  editing: Editing

  openProject: (fs: FsProvider) => Promise<void>
  /** Fecha o projeto; com alterações não salvas pergunta antes. false = usuário cancelou. */
  closeProject: () => Promise<boolean>
  loadDir: (path: string) => Promise<void>
  toggleDir: (path: string) => Promise<void>
  collapseAll: () => void
  refresh: () => Promise<void>
  select: (path: string | null) => void
  openFile: (path: string) => void
  openDiff: (path: string) => void
  closeTab: (path: string) => Promise<void>
  setActive: (path: string) => void
  setDirty: (path: string, dirty: boolean) => void
  /** Pasta onde "novo arquivo" cria: a selecionada, a do arquivo selecionado ou a raiz. */
  newEntryTarget: () => string
  startCreate: (dir: string, kind: 'file' | 'dir') => Promise<void>
  startRename: (path: string) => void
  cancelEdit: () => void
  commitEdit: (name: string) => Promise<void>
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
    narrow: false,
    tabFocus: false,
    toast: null,
    dialog: null,
    editing: null,

    async openProject(fs) {
      if (!(await get().closeProject())) return
      set({ fs, expanded: { '/': true }, sidebarVisible: true, sidebarView: 'explorer' })
      await get().loadDir('/')
    },

    async closeProject() {
      const unsaved = Object.keys(get().dirty).filter((p) => get().dirty[p])
      if (unsaved.length) {
        const choice = await dialogs.choose({
          title: t('confirm.unsavedProject'),
          message: unsaved.map(basename).join(', '),
          choices: [
            { id: 'save', label: t('dialog.saveAll') },
            { id: 'discard', label: t('dialog.discard'), danger: true },
          ],
        })
        if (!choice) return false
        if (choice === 'save') for (const path of unsaved) await editorBridge.save?.(path)
      }
      for (const tab of get().tabs) editorBridge.disposeModel?.(tab.path)
      set({ fs: null, tree: {}, expanded: {}, selected: null, tabs: [], active: null, dirty: {}, editing: null })
      return true
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
      set({ active: path, selected: path, ...(get().narrow && { sidebarVisible: false }) })
    },

    openDiff(path) {
      const id = DIFF_PREFIX + path
      const { tabs } = get()
      if (!tabs.some((t) => t.path === id)) set({ tabs: [...tabs, { path: id, name: basename(path) }] })
      set({ active: id })
    },

    async closeTab(path) {
      if (get().dirty[path]) {
        const choice = await dialogs.choose({
          title: t('confirm.unsaved', { name: basename(path) }),
          choices: [
            { id: 'save', label: t('dialog.save') },
            { id: 'discard', label: t('dialog.discard'), danger: true },
          ],
        })
        if (!choice) return
        if (choice === 'save') await editorBridge.save?.(path)
      }
      const { tabs, active, dirty } = get()
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

    newEntryTarget() {
      const { selected, tree } = get()
      if (!selected) return '/'
      const isDir = Object.values(tree).some((list) => list.some((e) => e.path === selected && e.kind === 'dir'))
      return isDir ? selected : dirname(selected)
    },

    async startCreate(dir, kind) {
      set((s) => ({ editing: { mode: 'create', dir, kind }, expanded: { ...s.expanded, [dir]: true } }))
      if (!get().tree[dir]) await get().loadDir(dir)
    },

    startRename(path) {
      if (path !== '/') set({ editing: { mode: 'rename', path }, selected: path })
    },

    cancelEdit() {
      set({ editing: null })
    },

    async commitEdit(raw) {
      const editing = get().editing
      const fs = get().fs
      const name = raw.trim()
      if (!editing || !fs) return
      if (!name) return set({ editing: null })
      try {
        if (editing.mode === 'create') {
          const { dir, kind } = editing
          const path = joinPath(dir, name)
          if (await fs.exists(path)) return get().notify(t('error.exists'))
          // Permite "pasta/sub/arquivo.ts": cria as pastas intermediárias.
          const parts = name.split('/').filter(Boolean)
          const parents = [dir] // pastas a abrir no explorador para revelar o item criado
          let cur = dir
          for (const part of parts.slice(0, kind === 'file' ? -1 : undefined)) {
            cur = joinPath(cur, part)
            if (!(await fs.exists(cur))) await fs.mkdir(cur)
            if (cur !== path) parents.push(cur)
          }
          if (kind === 'file') await fs.writeFile(path, '')
          set((s) => ({ editing: null, expanded: { ...s.expanded, ...Object.fromEntries(parents.map((p) => [p, true])) } }))
          await get().refresh()
          if (kind === 'file') get().openFile(path)
          else get().select(path)
          return
        }

        const { path } = editing
        if (name === basename(path)) return set({ editing: null })
        const to = joinPath(dirname(path), name)
        if (await fs.exists(to)) return get().notify(t('error.exists'))
        await fs.rename(path, to)
        const remap = (p: string) => (isUnder(p, path) ? to + p.slice(path.length) : p)
        for (const tab of get().tabs) if (isUnder(tab.path, path)) editorBridge.renameModel?.(tab.path, remap(tab.path))
        set((s) => ({
          editing: null,
          tabs: s.tabs.map((tab) => ({ path: remap(tab.path), name: basename(remap(tab.path)) })),
          active: s.active && remap(s.active),
          selected: to,
          dirty: Object.fromEntries(Object.entries(s.dirty).map(([p, d]) => [remap(p), d])),
          expanded: Object.fromEntries(Object.entries(s.expanded).map(([p, d]) => [remap(p), d])),
        }))
        await get().refresh()
      } catch (e) {
        set({ editing: null })
        fail(e)
      }
    },

    async deleteEntry(path) {
      const fs = get().fs
      if (!fs || path === '/') return
      const ok = await dialogs.confirm({
        title: t('confirm.delete', { name: basename(path) }),
        message: t('confirm.cannotUndo'),
        confirmLabel: t('explorer.delete'),
        danger: true,
      })
      if (!ok) return
      try {
        await fs.remove(path)
        const doomed = get().tabs.filter((tab) => isUnder(tab.path, path))
        for (const tab of doomed) {
          set((s) => ({ dirty: { ...s.dirty, [tab.path]: false } }))
          await get().closeTab(tab.path)
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
