import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { openTerminal, type TerminalSession } from '../terminal/session'
import { useWorkspace } from '../store/workspace'
import { useSettings } from '../store/settings'
import { TauriFs } from '../fs/tauriFs'
import { t as tr, useT } from '../i18n'
import { IconClose } from './Icons'

/**
 * Terminal integrado (só no app desktop). Fica montado mesmo quando escondido, para a
 * sessão do shell continuar viva entre aberturas do painel.
 */
export default function TerminalPanel() {
  const t = useT()
  const visible = useWorkspace((s) => s.terminalVisible)
  const fontSize = useSettings((s) => s.fontSize)
  const host = useRef<HTMLDivElement>(null)
  const term = useRef<Terminal | null>(null)
  const fit = useRef<FitAddon | null>(null)
  const session = useRef<TerminalSession | null>(null)
  const starting = useRef(false)

  const start = async () => {
    const xterm = term.current
    if (!xterm || session.current || starting.current) return
    starting.current = true
    const fs = useWorkspace.getState().fs
    try {
      session.current = await openTerminal({
        cwd: fs instanceof TauriFs ? fs.root : null,
        cols: xterm.cols,
        rows: xterm.rows,
        onData: (data) => xterm.write(data),
        onExit: () => {
          session.current = null
          xterm.write(`\r\n\x1b[2m${tr('terminal.exited')}\x1b[0m\r\n`)
        },
      })
    } catch (e) {
      xterm.write(`\r\n${tr('error.generic', { msg: e instanceof Error ? e.message : String(e) })}\r\n`)
    } finally {
      starting.current = false
    }
  }

  // Cria o xterm na primeira abertura.
  useEffect(() => {
    if (!visible || term.current) return
    const xterm = new Terminal({
      fontFamily: "'JetBrains Mono Variable', 'JetBrains Mono', Consolas, monospace",
      fontSize: useSettings.getState().fontSize,
      cursorBlink: !matchMedia('(prefers-reduced-motion: reduce)').matches,
      allowProposedApi: false,
      theme: {
        background: '#050506',
        foreground: '#ece6e6',
        cursor: '#ff6b6b',
        selectionBackground: '#e5484d55',
        black: '#0f0f12',
        brightBlack: '#6a6366',
        red: '#ff6b6b',
        green: '#8fd3a8',
        yellow: '#e6c587',
        blue: '#7cb7ff',
        magenta: '#ff8fa3',
        cyan: '#7fd1c7',
        white: '#ece6e6',
      },
    })
    const fitAddon = new FitAddon()
    xterm.loadAddon(fitAddon)
    xterm.open(host.current!)
    fitAddon.fit()
    term.current = xterm
    fit.current = fitAddon
    xterm.onData((data) => {
      if (session.current) session.current.write(data)
      else start() // shell encerrado: qualquer tecla reinicia
    })
    xterm.onResize(({ cols, rows }) => session.current?.resize(cols, rows))
    start()
    const observer = new ResizeObserver(() => {
      if (host.current?.offsetParent) fitAddon.fit()
    })
    observer.observe(host.current!)
    return () => observer.disconnect()
  }, [visible])

  useEffect(() => {
    if (!visible || !term.current) return
    requestAnimationFrame(() => {
      fit.current?.fit()
      term.current?.focus()
    })
  }, [visible])

  useEffect(() => {
    if (!term.current) return
    term.current.options.fontSize = fontSize
    fit.current?.fit()
  }, [fontSize])

  // Fecha o shell ao sair da IDE.
  useEffect(() => () => void session.current?.close(), [])

  return (
    <section className="terminal-panel" hidden={!visible} aria-label={t('terminal.title')}>
      <div className="terminal-header">
        <span className="sidebar-title">{t('terminal.title')}</span>
        <button className="icon-btn" title={t('terminal.close')} aria-label={t('terminal.close')} onClick={() => useWorkspace.getState().setTerminal(false)}>
          <IconClose size={14} />
        </button>
      </div>
      <div ref={host} className="terminal-host" />
    </section>
  )
}
