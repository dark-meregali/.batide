import type { Page } from '@playwright/test'

/**
 * Simula o app desktop (Tauri) dentro do navegador do teste: IPC, eventos, seletor de pasta,
 * arquivos em memória e um shell falso. Assim dá para testar a integração da interface com
 * o Rust sem compilar o app. O Rust tem os próprios testes (cargo test).
 */
export async function installFakeTauri(page: Page, opts: { folder: string; files: Record<string, string> }) {
  await page.addInitScript(({ folder, files }) => {
    const callbacks = new Map<number, (e: unknown) => void>()
    const listeners: { id: number; event: string; handler: number }[] = []
    let nextId = 1

    const fake = {
      folder,
      files: new Map<string, string>(Object.entries(files)),
      dirs: new Set<string>(),
      calls: [] as { cmd: string; args: Record<string, unknown> }[],
      terminal: { cwd: undefined as string | null | undefined, input: '', killed: false },
      emit(event: string, payload: unknown) {
        for (const l of listeners.filter((x) => x.event === event)) callbacks.get(l.handler)?.({ event, id: l.id, payload })
      },
    }
    // Pastas implícitas a partir dos arquivos.
    const addParents = (p: string) => {
      const parts = p.split('/').filter(Boolean)
      for (let i = 1; i < parts.length; i++) fake.dirs.add('/' + parts.slice(0, i).join('/'))
    }
    for (const p of fake.files.keys()) addParents(p)

    const children = (dir: string) => {
      const prefix = dir === '/' ? '/' : dir + '/'
      const names = new Map<string, 'file' | 'dir'>()
      for (const d of fake.dirs) if (d.startsWith(prefix) && !d.slice(prefix.length).includes('/')) names.set(d.slice(prefix.length), 'dir')
      for (const f of fake.files.keys()) if (f.startsWith(prefix) && !f.slice(prefix.length).includes('/')) names.set(f.slice(prefix.length), 'file')
      return [...names]
        .map(([name, kind]) => ({ name, kind, path: prefix + name }))
        .sort((a, b) => (a.kind !== b.kind ? (a.kind === 'dir' ? -1 : 1) : a.name.localeCompare(b.name)))
    }

    const handle = async (cmd: string, args: Record<string, any> = {}) => {
      fake.calls.push({ cmd, args })
      switch (cmd) {
        case 'plugin:event|listen': {
          const id = nextId++
          listeners.push({ id, event: args.event, handler: args.handler })
          return id
        }
        case 'plugin:event|unlisten': {
          const i = listeners.findIndex((l) => l.id === args.eventId)
          if (i >= 0) listeners.splice(i, 1)
          return null
        }
        case 'plugin:dialog|open':
          return fake.folder
        case 'fs_read_dir':
          return children(args.path)
        case 'fs_read_file':
          if (!fake.files.has(args.path)) throw `arquivo não existe: ${args.path}`
          return fake.files.get(args.path)
        case 'fs_write_file':
          addParents(args.path)
          fake.files.set(args.path, args.content)
          return null
        case 'fs_mkdir':
          addParents(args.path + '/x')
          return null
        case 'fs_exists':
          return fake.files.has(args.path) || fake.dirs.has(args.path)
        case 'fs_remove':
          for (const k of [...fake.files.keys()]) if (k === args.path || k.startsWith(args.path + '/')) fake.files.delete(k)
          for (const k of [...fake.dirs]) if (k === args.path || k.startsWith(args.path + '/')) fake.dirs.delete(k)
          return null
        case 'fs_rename': {
          for (const [k, v] of [...fake.files]) {
            if (k === args.from || k.startsWith(args.from + '/')) {
              fake.files.delete(k)
              const to = args.to + k.slice(args.from.length)
              addParents(to)
              fake.files.set(to, v)
            }
          }
          return null
        }
        case 'term_spawn':
          fake.terminal.cwd = args.cwd
          fake.emit('terminal://data', { id: 1, data: '$ ' }) // prompt chega antes do invoke responder
          return 1
        case 'term_write': {
          fake.terminal.input += args.data
          fake.emit('terminal://data', { id: 1, data: args.data === '\r' ? '' : args.data })
          if (args.data.includes('\r')) {
            const line = fake.terminal.input.replace(/\r$/, '')
            fake.terminal.input = ''
            setTimeout(() => fake.emit('terminal://data', { id: 1, data: `\r\nvocê digitou: ${line}\r\n$ ` }), 10)
          }
          return null
        }
        case 'term_resize':
          return null
        case 'term_kill':
          fake.terminal.killed = true
          return null
        default:
          throw `comando desconhecido no Tauri falso: ${cmd}`
      }
    }

    ;(window as any).__fakeTauri = fake
    ;(window as any).__TAURI_INTERNALS__ = {
      transformCallback(cb: (e: unknown) => void) {
        const id = nextId++
        callbacks.set(id, cb)
        return id
      },
      unregisterCallback: (id: number) => callbacks.delete(id),
      invoke: (cmd: string, args: Record<string, unknown>) => handle(cmd, args),
      convertFileSrc: (p: string) => p,
      metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
    }
    ;(window as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener(_event: string, id: number) {
        const i = listeners.findIndex((l) => l.id === id)
        if (i >= 0) listeners.splice(i, 1)
      },
    }
  }, opts)
}

/** Lê o estado do Tauri falso (arquivos gravados, chamadas, terminal). */
export const fakeState = (page: Page) =>
  page.evaluate(() => {
    const f = (window as any).__fakeTauri
    return { files: Object.fromEntries(f.files), calls: f.calls.map((c: any) => c.cmd), terminal: f.terminal }
  })
