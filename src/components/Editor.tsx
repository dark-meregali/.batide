import { useEffect, useRef } from 'react'
import { monaco, getModel, saveFile, saveViewState, languageLabel } from '../editor/monaco'
import { DIFF_PREFIX, editorBridge, useWorkspace } from '../store/workspace'
import { plsqlEnter } from '../editor/plsqlEnter'
import { useSettings } from '../store/settings'

/** Carregado sob demanda (React.lazy): o Monaco só baixa quando o primeiro arquivo abre. */
export default function Editor() {
  const host = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const shownPath = useRef<string | null>(null)
  const active = useWorkspace((s) => s.active)
  const settings = useSettings()

  useEffect(() => {
    const s = useSettings.getState()
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    const editor = monaco.editor.create(host.current!, {
      model: null,
      theme: 'batide-dark',
      automaticLayout: true,
      fontFamily: "'JetBrains Mono Variable', 'JetBrains Mono', 'Cascadia Code', 'Fira Code', Menlo, Consolas, monospace",
      fontLigatures: true,
      fontSize: s.fontSize,
      tabSize: s.tabSize,
      wordWrap: s.wordWrap ? 'on' : 'off',
      minimap: { enabled: s.minimap },
      smoothScrolling: !reduceMotion,
      cursorBlinking: reduceMotion ? 'solid' : 'smooth',
      cursorSmoothCaretAnimation: reduceMotion ? 'off' : 'on',
      renderLineHighlight: 'all',
      scrollBeyondLastLine: false,
      padding: { top: 12 },
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: 'active', indentation: true },
      stickyScroll: { enabled: true },
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
      overviewRulerBorder: false,
    })
    editorRef.current = editor

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const path = shownPath.current
      if (path) saveFile(path, editor)
    })
    // Alt+W fecha a aba. Registrado no editor porque o Monaco usaria para "palavra inteira" da busca.
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyW, () => {
      const path = useWorkspace.getState().active
      if (path) useWorkspace.getState().closeTab(path)
    })
    // PL/SQL: Enter no padrão da equipe ("--" nos blocos e entre comandos). Shift+Enter fica comum.
    editor.addCommand(
      monaco.KeyCode.Enter,
      () => {
        const model = editor.getModel()
        const pos = editor.getPosition()
        const result =
          model && pos
            ? plsqlEnter({
                lines: model.getLinesContent(),
                line: pos.lineNumber - 1,
                column: pos.column - 1,
                tabSize: model.getOptions().tabSize,
              })
            : null
        if (!model || !pos || !result) {
          editor.trigger('keyboard', 'type', { text: '\n' })
          return
        }
        const ln = pos.lineNumber
        const after = result.after ?? 0
        const edits: monaco.editor.IIdentifiedSingleEditOperation[] = []
        if (result.replaceLine !== undefined) {
          edits.push({ range: new monaco.Range(ln, 1, ln, model.getLineMaxColumn(ln)), text: result.replaceLine })
        } else {
          // Tira espaços sobrando depois do cursor (o cursor está no fim do código da linha).
          edits.push({ range: new monaco.Range(ln, pos.column, ln, model.getLineMaxColumn(ln)), text: '' })
        }
        const anchor = ln + after
        const end = model.getLineMaxColumn(anchor)
        edits.push({ range: new monaco.Range(anchor, end, anchor, end), text: '\n' + result.insert.join('\n') })
        if (result.removeNext) {
          // Apaga a linha seguinte inteira (do fim da atual até o fim dela).
          edits.push({ range: new monaco.Range(ln + 1, 1, ln + 2, 1), text: '' })
        }
        editor.executeEdits('plsql-enter', edits)
        editor.setPosition({ lineNumber: anchor + 1 + result.cursorLine, column: result.cursorColumn + 1 })
        editor.pushUndoStop()
      },
      "editorTextFocus && editorLangId == 'plsql' && !editorReadonly && !editorHasMultipleSelections && !suggestWidgetVisible && !inSnippetMode",
    )
    // No Linux o padrão do Monaco é Ctrl+Shift+I; usamos o mesmo atalho em todo lugar.
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => {
      editor.getAction('editor.action.formatDocument')?.run()
    })
    // Modo "Tab move o foco" (Ctrl+M): mostrado na barra de status para não virar armadilha.
    const toggleTabFocus = () => {
      const on = !editor.getOption(monaco.editor.EditorOption.tabFocusMode)
      editor.updateOptions({ tabFocusMode: on })
      useWorkspace.setState({ tabFocus: on })
    }
    // Ctrl+M em todos os sistemas (no Mac, CtrlCmd seria Cmd+M, que minimiza a janela).
    const isMac = navigator.platform.toLowerCase().includes('mac')
    editor.addCommand((isMac ? monaco.KeyMod.WinCtrl : monaco.KeyMod.CtrlCmd) | monaco.KeyCode.KeyM, toggleTabFocus)
    editorBridge.toggleTabFocus = toggleTabFocus
    editor.onDidChangeCursorPosition((e) =>
      useWorkspace.setState({ cursor: { line: e.position.lineNumber, col: e.position.column } }),
    )
    return () => {
      if (shownPath.current) saveViewState(shownPath.current, editor.saveViewState())
      editor.dispose()
    }
  }, [])

  // Troca de arquivo: salva a posição/rolagem do anterior e restaura a do novo.
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || active?.startsWith(DIFF_PREFIX)) return
    let cancelled = false
    if (shownPath.current) saveViewState(shownPath.current, editor.saveViewState())
    if (!active) {
      shownPath.current = null
      editor.setModel(null)
      return
    }
    getModel(active)
      .then((entry) => {
        if (cancelled || !entry) return
        shownPath.current = active
        editor.setModel(entry.model)
        if (entry.viewState) editor.restoreViewState(entry.viewState)
        const pos = editor.getPosition()
        useWorkspace.setState({
          activeLanguage: languageLabel(entry.model.getLanguageId()),
          cursor: { line: pos?.lineNumber ?? 1, col: pos?.column ?? 1 },
        })
        // Não rouba o foco de um campo em uso (ex.: o nome de um arquivo sendo criado na árvore).
        const focused = document.activeElement
        const typingElsewhere =
          (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) && !host.current?.contains(focused)
        if (!typingElsewhere) editor.focus()
      })
      .catch((e) => useWorkspace.getState().notify(String(e?.message ?? e)))
    return () => {
      cancelled = true
    }
  }, [active])

  useEffect(() => {
    editorRef.current?.updateOptions({
      fontSize: settings.fontSize,
      wordWrap: settings.wordWrap ? 'on' : 'off',
      minimap: { enabled: settings.minimap },
    })
    editorRef.current?.getModel()?.updateOptions({ tabSize: settings.tabSize })
  }, [settings.fontSize, settings.wordWrap, settings.minimap, settings.tabSize])

  return <div ref={host} className="editor-host" hidden={!!active?.startsWith(DIFF_PREFIX)} />
}
