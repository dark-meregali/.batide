import { useGit } from '../store/git'
import { useWorkspace } from '../store/workspace'
import { useAuth } from '../github/auth'
import { useT } from '../i18n'
import { IconArrowDown, IconArrowUp, IconBranch, IconRefresh, IconUndo } from './Icons'
import { FileIcon } from './FileIcon'

export { GIT_STATUS_COLORS as STATUS_COLORS } from '../ui/gitColors'
import { GIT_STATUS_COLORS as STATUS_COLORS } from '../ui/gitColors'

export function SourceControl({ onPickBranch }: { onPickBranch: () => void }) {
  const t = useT()
  const git = useGit()
  const token = useAuth((s) => s.token)
  const ws = useWorkspace.getState()

  if (!git.isRepo) {
    return (
      <div className="scm">
        <div className="sidebar-header"><span className="sidebar-title">{t('git.title')}</span></div>
        <p className="scm-empty">{t('git.notRepo')}</p>
      </div>
    )
  }

  const busy = !!git.busy
  const onCommitKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      git.commit()
    }
  }

  return (
    <div className="scm">
      <div className="sidebar-header">
        <span className="sidebar-title">{t('git.title')}</span>
        <div className="sidebar-actions visible">
          <button className="icon-btn" title={t('git.pull')} disabled={busy} onClick={() => git.pull()}><IconArrowDown /></button>
          <button className="icon-btn" title={t('git.push')} disabled={busy || !token} onClick={() => git.push()}><IconArrowUp /></button>
          <button className="icon-btn" title={t('explorer.refresh')} disabled={busy} onClick={() => git.refresh()}><IconRefresh /></button>
        </div>
      </div>

      <div className="scm-body">
        <button className="scm-branch" onClick={onPickBranch} disabled={busy}>
          <IconBranch size={14} />
          <span>{git.branch ?? 'HEAD'}</span>
          {git.ahead > 0 && <span className="scm-count">↑{git.ahead}</span>}
          {git.behind > 0 && <span className="scm-count">↓{git.behind}</span>}
        </button>

        <textarea
          className="scm-message"
          placeholder={t('git.messagePlaceholder', { branch: git.branch ?? 'HEAD' })}
          value={git.message}
          onChange={(e) => git.setMessage(e.target.value)}
          onKeyDown={onCommitKey}
          rows={3}
        />
        <button className="btn-primary" disabled={busy || !git.changes.length || !git.message.trim()} onClick={() => git.commit()}>
          {git.busy === 'commit' ? '…' : t('git.commit', { n: git.changes.length })}
        </button>
        {(git.ahead !== 0 || git.behind > 0) && (
          <button className="btn-secondary" disabled={busy || !token} onClick={() => git.sync()}>
            {t('git.sync')}
          </button>
        )}
        {!token && <p className="scm-hint">{t('git.loginToSync')}</p>}
        {git.busy && <p className="scm-hint">{git.progress ?? t(`git.busy.${git.busy}` as Parameters<typeof t>[0])}</p>}

        <div className="scm-section">{t('git.changes')} <span className="scm-badge">{git.changes.length}</span></div>
        <div className="scm-list">
          {git.changes.map((c) => {
            const name = c.file.slice(c.file.lastIndexOf('/') + 1)
            const dir = c.file.slice(0, c.file.lastIndexOf('/'))
            return (
              <div key={c.file} className="scm-row" onClick={() => ws.openDiff('/' + c.file)} title={c.file}>
                <FileIcon name={name} kind="file" />
                <span className={'scm-name' + (c.status === 'D' ? ' deleted' : '')}>{name}</span>
                <span className="scm-dir">{dir}</span>
                <button
                  className="icon-btn scm-action"
                  title={t('git.discard')}
                  onClick={(e) => {
                    e.stopPropagation()
                    git.discard(c)
                  }}
                >
                  <IconUndo size={14} />
                </button>
                <span className="scm-status" style={{ color: STATUS_COLORS[c.status] }}>{c.status}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
