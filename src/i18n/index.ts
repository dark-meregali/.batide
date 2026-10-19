import { useSettings } from '../store/settings'

export type Lang = 'pt' | 'en'

const pt = {
  'app.tagline': 'Uma IDE leve e rápida, no navegador e no desktop.',
  'welcome.start': 'Começar',
  'welcome.openLocal': 'Abrir pasta do computador',
  'welcome.openLocalUnsupported': 'Seu navegador não permite abrir pastas locais. Use Chrome ou Edge, ou o app desktop.',
  'welcome.newBrowser': 'Novo projeto no navegador',
  'welcome.recentBrowser': 'Projetos salvos no navegador',
  'welcome.none': 'Nenhum projeto ainda.',
  'welcome.cloneSoon': 'Clonar do GitHub (em breve)',
  'welcome.shortcuts': 'Atalhos',
  'explorer.title': 'Explorador',
  'explorer.newFile': 'Novo arquivo',
  'explorer.newFolder': 'Nova pasta',
  'explorer.rename': 'Renomear',
  'explorer.delete': 'Excluir',
  'explorer.refresh': 'Atualizar',
  'explorer.collapse': 'Recolher tudo',
  'explorer.close': 'Fechar projeto',
  'explorer.empty': 'Pasta vazia',
  'prompt.fileName': 'Nome do arquivo',
  'prompt.folderName': 'Nome da pasta',
  'prompt.projectName': 'Nome do projeto',
  'prompt.newName': 'Novo nome',
  'confirm.delete': 'Excluir "{name}"? Isso não pode ser desfeito.',
  'confirm.unsaved': '"{name}" tem alterações não salvas. Fechar mesmo assim?',
  'confirm.deleteProject': 'Excluir o projeto "{name}" do navegador?',
  'settings.title': 'Configurações',
  'settings.language': 'Idioma',
  'settings.fontSize': 'Tamanho da fonte',
  'settings.tabSize': 'Tamanho do tab',
  'settings.wordWrap': 'Quebra de linha',
  'settings.minimap': 'Minimapa',
  'settings.formatOnSave': 'Formatar ao salvar',
  'settings.autoSave': 'Salvar automaticamente',
  'status.ln': 'Ln {line}, Col {col}',
  'status.offlineReady': 'Pronto para uso offline',
  'status.saved': 'Salvo',
  'status.browser': 'Navegador',
  'status.local': 'Local',
  'tab.close': 'Fechar',
  'error.generic': 'Algo deu errado: {msg}',
  'error.exists': 'Já existe um item com esse nome.',
  'shortcut.save': 'Salvar',
  'shortcut.format': 'Formatar documento',
  'shortcut.closeTab': 'Fechar aba',
  'shortcut.toggleSidebar': 'Mostrar/ocultar barra lateral',
  'shortcut.commands': 'Comandos do editor',
}

type Key = keyof typeof pt

const en: Record<Key, string> = {
  'app.tagline': 'A fast, lightweight IDE for the browser and desktop.',
  'welcome.start': 'Start',
  'welcome.openLocal': 'Open folder from computer',
  'welcome.openLocalUnsupported': 'Your browser cannot open local folders. Use Chrome or Edge, or the desktop app.',
  'welcome.newBrowser': 'New project in browser',
  'welcome.recentBrowser': 'Projects saved in browser',
  'welcome.none': 'No projects yet.',
  'welcome.cloneSoon': 'Clone from GitHub (coming soon)',
  'welcome.shortcuts': 'Shortcuts',
  'explorer.title': 'Explorer',
  'explorer.newFile': 'New file',
  'explorer.newFolder': 'New folder',
  'explorer.rename': 'Rename',
  'explorer.delete': 'Delete',
  'explorer.refresh': 'Refresh',
  'explorer.collapse': 'Collapse all',
  'explorer.close': 'Close project',
  'explorer.empty': 'Empty folder',
  'prompt.fileName': 'File name',
  'prompt.folderName': 'Folder name',
  'prompt.projectName': 'Project name',
  'prompt.newName': 'New name',
  'confirm.delete': 'Delete "{name}"? This cannot be undone.',
  'confirm.unsaved': '"{name}" has unsaved changes. Close anyway?',
  'confirm.deleteProject': 'Delete project "{name}" from the browser?',
  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.fontSize': 'Font size',
  'settings.tabSize': 'Tab size',
  'settings.wordWrap': 'Word wrap',
  'settings.minimap': 'Minimap',
  'settings.formatOnSave': 'Format on save',
  'settings.autoSave': 'Auto save',
  'status.ln': 'Ln {line}, Col {col}',
  'status.offlineReady': 'Ready to work offline',
  'status.saved': 'Saved',
  'status.browser': 'Browser',
  'status.local': 'Local',
  'tab.close': 'Close',
  'error.generic': 'Something went wrong: {msg}',
  'error.exists': 'An item with that name already exists.',
  'shortcut.save': 'Save',
  'shortcut.format': 'Format document',
  'shortcut.closeTab': 'Close tab',
  'shortcut.toggleSidebar': 'Toggle sidebar',
  'shortcut.commands': 'Editor commands',
}

const dicts: Record<Lang, Record<Key, string>> = { pt, en }

export function translate(lang: Lang, key: Key, params?: Record<string, string | number>) {
  let s = dicts[lang][key] ?? key
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}

/** Tradução fora de componentes React (ex.: confirm/prompt em ações do store). */
export const t = (key: Key, params?: Record<string, string | number>) =>
  translate(useSettings.getState().lang, key, params)

export function useT() {
  const lang = useSettings((s) => s.lang)
  return (key: Key, params?: Record<string, string | number>) => translate(lang, key, params)
}
