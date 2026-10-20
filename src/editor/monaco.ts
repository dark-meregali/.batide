import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker'
import { PLSQL_EXTENSIONS, registerPlsql } from './plsql'
import { withFunctionTokens } from './functionTokens'
// Fonte cursiva dos tokens em itálico (nomes de função, comentários). Mesma largura da JetBrains Mono.
import '@fontsource/victor-mono/500-italic.css'
import { DIFF_PREFIX, editorBridge, useWorkspace } from '../store/workspace'
import { BrowserFs } from '../fs/browserFs'
import { useSettings } from '../store/settings'
import { t } from '../i18n'

// Workers empacotados junto com o app: nada vem de CDN, então funciona offline.
self.MonacoEnvironment = {
  getWorker(_id, label) {
    if (label === 'typescript' || label === 'javascript') return new TsWorker()
    if (label === 'json') return new JsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker()
    return new EditorWorker()
  },
}

registerPlsql(monaco)

// Nomes de função em TS/JS: substitui a fábrica de tokenizador do Monaco (registrada no import)
// pela nossa, antes de qualquer arquivo abrir. Sem corrida com o carregamento sob demanda.
monaco.languages.registerTokensProviderFactory('typescript', {
  create: async () => withFunctionTokens((await import('monaco-editor/languages/definitions/typescript/typescript')).language),
})
monaco.languages.registerTokensProviderFactory('javascript', {
  create: async () => withFunctionTokens((await import('monaco-editor/languages/definitions/javascript/javascript')).language),
})

// Projetos web costumam usar JSX e módulos ES modernos.
const tsDefaults = monaco.typescript.typescriptDefaults
const jsDefaults = monaco.typescript.javascriptDefaults
for (const d of [tsDefaults, jsDefaults]) {
  d.setCompilerOptions({
    target: monaco.typescript.ScriptTarget.ESNext,
    module: monaco.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
    jsx: monaco.typescript.JsxEmit.ReactJSX,
    allowJs: true,
    allowNonTsExtensions: true,
    esModuleInterop: true,
    strict: true,
  })
  // Sem acesso a node_modules, imports de pacotes geram falsos erros; mostramos só erros de sintaxe e tipo locais.
  d.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false, diagnosticCodesToIgnore: [2307, 2792, 7016] })
}

monaco.editor.defineTheme('batide-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', foreground: 'd6d7dd' },
    { token: 'comment', foreground: '80849a', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'a99bff' },
    { token: 'type', foreground: '4fd1c5' },
    { token: 'type.identifier', foreground: '4fd1c5' },
    { token: 'predefined', foreground: '7cc4ff' },
    { token: 'function', foreground: '89b4fa', fontStyle: 'italic' },
    { token: 'string', foreground: 'a6d189' },
    { token: 'string.escape', foreground: 'e5c890' },
    { token: 'number', foreground: 'f2a971' },
    { token: 'variable', foreground: 'f28fad' },
    { token: 'operator', foreground: '99a0b3' },
    { token: 'delimiter', foreground: '7d8294' },
    { token: 'tag', foreground: 'a99bff' },
    { token: 'attribute.name', foreground: '7cc4ff' },
    { token: 'attribute.value', foreground: 'a6d189' },
    { token: 'identifier.quote', foreground: 'e5c890' },
  ],
  colors: {
    'editor.background': '#0e0f13',
    'editor.foreground': '#d6d7dd',
    'editorLineNumber.foreground': '#62667a',
    'editorLineNumber.activeForeground': '#9a9db0',
    'editor.lineHighlightBackground': '#16171d',
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#8b7cff40',
    'editor.inactiveSelectionBackground': '#8b7cff20',
    'editorCursor.foreground': '#a99bff',
    'editorIndentGuide.background1': '#1d1f27',
    'editorIndentGuide.activeBackground1': '#34374a',
    'editorWhitespace.foreground': '#2a2c37',
    'editorWidget.background': '#15161c',
    'editorWidget.border': '#25272f',
    'editorSuggestWidget.background': '#15161c',
    'editorSuggestWidget.border': '#25272f',
    'editorSuggestWidget.selectedBackground': '#24253a',
    'editorHoverWidget.background': '#15161c',
    'editorHoverWidget.border': '#25272f',
    'input.background': '#0e0f13',
    'input.border': '#25272f',
    'focusBorder': '#8b7cff80',
    'scrollbarSlider.background': '#ffffff12',
    'scrollbarSlider.hoverBackground': '#ffffff20',
    'scrollbarSlider.activeBackground': '#ffffff2a',
    'editorGutter.background': '#0e0f13',
    'minimap.background': '#0e0f13',
    'editorBracketMatch.background': '#8b7cff25',
    'editorBracketMatch.border': '#8b7cff60',
  },
})

const extLanguages: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json', jsonc: 'json', html: 'html', htm: 'html', vue: 'html', svelte: 'html',
  css: 'css', scss: 'scss', less: 'less', md: 'markdown', markdown: 'markdown',
  yml: 'yaml', yaml: 'yaml', xml: 'xml', svg: 'xml', py: 'python', sh: 'shell', bash: 'shell',
  ps1: 'powershell', java: 'java', cs: 'csharp', go: 'go', rs: 'rust', c: 'c', h: 'c', cpp: 'cpp',
  php: 'php', rb: 'ruby', kt: 'kotlin', swift: 'swift', ini: 'ini', toml: 'ini', dockerfile: 'dockerfile',
  graphql: 'graphql', gql: 'graphql', bat: 'bat', lua: 'lua', r: 'r',
  ...Object.fromEntries(PLSQL_EXTENSIONS.map((e) => [e, 'plsql'])),
}

