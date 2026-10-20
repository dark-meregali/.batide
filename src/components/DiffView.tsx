import { useEffect, useRef } from 'react'
import { monaco, getDiffModels, saveFile, editorTheme } from '../editor/monaco'
import { DIFF_PREFIX, useWorkspace } from '../store/workspace'
import { useSettings } from '../store/settings'

/** Diff lado a lado: versão do último commit (esquerda) x arquivo atual (direita, editável). */
export default function DiffView({ tabPath }: { tabPath: string }) {
  const host = useRef<HTMLDivElement>(null)
  const path = tabPath.slice(DIFF_PREFIX.length)
  const fontSize = useSettings((s) => s.fontSize)

  useEffect(() => {
    const editor = monaco.editor.createDiffEditor(host.current!, {
      theme: editorTheme(),
      automaticLayout: true,
      fontFamily: "'JetBrains Mono Variable', 'JetBrains Mono', Consolas, monospace",
      fontSize: useSettings.getState().fontSize,
      renderSideBySide: host.current!.clientWidth > 700,
      useInlineViewWhenSpaceIsLimited: true,
      originalEditable: false,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderOverviewRuler: false,
      padding: { top: 12 },
    })
    const modifiedEditor = editor.getModifiedEditor()
    modifiedEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveFile(path, modifiedEditor))
    for (const ed of [modifiedEditor, editor.getOriginalEditor()]) {
      ed.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyW, () => useWorkspace.getState().closeTab(tabPath))
    }
    let cancelled = false
    getDiffModels(path)
      .then((models) => {
        if (!cancelled && models) editor.setModel(models)
      })
      .catch((e) => useWorkspace.getState().notify(String(e?.message ?? e)))
    return () => {
      cancelled = true
      // Não descarta os modelos: são do registro do editor e podem estar em outra aba.
      editor.setModel(null)
      editor.dispose()
    }
  }, [path, tabPath])

  useEffect(() => {
    // Só a fonte muda depois de criado; o resto vem fixo na criação.
    monaco.editor.getDiffEditors().forEach((d) => d.updateOptions({ fontSize }))
  }, [fontSize])

  return <div ref={host} className="editor-host" />
}
