import { useEffect, useRef, useState } from 'react'
import { useWorkspace } from '../store/workspace'
import { useGit } from '../store/git'
import { STATUS_COLORS } from './SourceControl'
import { FileIcon } from './FileIcon'
import { useT } from '../i18n'
import { dirname, type FsEntry } from '../fs/types'
import {
  IconChevron, IconCollapse, IconClose, IconFilePlus, IconFolderPlus, IconRefresh,
} from './Icons'

interface Menu {
  x: number
  y: number
  entry: FsEntry
}

export function Explorer() {
  const t = useT()
  const fs = useWorkspace((s) => s.fs)!
  const ws = useWorkspace.getState()
  const selected = useWorkspace((s) => s.selected)
  const [menu, setMenu] = useState<Menu | null>(null)
  const treeRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const rowEl = (path: string) => treeRef.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`)

  // Foco acompanha a seleção quando o usuário navega pelo teclado dentro da árvore.
  useEffect(() => {
    if (selected && treeRef.current?.contains(document.activeElement)) rowEl(selected)?.focus()
  }, [selected])

  useEffect(() => {
    if (!menu) return
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const close = () => setMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
    }
  }, [menu])

  const closeMenu = () => {
    const path = menu?.entry.path
    setMenu(null)
    if (path) requestAnimationFrame(() => rowEl(path)?.focus())
  }

  const openMenuAt = (entry: FsEntry, x: number, y: number) => {
    ws.select(entry.path)
    setMenu({ x, y, entry })
  }

  const onTreeKeyDown = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return
    const items = visibleItems()
    const i = items.findIndex((it) => it.path === selected)
    const current = items[i]
    const move = (to: number) => {
      const next = items[Math.max(0, Math.min(items.length - 1, to))]
      if (next) ws.select(next.path)
    }
    switch (e.key) {
      case 'ArrowDown':
        move(i + 1)
        break
      case 'ArrowUp':
        move(i - 1)
        break
      case 'Home':
        move(0)
        break
      case 'End':
        move(items.length - 1)
        break
      case 'ArrowRight':
        if (current?.kind !== 'dir') return
        if (!useWorkspace.getState().expanded[current.path]) ws.toggleDir(current.path)
        else move(i + 1)
        break
      case 'ArrowLeft':
        if (!current) return
        if (current.kind === 'dir' && useWorkspace.getState().expanded[current.path]) ws.toggleDir(current.path)
        else if (dirname(current.path) !== '/') ws.select(dirname(current.path))
        break
      case 'Enter':
        if (!current) return
        if (current.kind === 'dir') ws.toggleDir(current.path)
        else ws.openFile(current.path)
        break
      case 'F2':
        if (current) ws.startRename(current.path)
        break
      case 'Delete':
        if (current) ws.deleteEntry(current.path)
        break
      case 'ContextMenu':
      case 'F10': {
        if (!current || (e.key === 'F10' && !e.shiftKey)) return
        const r = rowEl(current.path)!.getBoundingClientRect()
        openMenuAt(current, r.left + 24, r.bottom)
        break
      }
      default:
        return
    }
    e.preventDefault()
  }

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const items = [...menuRef.current!.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    const i = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') items[(i + 1) % items.length]?.focus()
    else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length]?.focus()
    else if (e.key === 'Escape' || e.key === 'Tab') closeMenu()
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  const runFromMenu = (fn: () => void) => () => {
    setMenu(null)
    fn()
  }

  return (
    <div className="explorer">
      <div className="sidebar-header">
        <span className="sidebar-title" title={fs.name}>{fs.name}</span>
        <div className="sidebar-actions">
          <button className="icon-btn" title={t('explorer.newFile')} aria-label={t('explorer.newFile')} onClick={() => ws.startCreate(ws.newEntryTarget(), 'file')}><IconFilePlus /></button>
          <button className="icon-btn" title={t('explorer.newFolder')} aria-label={t('explorer.newFolder')} onClick={() => ws.startCreate(ws.newEntryTarget(), 'dir')}><IconFolderPlus /></button>
          <button className="icon-btn" title={t('explorer.refresh')} aria-label={t('explorer.refresh')} onClick={() => ws.refresh()}><IconRefresh /></button>
          <button className="icon-btn" title={t('explorer.collapse')} aria-label={t('explorer.collapse')} onClick={() => ws.collapseAll()}><IconCollapse /></button>
          <span className="actions-divider" aria-hidden />
          <button className="icon-btn" title={t('explorer.close')} aria-label={t('explorer.close')} onClick={() => ws.closeProject()}><IconClose /></button>
        </div>
      </div>
      <div
        ref={treeRef}
        className="tree"
        role="tree"
        aria-label={fs.name}
        onKeyDown={onTreeKeyDown}
        onClick={(e) => e.target === e.currentTarget && ws.select(null)}
      >
        <TreeLevel path="/" depth={0} onMenu={(e, entry) => openMenuAt(entry, e.clientX, e.clientY)} />
      </div>
      {menu && (
        <div
          ref={menuRef}
          className="context-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={onMenuKeyDown}
        >
          {menu.entry.kind === 'dir' && (
            <>
              <button role="menuitem" onClick={runFromMenu(() => ws.startCreate(menu.entry.path, 'file'))}>{t('explorer.newFile')}</button>
              <button role="menuitem" onClick={runFromMenu(() => ws.startCreate(menu.entry.path, 'dir'))}>{t('explorer.newFolder')}</button>
              <hr />
            </>
          )}
          <button role="menuitem" onClick={runFromMenu(() => ws.startRename(menu.entry.path))}>
            {t('explorer.rename')}<kbd>F2</kbd>
          </button>
          <button role="menuitem" className="danger" onClick={runFromMenu(() => ws.deleteEntry(menu.entry.path))}>
            {t('explorer.delete')}<kbd>Del</kbd>
          </button>
        </div>
      )}
    </div>
  )
}

/** Campo de nome inline na árvore (criar ou renomear), no lugar do prompt() do navegador. */
function TreeEdit({ depth, kind, initial }: { depth: number; kind: 'file' | 'dir'; initial: string }) {
  const t = useT()
  const ref = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(initial)
  const ws = useWorkspace.getState()

  useEffect(() => {
    const input = ref.current!
    input.focus()
    // Renomear: seleciona o nome sem a extensão, como no VS Code.
    const dot = initial.lastIndexOf('.')
    input.setSelectionRange(0, dot > 0 ? dot : initial.length)
  }, [initial])

  const commit = async () => {
    const before = useWorkspace.getState().editing
    await ws.commitEdit(value)
    // Saiu do campo com um nome inválido: desiste em vez de prender o usuário.
    if (document.activeElement !== ref.current && useWorkspace.getState().editing === before) ws.cancelEdit()
  }

  return (
    <div className="tree-row tree-edit" style={{ paddingLeft: 8 + depth * 12 }}>
      <span className="chevron-space" />
      <FileIcon name={value || (kind === 'dir' ? 'pasta' : 'arquivo')} kind={kind} />
      <input
        ref={ref}
        value={value}
        aria-label={t(kind === 'dir' ? 'prompt.folderName' : 'prompt.fileName')}
        placeholder={t(kind === 'dir' ? 'prompt.folderName' : 'prompt.fileName')}
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') ws.commitEdit(value)
          else if (e.key === 'Escape') ws.cancelEdit()
        }}
        onBlur={commit}
      />
    </div>
  )
}

/** Itens visíveis da árvore, na ordem da tela (para a navegação por setas). */
function visibleItems(): FsEntry[] {
  const { tree, expanded } = useWorkspace.getState()
  const out: FsEntry[] = []
  const walk = (dir: string) => {
    for (const e of tree[dir] ?? []) {
      out.push(e)
      if (e.kind === 'dir' && expanded[e.path]) walk(e.path)
    }
  }
  walk('/')
  return out
}

function TreeLevel({ path, depth, onMenu }: { path: string; depth: number; onMenu: (e: React.MouseEvent, entry: FsEntry) => void }) {
  const t = useT()
  const entries = useWorkspace((s) => s.tree[path])
  const expanded = useWorkspace((s) => s.expanded)
  const selected = useWorkspace((s) => s.selected)
  const active = useWorkspace((s) => s.active)
  const dirty = useWorkspace((s) => s.dirty)
  const editing = useWorkspace((s) => s.editing)
  const changes = useGit((s) => s.changes)
  const ws = useWorkspace.getState()

  if (!entries) return null
  const creatingHere = editing?.mode === 'create' && editing.dir === path

  if (entries.length === 0 && depth === 0 && !creatingHere) {
    return (
      <div className="tree-empty">
        <p>{t('explorer.empty')}</p>
        <button className="btn-secondary small" onClick={() => ws.startCreate('/', 'file')}>
          <IconFilePlus size={14} /> {t('explorer.newFile')}
        </button>
        <button className="btn-secondary small" onClick={() => ws.startCreate('/', 'dir')}>
          <IconFolderPlus size={14} /> {t('explorer.newFolder')}
        </button>
      </div>
    )
  }

  // Roving tabindex: só o item selecionado (ou o primeiro) entra na ordem do Tab.
  const tabStop = selected && visibleItems().some((e) => e.path === selected) ? selected : useWorkspace.getState().tree['/']?.[0]?.path

  return (
    <>
      {creatingHere && <TreeEdit depth={depth} kind={editing.kind} initial="" />}
      {entries.map((entry) => {
        const open = !!expanded[entry.path]
        const rel = entry.path.slice(1)
        const change =
          entry.kind === 'file'
            ? changes.find((c) => c.file === rel)
            : changes.find((c) => c.file.startsWith(rel + '/'))
        if (editing?.mode === 'rename' && editing.path === entry.path) {
          return <TreeEdit key={entry.path} depth={depth} kind={entry.kind} initial={entry.name} />
        }
        const cls = ['tree-row', selected === entry.path && 'selected', active === entry.path && 'active'].filter(Boolean).join(' ')
        return (
          <div key={entry.path}>
            <div
              className={cls}
              style={{ paddingLeft: 8 + depth * 12 }}
              role="treeitem"
              aria-label={entry.name}
              aria-level={depth + 1}
              aria-selected={selected === entry.path}
              aria-expanded={entry.kind === 'dir' ? open : undefined}
              tabIndex={entry.path === tabStop ? 0 : -1}
              data-path={entry.path}
              onFocus={() => selected !== entry.path && ws.select(entry.path)}
              onClick={() => (entry.kind === 'dir' ? (ws.select(entry.path), ws.toggleDir(entry.path)) : ws.openFile(entry.path))}
              onContextMenu={(e) => {
                e.preventDefault()
                ws.select(entry.path)
                onMenu(e, entry)
              }}
              title={entry.path}
            >
              {entry.kind === 'dir' ? (
                <IconChevron size={14} className={'chevron' + (open ? ' open' : '')} />
              ) : (
                <span className="chevron-space" />
              )}
              <FileIcon name={entry.name} kind={entry.kind} open={open} />
              <span
                className={'tree-name' + (entry.kind === 'dir' ? ' dir' : '') + (change?.status === 'D' ? ' deleted' : '')}
                style={change ? { color: STATUS_COLORS[change.status] } : undefined}
              >
                {entry.name}
              </span>
              {dirty[entry.path] && <span className="dirty-dot" />}
              {change && entry.kind === 'file' && (
                <span className="tree-status" style={{ color: STATUS_COLORS[change.status] }}>{change.status}</span>
              )}
            </div>
            {entry.kind === 'dir' && open && <TreeLevel path={entry.path} depth={depth + 1} onMenu={onMenu} />}
          </div>
        )
      })}
    </>
  )
}
