import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useWorkspace } from './store/workspace'
import { useSettings } from './store/settings'
import { useT } from './i18n'
import { Explorer } from './components/Explorer'
import { SettingsView } from './components/SettingsView'
import { Welcome } from './components/Welcome'
import { FileIcon } from './components/FileIcon'
import { DialogHost } from './components/DialogHost'
import { SourceControl } from './components/SourceControl'
import { BranchPicker, CloneDialog } from './components/GitDialogs'
import { useGit } from './store/git'
import { completeLoginFromUrl, useAuth } from './github/auth'
import { DIFF_PREFIX } from './store/workspace'
import { t as tr } from './i18n'
import {
  IconBranch, IconCheck, IconClose, IconFilePlus, IconFiles, IconGit, IconGlobe, IconLaptop, IconLogo, IconSettings,
} from './components/Icons'

const Editor = lazy(() => import('./components/Editor'))
const DiffView = lazy(() => import('./components/DiffView'))

export default function App() {
  const fs = useWorkspace((s) => s.fs)
  const sidebarVisible = useWorkspace((s) => s.sidebarVisible)
  const sidebarView = useWorkspace((s) => s.sidebarView)
  const tabs = useWorkspace((s) => s.tabs)
  const toast = useWorkspace((s) => s.toast)
  const dialog = useWorkspace((s) => s.dialog)
  const active = useWorkspace((s) => s.active)
  const lang = useSettings((s) => s.lang)

  // Volta do login no GitHub (?code=…): troca o code por um token.
  useEffect(() => {
    completeLoginFromUrl()
      .then((result) => {
        if (!result) return
        const ws = useWorkspace.getState()
        if ('error' in result) ws.notify(tr('github.loginError', { msg: result.error }))
        else ws.notify(tr('github.loginOk', { login: useAuth.getState().user?.login ?? '' }))
      })
      .catch((e) => useWorkspace.getState().notify(tr('github.loginError', { msg: String(e?.message ?? e) })))
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en'
  }, [lang])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const ws = useWorkspace.getState()
      if (mod && e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        if (ws.fs) ws.showSidebar('git')
      } else if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        ws.toggleSidebar()
      } else if (e.altKey && e.key.toLowerCase() === 'w' && ws.active) {
        e.preventDefault()
        ws.closeTab(ws.active)
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault() // impede o "Salvar página" do navegador; o editor trata o salvamento
      }
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.values(useWorkspace.getState().dirty).some(Boolean)) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [])

  return (
    <div className="app">
      <div className="main">
        <ActivityBar />
        {sidebarVisible && (fs || sidebarView === 'settings') && (
          <Sidebar>
            {sidebarView === 'settings' ? (
              <SettingsView />
            ) : sidebarView === 'git' ? (
              fs && <SourceControl onPickBranch={() => useWorkspace.getState().setDialog('branch')} />
            ) : (
              fs && <Explorer />
            )}
          </Sidebar>
        )}
        <div className="workbench">
          {fs && tabs.length > 0 ? (
            <>
              <TabBar />
              <Suspense fallback={<div className="editor-loading" />}>
                <Editor />
                {active?.startsWith(DIFF_PREFIX) && <DiffView key={active} tabPath={active} />}
              </Suspense>
            </>
          ) : fs ? (
            <EmptyEditor />
          ) : (
            <Welcome />
          )}
        </div>
      </div>
      <StatusBar />
      {toast && <div className="toast">{toast}</div>}
      {dialog === 'clone' && <CloneDialog onClose={() => useWorkspace.getState().setDialog(null)} />}
      {dialog === 'branch' && <BranchPicker onClose={() => useWorkspace.getState().setDialog(null)} />}
      <DialogHost />
    </div>
  )
}

function ActivityBar() {
  const t = useT()
  const fs = useWorkspace((s) => s.fs)
  const view = useWorkspace((s) => s.sidebarView)
  const visible = useWorkspace((s) => s.sidebarVisible)
  const changes = useGit((s) => s.changes.length)
  const ws = useWorkspace.getState()
  const on = (v: string) => (visible && view === v && (fs || v === 'settings') ? ' on' : '')
  return (
    <nav className="activity-bar">
      <div className="activity-logo"><IconLogo size={22} /></div>
      <button className={'activity-btn' + on('explorer')} title={t('explorer.title')} aria-label={t('explorer.title')} aria-pressed={!!on('explorer')} disabled={!fs} onClick={() => ws.showSidebar('explorer')}>
        <IconFiles size={20} />
      </button>
      <button className={'activity-btn' + on('git')} title={t('git.title') + ' (Ctrl+Shift+G)'} aria-label={t('git.title')} aria-pressed={!!on('git')} disabled={!fs} onClick={() => ws.showSidebar('git')}>
        <IconGit size={20} />
        {changes > 0 && <span className="activity-badge">{changes > 99 ? '99+' : changes}</span>}
      </button>
      <div className="spacer" />
      <button className={'activity-btn' + on('settings')} title={t('settings.title')} aria-label={t('settings.title')} aria-pressed={!!on('settings')} onClick={() => ws.showSidebar('settings')}>
        <IconSettings size={20} />
      </button>
    </nav>
  )
}

