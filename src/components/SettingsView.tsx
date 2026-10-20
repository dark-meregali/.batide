import { useState } from 'react'
import { useSettings } from '../store/settings'
import { useT, type Lang } from '../i18n'
import { DEFAULT_PROXY_URL, loginWithToken, startLogin, useAuth } from '../github/auth'
import { useWorkspace } from '../store/workspace'
import { IconGithub } from './Icons'

export function SettingsView() {
  const t = useT()
  const s = useSettings()

  const toggle = (key: 'wordWrap' | 'minimap' | 'formatOnSave' | 'autoSave', label: string) => (
    <label className="setting-row">
      <span>{label}</span>
      <input type="checkbox" className="switch" checked={s[key]} onChange={(e) => s.set({ [key]: e.target.checked })} />
    </label>
  )

  return (
    <div className="settings">
      <div className="sidebar-header">
        <span className="sidebar-title">{t('settings.title')}</span>
      </div>
      <div className="settings-body">
        <label className="setting-row">
          <span>{t('settings.language')}</span>
          <select value={s.lang} onChange={(e) => s.set({ lang: e.target.value as Lang })}>
            <option value="pt">Português</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="setting-row">
          <span>{t('settings.fontSize')}</span>
          <input type="number" min={10} max={28} value={s.fontSize} onChange={(e) => s.set({ fontSize: Number(e.target.value) || 14 })} />
        </label>
        <label className="setting-row">
          <span>{t('settings.tabSize')}</span>
          <select value={s.tabSize} onChange={(e) => s.set({ tabSize: Number(e.target.value) })}>
            <option value={2}>2</option>
            <option value={4}>4</option>
            <option value={8}>8</option>
          </select>
        </label>
        {toggle('wordWrap', t('settings.wordWrap'))}
        {toggle('minimap', t('settings.minimap'))}
        {toggle('formatOnSave', t('settings.formatOnSave'))}
        <label className="setting-row">
          <span>{t('settings.plsqlCase')}</span>
          <select value={s.plsqlKeywordCase} onChange={(e) => s.set({ plsqlKeywordCase: e.target.value as 'lower' | 'upper' })}>
            <option value="lower">{t('settings.plsqlCase.lower')}</option>
            <option value="upper">{t('settings.plsqlCase.upper')}</option>
          </select>
        </label>
        {toggle('autoSave', t('settings.autoSave'))}

        <div className="settings-section">{t('github.title')}</div>
        <GithubSettings />
      </div>
    </div>
  )
}

function GithubSettings() {
  const t = useT()
  const { user, logout } = useAuth()
  const { proxyUrl, set } = useSettings()
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)

  const submitToken = async () => {
    setBusy(true)
    try {
      await loginWithToken(token.trim())
      setToken('')
    } catch (e) {
      useWorkspace.getState().notify(t('github.loginError', { msg: e instanceof Error ? e.message : String(e) }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {user ? (
        <div className="gh-account">
          <img src={user.avatar_url} alt="" width={28} height={28} />
          <div>
            <div className="muted">{t('github.loggedAs')}</div>
            <div>{user.login}</div>
          </div>
          <button className="btn-secondary small" onClick={logout}>{t('github.logout')}</button>
        </div>
      ) : (
        <>
          <button className="btn-primary" onClick={startLogin}>
            <IconGithub size={14} /> {t('github.login')}
          </button>
          <label className="setting-col">
            <span>{t('github.token')}</span>
            <div className="input-row">
              <input type="password" value={token} placeholder={t('github.tokenPlaceholder')} onChange={(e) => setToken(e.target.value)} />
              <button className="btn-secondary small" disabled={!token.trim() || busy} onClick={submitToken}>{t('github.tokenSave')}</button>
            </div>
          </label>
        </>
      )}
      <label className="setting-col">
        <span>{t('github.proxy')}</span>
        <input
          type="url"
          value={proxyUrl}
          placeholder={import.meta.env.VITE_PROXY_URL || DEFAULT_PROXY_URL}
          onChange={(e) => set({ proxyUrl: e.target.value.trim() })}
        />
        <small className="muted">{t('github.proxyHint')}</small>
      </label>
    </>
  )
}
