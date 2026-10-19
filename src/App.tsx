import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useWorkspace } from './store/workspace'
import { useSettings } from './store/settings'
import { useT } from './i18n'
import { Explorer } from './components/Explorer'
import { SettingsView } from './components/SettingsView'
import { Welcome } from './components/Welcome'
import { IconCheck, IconClose, IconFiles, IconGit, IconGlobe, IconLaptop, IconLogo, IconSettings, fileColor } from './components/Icons'

const Editor = lazy(() => import('./components/Editor'))

export default function App() {
  const fs = useWorkspace((s) => s.fs)
  const sidebarVisible = useWorkspace((s) => s.sidebarVisible)
  const sidebarView = useWorkspace((s) => s.sidebarView)
  const tabs = useWorkspace((s) => s.tabs)
  const toast = useWorkspace((s) => s.toast)
  const lang = useSettings((s) => s.lang)

  useEffect(() => {
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en'
  }, [lang])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const ws = useWorkspace.getState()
      if (mod && e.key.toLowerCase() === 'b') {
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
          <Sidebar>{sidebarView === 'settings' ? <SettingsView /> : fs && <Explorer />}</Sidebar>
        )}
        <div className="workbench">
          {fs && tabs.length > 0 ? (
            <>
              <TabBar />
              <Suspense fallback={<div className="editor-loading" />}>
                <Editor />
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
    </div>
  )
}

function ActivityBar() {
  const t = useT()
  const fs = useWorkspace((s) => s.fs)
  const view = useWorkspace((s) => s.sidebarView)
  const visible = useWorkspace((s) => s.sidebarVisible)
  const ws = useWorkspace.getState()
  const on = (v: string) => (visible && view === v && (fs || v === 'settings') ? ' on' : '')
  return (
    <nav className="activity-bar">
      <div className="activity-logo"><IconLogo size={22} /></div>
      <button className={'activity-btn' + on('explorer')} title={t('explorer.title')} disabled={!fs} onClick={() => ws.showSidebar('explorer')}>
        <IconFiles size={20} />
      </button>
      <button className="activity-btn" title={t('welcome.cloneSoon')} disabled>
        <IconGit size={20} />
      </button>
      <div className="spacer" />
      <button className={'activity-btn' + on('settings')} title={t('settings.title')} onClick={() => ws.showSidebar('settings')}>
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
  return (
    <div className="tab-bar">
      {tabs.map((tab) => (
        <div
          key={tab.path}
          className={'tab' + (tab.path === active ? ' active' : '')}
          onClick={() => ws.setActive(tab.path)}
          onAuxClick={(e) => e.button === 1 && ws.closeTab(tab.path)}
          title={tab.path}
        >
          <span className="file-dot" style={{ background: fileColor(tab.name) }} />
          <span className="tab-name">{tab.name}</span>
          <button
            className={'tab-close' + (dirty[tab.path] ? ' dirty' : '')}
            title={t('tab.close')}
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

function EmptyEditor() {
  return (
    <div className="empty-editor">
      <IconLogo size={72} />
    </div>
  )
}

function StatusBar() {
  const t = useT()
  const fs = useWorkspace((s) => s.fs)
  const active = useWorkspace((s) => s.active)
  const cursor = useWorkspace((s) => s.cursor)
  const language = useWorkspace((s) => s.activeLanguage)
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
      <div className="spacer" />
      {offlineReady && (
        <span className="status-item muted" title={t('status.offlineReady')}>
          <IconCheck size={13} /> offline
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
