import { beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (e: { payload: unknown }) => void
const handlers: Record<string, Handler[]> = {}
const emit = (event: string, payload: unknown) => handlers[event]?.forEach((h) => h({ payload }))

const invoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, h: Handler) => {
    ;(handlers[event] ??= []).push(h)
    return () => (handlers[event] = handlers[event].filter((x) => x !== h))
  }),
}))

const { openTerminal } = await import('../session')

beforeEach(() => {
  invoke.mockReset()
  for (const k of Object.keys(handlers)) delete handlers[k]
})

describe('openTerminal', () => {
  it('não perde a saída que chega antes do id (ex.: o prompt do shell)', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'term_spawn') {
        emit('terminal://data', { id: 7, data: '$ ' }) // antes do invoke responder
        return 7
      }
    })
    const out: string[] = []
    const term = await openTerminal({ cwd: '/proj', cols: 80, rows: 24, onData: (d) => out.push(d), onExit: () => {} })
    expect(invoke).toHaveBeenCalledWith('term_spawn', { cwd: '/proj', cols: 80, rows: 24 })
    expect(term.id).toBe(7)
    expect(out).toEqual(['$ '])

    emit('terminal://data', { id: 7, data: 'oi\r\n' })
    emit('terminal://data', { id: 8, data: 'de outro terminal' })
    expect(out).toEqual(['$ ', 'oi\r\n'])
  })

  it('escreve, redimensiona e fecha', async () => {
    invoke.mockResolvedValue(3)
    const term = await openTerminal({ cwd: null, cols: 80, rows: 24, onData: () => {}, onExit: () => {} })
    await term.write('ls\r')
    expect(invoke).toHaveBeenLastCalledWith('term_write', { id: 3, data: 'ls\r' })
    await term.resize(100, 30)
    expect(invoke).toHaveBeenLastCalledWith('term_resize', { id: 3, cols: 100, rows: 30 })
    await term.close()
    expect(invoke).toHaveBeenLastCalledWith('term_kill', { id: 3 })
    expect(handlers['terminal://data']).toEqual([])
  })

  it('avisa quando o shell termina e para de escutar', async () => {
    invoke.mockResolvedValue(5)
    const onExit = vi.fn()
    await openTerminal({ cwd: null, cols: 80, rows: 24, onData: () => {}, onExit })
    emit('terminal://exit', { id: 4 })
    expect(onExit).not.toHaveBeenCalled()
    emit('terminal://exit', { id: 5 })
    expect(onExit).toHaveBeenCalledOnce()
    expect(handlers['terminal://data']).toEqual([])
  })
})