export function languageFor(path: string) {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
  if (name === 'dockerfile') return 'dockerfile'
  return extLanguages[name.slice(name.lastIndexOf('.') + 1)] ?? 'plaintext'
}

export function languageLabel(id: string) {
  const lang = monaco.languages.getLanguages().find((l) => l.id === id)
  return lang?.aliases?.[0] ?? id
}

// ---- Modelos (um por arquivo aberto) ----

interface Entry {
  model: monaco.editor.ITextModel
  savedVersion: number
  viewState: monaco.editor.ICodeEditorViewState | null
}

const models = new Map<string, Entry>()
const uriFor = (path: string) => monaco.Uri.from({ scheme: 'file', path })

function track(path: string, model: monaco.editor.ITextModel, savedVersion: number) {
  const entry: Entry = { model, savedVersion, viewState: null }
  models.set(path, entry)
  model.onDidChangeContent(() => {
    const cur = models.get(path)
    if (!cur || cur.model !== model) return
    useWorkspace.getState().setDirty(path, model.getAlternativeVersionId() !== cur.savedVersion)
    scheduleAutoSave(path)
  })
  return entry
}

export async function getModel(path: string): Promise<Entry | null> {
  const existing = models.get(path)
  if (existing) return existing
  const fs = useWorkspace.getState().fs
  if (!fs) return null
  const content = await fs.readFile(path)
  // Outro chamado pode ter criado o modelo enquanto o arquivo era lido.
  if (models.has(path)) return models.get(path)!
  const model = monaco.editor.createModel(content, languageFor(path), uriFor(path))
  return track(path, model, model.getAlternativeVersionId())
}

export function saveViewState(path: string, state: monaco.editor.ICodeEditorViewState | null) {
  const e = models.get(path)
  if (e) e.viewState = state
}

export async function saveFile(path: string, editor?: monaco.editor.IStandaloneCodeEditor) {
  const entry = models.get(path)
  const fs = useWorkspace.getState().fs
  if (!entry || !fs) return
  if (useSettings.getState().formatOnSave && editor?.getModel() === entry.model) {
    await editor.getAction('editor.action.formatDocument')?.run()
  }
  const version = entry.model.getAlternativeVersionId()
  try {
    await fs.writeFile(path, entry.model.getValue())
    entry.savedVersion = version
    useWorkspace.getState().setDirty(path, entry.model.getAlternativeVersionId() !== version)
  } catch (e) {
    useWorkspace.getState().notify(t('error.generic', { msg: e instanceof Error ? e.message : String(e) }))
  }
}

const autoSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()
function scheduleAutoSave(path: string) {
  if (!useSettings.getState().autoSave) return
  clearTimeout(autoSaveTimers.get(path))
  autoSaveTimers.set(path, setTimeout(() => saveFile(path), 800))
}

// ---- Diff (HEAD x arquivo atual) ----

const diffOriginals = new Map<string, monaco.editor.ITextModel>()

/** Modelos para a aba de diff: versão do HEAD (somente leitura) e o arquivo editável. */
export async function getDiffModels(path: string) {
  const fs = useWorkspace.getState().fs
  if (!(fs instanceof BrowserFs)) return null
  let original = diffOriginals.get(path)
  if (!original) {
    const { readHead } = await import('../git/git')
    const text = await readHead(fs.root, path.slice(1))
    original = monaco.editor.createModel(text, languageFor(path), monaco.Uri.from({ scheme: 'git', path }))
    diffOriginals.set(path, original)
  }
  // Arquivo apagado: o lado direito fica vazio.
  const modified = (await fs.exists(path))
    ? (await getModel(path))!.model
    : monaco.editor.createModel('', languageFor(path))
  return { original, modified }
}

editorBridge.disposeModel = (path) => {
  if (path.startsWith(DIFF_PREFIX)) {
    const file = path.slice(DIFF_PREFIX.length)
    diffOriginals.get(file)?.dispose()
    diffOriginals.delete(file)
    // O modelo do arquivo foi criado só para o diff: libera se não houver aba do arquivo.
    const open = useWorkspace.getState().tabs.some((t) => t.path === file)
    if (!open && !useWorkspace.getState().dirty[file]) editorBridge.disposeModel?.(file)
    return
  }
  models.get(path)?.model.dispose()
  models.delete(path)
}

editorBridge.save = (path) => saveFile(path)

editorBridge.reloadFromDisk = async (path) => {
  const entry = models.get(path)
  const ws = useWorkspace.getState()
  if (!entry || !ws.fs || ws.dirty[path]) return
  if (!(await ws.fs.exists(path))) {
    ws.closeTab(path)
    return
  }
  const content = await ws.fs.readFile(path)
  if (content !== entry.model.getValue()) {
    entry.model.setValue(content)
    entry.savedVersion = entry.model.getAlternativeVersionId()
    ws.setDirty(path, false)
  }
}

editorBridge.renameModel = (from, to) => {
  const old = models.get(from)
  if (!old) return
  // A URI de um modelo é imutável: recriamos mantendo o conteúdo e o estado "sujo".
  const dirty = old.model.getAlternativeVersionId() !== old.savedVersion
  const model = monaco.editor.createModel(old.model.getValue(), languageFor(to), uriFor(to))
  const entry = track(to, model, dirty ? -1 : model.getAlternativeVersionId())
  entry.viewState = old.viewState
  old.model.dispose()
  models.delete(from)
}

export { monaco }
