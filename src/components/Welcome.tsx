import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { useWorkspace } from '../store/workspace'
import { BrowserFs, createBrowserProject, deleteBrowserProject, listBrowserProjects } from '../fs/browserFs'
import { localFsSupported, pickLocalFolder } from '../fs/localFs'
import { IconGit, IconGlobe, IconLaptop, IconLogo, IconPlus, IconTrash } from './Icons'

const isMac = navigator.platform.toLowerCase().includes('mac')
const mod = isMac ? '⌘' : 'Ctrl'

export function Welcome() {
  const t = useT()
  const ws = useWorkspace.getState()
  const [projects, setProjects] = useState<string[]>([])

  const reload = () => listBrowserProjects().then(setProjects).catch((e) => ws.notify(String(e)))
  useEffect(() => {
    reload()
  }, [])

  const openLocal = async () => {
    if (!localFsSupported()) return ws.notify(t('welcome.openLocalUnsupported'))
    try {
      const fs = await pickLocalFolder()
      if (fs) await ws.openProject(fs)
    } catch (e) {
      ws.notify(t('error.generic', { msg: String(e) }))
    }
  }

  const newProject = async () => {
    const name = prompt(t('prompt.projectName'))?.trim().replace(/[\\/]/g, '-')
    if (!name) return
    if (projects.includes(name)) return ws.notify(t('error.exists'))
    await createBrowserProject(name)
    await ws.openProject(new BrowserFs(name))
  }

  const removeProject = async (name: string) => {
    if (!confirm(t('confirm.deleteProject', { name }))) return
    await deleteBrowserProject(name)
    reload()
  }

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="welcome-brand">
          <IconLogo size={44} />
          <div>
            <h1>Batide</h1>
            <p>{t('app.tagline')}</p>
          </div>
        </div>

        <div className="welcome-grid">
          <section>
            <h2>{t('welcome.start')}</h2>
            <button className="welcome-action" onClick={openLocal}>
              <IconLaptop /> {t('welcome.openLocal')}
            </button>
            <button className="welcome-action" onClick={newProject}>
              <IconPlus /> {t('welcome.newBrowser')}
            </button>
            <button className="welcome-action" onClick={() => ws.setDialog('clone')}>
              <IconGit /> {t('welcome.clone')}
            </button>

            <h2 className="mt">{t('welcome.recentBrowser')}</h2>
            {projects.length === 0 && <p className="muted">{t('welcome.none')}</p>}
            <ul className="project-list">
              {projects.map((name) => (
                <li key={name}>
                  <button className="project-link" onClick={() => ws.openProject(new BrowserFs(name))}>
                    <IconGlobe size={14} /> {name}
                  </button>
                  <button className="icon-btn" title={t('explorer.delete')} onClick={() => removeProject(name)}>
                    <IconTrash size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2>{t('welcome.shortcuts')}</h2>
            <dl className="shortcuts">
              <dt>{t('shortcut.save')}</dt><dd><kbd>{mod}</kbd><kbd>S</kbd></dd>
              <dt>{t('shortcut.format')}</dt><dd><kbd>Shift</kbd><kbd>Alt</kbd><kbd>F</kbd></dd>
              <dt>{t('shortcut.closeTab')}</dt><dd><kbd>Alt</kbd><kbd>W</kbd></dd>
              <dt>{t('shortcut.toggleSidebar')}</dt><dd><kbd>{mod}</kbd><kbd>B</kbd></dd>
              <dt>{t('git.title')}</dt><dd><kbd>{mod}</kbd><kbd>Shift</kbd><kbd>G</kbd></dd>
              <dt>{t('shortcut.commands')}</dt><dd><kbd>F1</kbd></dd>
            </dl>
          </section>
        </div>
      </div>
    </div>
  )
}
