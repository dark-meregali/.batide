import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Lang } from '../i18n'

export type ThemeName = 'modern' | 'carmesim'

export interface Settings {
  lang: Lang
  fontSize: number
  tabSize: number
  wordWrap: boolean
  minimap: boolean
  formatOnSave: boolean
  /** Caixa das palavras-chave PL/SQL nas sugestões, snippets e formatador. */
  plsqlKeywordCase: 'lower' | 'upper'
  /** Cores da interface e do editor. */
  theme: ThemeName
  autoSave: boolean
  sidebarWidth: number
  /** URL do Cloudflare Worker (login OAuth + proxy do git). */
  proxyUrl: string
  /** Pastas do computador abertas no app desktop, mais recentes primeiro. */
  recentFolders: string[]
  set: (patch: Partial<Omit<Settings, 'set'>>) => void
}

const defaultLang: Lang = navigator.language?.toLowerCase().startsWith('pt') ? 'pt' : 'en'

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      lang: defaultLang,
      fontSize: 14,
      tabSize: 2,
      wordWrap: false,
      minimap: false,
      formatOnSave: false,
      plsqlKeywordCase: 'lower',
      theme: 'modern',
      autoSave: false,
      sidebarWidth: 260,
      proxyUrl: '',
      recentFolders: [],
      set: (patch) => set(patch),
    }),
    { name: 'batide.settings' },
  ),
)
