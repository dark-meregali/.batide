import { type FsEntry, type FsProvider, basename, dirname, joinPath, sortEntries } from './types'

// A File System Access API ainda não está completa nos tipos do TypeScript.
declare global {
  interface Window {
    showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
  }
  interface FileSystemDirectoryHandle {
    values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>
  }
}

export const localFsSupported = () => typeof window.showDirectoryPicker === 'function'

export async function pickLocalFolder(): Promise<LocalFs | null> {
  try {
    const handle = await window.showDirectoryPicker!({ mode: 'readwrite' })
    return new LocalFs(handle)
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return null
    throw e
  }
}

/** Pasta real do computador, aberta pelo navegador (Chrome/Edge). */
export class LocalFs implements FsProvider {
  kind = 'local' as const
  name: string

  constructor(private root: FileSystemDirectoryHandle) {
    this.name = root.name
  }

  private async dir(path: string, create = false): Promise<FileSystemDirectoryHandle> {
    let h = this.root
    for (const part of path.split('/').filter(Boolean)) h = await h.getDirectoryHandle(part, { create })
    return h
  }

  async readDir(path: string): Promise<FsEntry[]> {
    const entries: FsEntry[] = []
    for await (const h of (await this.dir(path)).values()) {
      entries.push({ name: h.name, path: joinPath(path, h.name), kind: h.kind === 'directory' ? 'dir' : 'file' })
    }
    return sortEntries(entries)
  }

  async readFile(path: string) {
    const fh = await (await this.dir(dirname(path))).getFileHandle(basename(path))
    return (await fh.getFile()).text()
  }

  async writeFile(path: string, content: string) {
    const fh = await (await this.dir(dirname(path))).getFileHandle(basename(path), { create: true })
    const w = await fh.createWritable()
    await w.write(content)
    await w.close()
  }

  async mkdir(path: string) {
    await (await this.dir(dirname(path))).getDirectoryHandle(basename(path), { create: true })
  }

  async remove(path: string) {
    await (await this.dir(dirname(path))).removeEntry(basename(path), { recursive: true })
  }

  async rename(from: string, to: string) {
    // Não há "rename" portátil na API; copiamos e removemos.
    await this.copy(from, to)
    await this.remove(from)
  }

  private async copy(from: string, to: string) {
    const parent = await this.dir(dirname(from))
    let isDir = true
    try {
      await parent.getDirectoryHandle(basename(from))
    } catch {
      isDir = false
    }
    if (!isDir) {
      const fh = await parent.getFileHandle(basename(from))
      const data = await (await fh.getFile()).arrayBuffer()
      const target = await (await this.dir(dirname(to))).getFileHandle(basename(to), { create: true })
      const w = await target.createWritable()
      await w.write(data)
      await w.close()
      return
    }
    await this.mkdir(to)
    for (const child of await this.readDir(from)) await this.copy(child.path, joinPath(to, child.name))
  }

  async exists(path: string) {
    if (path === '/') return true
    const parent = await this.dir(dirname(path)).catch(() => null)
    if (!parent) return false
    for await (const h of parent.values()) if (h.name === basename(path)) return true
    return false
  }
}