function Sidebar({ children }: { children: React.ReactNode }) {
  const width = useSettings((s) => s.sidebarWidth)
  const dragging = useRef(false)

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragging.current) return
      useSettings.getState().set({ sidebarWidth: Math.min(600, Math.max(170, e.clientX - 48)) })
    }
    const up = () => {
      dragging.current = false
      document.body.classList.remove('resizing')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  return (
    <aside className="sidebar" style={{ width }}>
      {children}
      <div
        className="sash"
        onPointerDown={() => {
          dragging.current = true
          document.body.classList.add('resizing')
        }}
      />
    </aside>
  )
}

function TabBar() {
  const t = useT()
  const tabs = useWorkspace((s) => s.tabs)
  const active = useWorkspace((s) => s.active)
  const dirty = useWorkspace((s) => s.dirty)
  const ws = useWorkspace.getState()
  const bar = useRef<HTMLDivElement>(null)

  // Setas movem o foco entre abas; Enter/Espaço ativa (padrão ARIA de tabs).
  const onKeyDown = (e: React.KeyboardEvent) => {
    const els = [...bar.current!.querySelectorAll<HTMLElement>('[role="tab"]')]
    const i = els.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    if (e.key === 'ArrowRight') els[(i + 1) % els.length].focus()
    else if (e.key === 'ArrowLeft') els[(i - 1 + els.length) % els.length].focus()
    else if (e.key === 'Enter' || e.key === ' ') ws.setActive(tabs[i].path)
    else return
    e.preventDefault()
  }

  return (
    <div className="tab-bar" role="tablist" ref={bar} onKeyDown={onKeyDown}>
      {tabs.map((tab) => (
        <div
          key={tab.path}
          className={'tab' + (tab.path === active ? ' active' : '')}
          role="tab"
          aria-label={tab.path.startsWith(DIFF_PREFIX) ? `${tab.name} (diff)` : tab.name}
          aria-selected={tab.path === active}
          tabIndex={tab.path === active ? 0 : -1}
          onClick={() => ws.setActive(tab.path)}
          onAuxClick={(e) => e.button === 1 && ws.closeTab(tab.path)}
          title={tab.path}
        >
          <FileIcon name={tab.name} kind="file" />
          <span className="tab-name">{tab.name}</span>
          <button
            className={'tab-close' + (dirty[tab.path] ? ' dirty' : '')}
            title={t('tab.close')}
            aria-label={`${t('tab.close')} ${tab.name}`}
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation()
              ws.closeTab(tab.path)
            }}
          >
            <IconClose size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}

const MOD = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'

/** Sem arquivo aberto: o que dá para fazer agora, em vez de uma tela vazia. */
function EmptyEditor() {
  const t = useT()
  const ws = useWorkspace.getState()
  return (
    <div className="empty-editor">
      <IconLogo size={56} />
      <div className="empty-actions">
        <button className="welcome-action" onClick={() => ws.startCreate(ws.newEntryTarget(), 'file')}>
          <IconFilePlus /> {t('explorer.newFile')}
        </button>
        <button className="welcome-action" onClick={() => ws.showSidebar('git')}>
          <IconGit /> {t('git.title')}
        </button>
      </div>
      <dl className="shortcuts">
        <dt>{t('shortcut.save')}</dt><dd><kbd>{MOD}</kbd><kbd>S</kbd></dd>
        <dt>{t('shortcut.toggleSidebar')}</dt><dd><kbd>{MOD}</kbd><kbd>B</kbd></dd>
        <dt>{t('git.title')}</dt><dd><kbd>{MOD}</kbd><kbd>Shift</kbd><kbd>G</kbd></dd>
      </dl>
    </div>
  )
}

function StatusBar() {
  const t = useT()
  const fs = useWorkspace((s) => s.fs)
  const active = useWorkspace((s) => s.active)
  const cursor = useWorkspace((s) => s.cursor)
  const language = useWorkspace((s) => s.activeLanguage)
  const isRepo = useGit((s) => s.isRepo)
  const branch = useGit((s) => s.branch)
  const busy = useGit((s) => !!s.busy)
  const { set, lang } = useSettings()
  const [offlineReady, setOfflineReady] = useState(false)

  useRegisterSW({ onOfflineReady: () => setOfflineReady(true), onRegistered: (r) => r?.active && setOfflineReady(true) })

  return (
    <footer className="status-bar">
      {fs && (
        <span className="status-item">
          {fs.kind === 'local' ? <IconLaptop size={13} /> : <IconGlobe size={13} />}
          {fs.name} · {t(fs.kind === 'local' ? 'status.local' : 'status.browser')}
        </span>
      )}
      {isRepo && (
        <button className="status-item status-btn" onClick={() => useWorkspace.getState().setDialog('branch')}>
          <IconBranch size={13} />
          {branch ?? 'HEAD'}
          {busy && ' ⟳'}
        </button>
      )}
      <div className="spacer" />
      {offlineReady && (
        <span className="status-item muted" title={t('status.offlineReady')}>
          <IconCheck size={13} /> {t('status.offlineReadyShort')}
        </span>
      )}
      {active && (
        <>
          <span className="status-item">{t('status.ln', { line: cursor.line, col: cursor.col })}</span>
          <span className="status-item">{language}</span>
        </>
      )}
      <button className="status-item status-btn" onClick={() => set({ lang: lang === 'pt' ? 'en' : 'pt' })}>
        {lang === 'pt' ? 'PT' : 'EN'}
      </button>
    </footer>
  )
}
