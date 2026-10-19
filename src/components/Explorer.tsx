import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useWorkspace } from '../store/workspace'
import { useGit } from '../store/git'
import { STATUS_COLORS } from './SourceControl'
import { FileIcon } from './FileIcon'
import { useT } from '../i18n'
import type { FsEntry } from '../fs/types'
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

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!selected || e.target instanceof HTMLInputElement) return
    if (e.key === 'F2') ws.startRename(selected)
    else if (e.key === 'Delete') ws.deleteEntry(selected)
  }

  const runFromMenu = (fn: () => void) => () => {
    setMenu(null)
    fn()
  }

  return (
    <div className="explorer" tabIndex={0} onKeyDown={onKeyDown}>
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
      <div className="tree" onClick={(e) => e.target === e.currentTarget && ws.select(null)}>
        <TreeLevel path="/" depth={0} onMenu={(e, entry) => setMenu({ x: e.clientX, y: e.clientY, entry })} />
      </div>
      {menu && (
        <div className="context-menu" role="menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          {menu.entry.kind === 'dir' && (
            <>
              <button role="menuitem" autoFocus onClick={runFromMenu(() => ws.startCreate(menu.entry.path, 'file'))}>{t('explorer.newFile')}</button>
              <button role="menuitem" onClick={runFromMenu(() => ws.startCreate(menu.entry.path, 'dir'))}>{t('explorer.newFolder')}</button>
              <hr />
            </>
          )}
          <button role="menuitem" autoFocus={menu.entry.kind === 'file'} onClick={runFromMenu(() => ws.startRename(menu.entry.path))}>
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

function TreeLevel({ path, depth, onMenu }: { path: string; depth: number; onMenu: (e: MouseEvent, entry: FsEntry) => void }) {
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
