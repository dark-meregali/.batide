export interface FsEntry {
  name: string
  /** Caminho POSIX absoluto dentro do projeto, ex.: "/src/main.ts". A raiz é "/". */
  path: string
  kind: 'file' | 'dir'
}

/**
 * Abstração do sistema de arquivos. Cada ambiente tem a sua implementação:
 * navegador (IndexedDB), pasta local (File System Access API) e, na fase 3, Tauri.
 */
export interface FsProvider {
  kind: 'browser' | 'local'
  /** Nome do projeto, mostrado na barra lateral. */
  name: string
  readDir(path: string): Promise<FsEntry[]>
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  mkdir(path: string): Promise<void>
  remove(path: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  exists(path: string): Promise<boolean>
}

export const joinPath = (dir: string, name: string) => (dir === '/' ? `/${name}` : `${dir}/${name}`)
export const dirname = (p: string) => p.slice(0, p.lastIndexOf('/')) || '/'
export const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1)

export function sortEntries(entries: FsEntry[]) {
  return entries.sort((a, b) =>
    a.kind !== b.kind ? (a.kind === 'dir' ? -1 : 1) : a.name.localeCompare(b.name, undefined, { numeric: true }),
  )
}
