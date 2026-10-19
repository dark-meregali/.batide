import { useSettings } from '../store/settings'
import { useT, type Lang } from '../i18n'

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
        {toggle('autoSave', t('settings.autoSave'))}
      </div>
    </div>
  )
}
