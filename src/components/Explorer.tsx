import { useEffect, useState, type MouseEvent } from 'react'
import { useWorkspace } from '../store/workspace'
import { useT } from '../i18n'
import type { FsEntry } from '../fs/types'
import {
  IconChevron, IconCollapse, IconClose, IconFilePlus, IconFolderPlus, IconRefresh, fileColor,
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
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
    }
  }, [menu])

  // Pasta onde "novo arquivo" vai criar: a selecionada, ou a pasta do arquivo selecionado.
  const targetDir = () => {
    const s = useWorkspace.getState()
    if (!s.selected) return '/'
    const isDir = Object.values(s.tree).some((list) => list.some((e) => e.path === s.selected && e.kind === 'dir'))
    return isDir ? s.selected : s.selected.slice(0, s.selected.lastIndexOf('/')) || '/'
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!selected) return
    if (e.key === 'F2') ws.renameEntry(selected)
    else if (e.key === 'Delete') ws.deleteEntry(selected)
  }

  return (
    <div className="explorer" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="sidebar-header">
        <span className="sidebar-title" title={fs.name}>{fs.name}</span>
        <div className="sidebar-actions">
          <button className="icon-btn" title={t('explorer.newFile')} onClick={() => ws.createEntry(targetDir(), 'file')}><IconFilePlus /></button>
          <button className="icon-btn" title={t('explorer.newFolder')} onClick={() => ws.createEntry(targetDir(), 'dir')}><IconFolderPlus /></button>
          <button className="icon-btn" title={t('explorer.refresh')} onClick={() => ws.refresh()}><IconRefresh /></button>
          <button className="icon-btn" title={t('explorer.collapse')} onClick={() => ws.collapseAll()}><IconCollapse /></button>
          <button className="icon-btn" title={t('explorer.close')} onClick={() => ws.closeProject()}><IconClose /></button>
        </div>
      </div>
      <div className="tree" onClick={(e) => e.target === e.currentTarget && ws.select(null)}>
        <TreeLevel path="/" depth={0} onMenu={(e, entry) => setMenu({ x: e.clientX, y: e.clientY, entry })} />
      </div>
      {menu && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          {menu.entry.kind === 'dir' && (
            <>
              <button onClick={() => { setMenu(null); ws.createEntry(menu.entry.path, 'file') }}>{t('explorer.newFile')}</button>
              <button onClick={() => { setMenu(null); ws.createEntry(menu.entry.path, 'dir') }}>{t('explorer.newFolder')}</button>
              <hr />
            </>
          )}
          <button onClick={() => { setMenu(null); ws.renameEntry(menu.entry.path) }}>{t('explorer.rename')}<kbd>F2</kbd></button>
          <button className="danger" onClick={() => { setMenu(null); ws.deleteEntry(menu.entry.path) }}>{t('explorer.delete')}<kbd>Del</kbd></button>
        </div>
      )}
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
  const ws = useWorkspace.getState()

  if (!entries) return null
  if (entries.length === 0 && depth === 0) return <div className="tree-empty">{t('explorer.empty')}</div>

  return (
    <>
      {entries.map((entry) => {
        const open = !!expanded[entry.path]
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
                <span className="file-dot" style={{ background: fileColor(entry.name) }} />
              )}
              <span className={'tree-name' + (entry.kind === 'dir' ? ' dir' : '')}>{entry.name}</span>
              {dirty[entry.path] && <span className="dirty-dot" />}
            </div>
            {entry.kind === 'dir' && open && <TreeLevel path={entry.path} depth={depth + 1} onMenu={onMenu} />}
          </div>
        )
      })}
    </>
  )
}
