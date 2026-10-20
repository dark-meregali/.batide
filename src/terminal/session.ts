import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export interface TerminalSession {
  id: number
  write: (data: string) => Promise<void>
  resize: (cols: number, rows: number) => Promise<void>
  close: () => Promise<void>
}

interface OpenOptions {
  /** Pasta onde o shell começa (a raiz do projeto); null = pasta pessoal. */
  cwd: string | null
  cols: number
  rows: number
  onData: (data: string) => void
  onExit: () => void
}

/**
 * Abre um terminal no Rust. Escuta os eventos ANTES de criar o shell e guarda o que
 * chegar antes de sabermos o id, para não perder o primeiro prompt.
 */
export async function openTerminal({ cwd, cols, rows, onData, onExit }: OpenOptions): Promise<TerminalSession> {
  let id: number | null = null
  const early: { id: number; data: string }[] = []

  const stopData = await listen<{ id: number; data: string }>('terminal://data', ({ payload }) => {
    if (id === null) early.push(payload)
    else if (payload.id === id) onData(payload.data)
  })
  const stopExit = await listen<{ id: number }>('terminal://exit', ({ payload }) => {
    if (payload.id !== id) return
    stop()
    onExit()
  })
  const stop = () => {
    stopData()
    stopExit()
  }

  try {
    id = await invoke<number>('term_spawn', { cwd, cols, rows })
  } catch (e) {
    stop()
    throw e instanceof Error ? e : new Error(String(e))
  }
  for (const chunk of early) if (chunk.id === id) onData(chunk.data)

  const sid = id
  return {
    id: sid,
    write: (data) => invoke('term_write', { id: sid, data }),
    resize: (c, r) => invoke('term_resize', { id: sid, cols: c, rows: r }),
    close: async () => {
      stop()
      await invoke('term_kill', { id: sid }).catch(() => {})
    },
  }
}
