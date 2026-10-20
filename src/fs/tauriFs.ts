import { invoke } from '@tauri-apps/api/core'
import type { FsEntry, FsProvider } from './types'

/** Erros do Rust chegam como texto; viram Error para o resto da IDE. */
async function call<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args)
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e))
  }
}

/** Pasta do computador aberta no app desktop (Tauri): o Rust lê e grava direto no disco. */
export class TauriFs implements FsProvider {
  kind = 'local' as const
  name: string

  constructor(readonly root: string) {
    this.name = root.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || root
  }

  readDir(path: string) {
    return call<FsEntry[]>('fs_read_dir', { root: this.root, path })
  }
  readFile(path: string) {
    return call<string>('fs_read_file', { root: this.root, path })
  }
  writeFile(path: string, content: string) {
    return call<void>('fs_write_file', { root: this.root, path, content })
  }
  mkdir(path: string) {
    return call<void>('fs_mkdir', { root: this.root, path })
  }
  remove(path: string) {
    return call<void>('fs_remove', { root: this.root, path })
  }
  rename(from: string, to: string) {
    return call<void>('fs_rename', { root: this.root, from, to })
  }
  exists(path: string) {
    return call<boolean>('fs_exists', { root: this.root, path })
  }
}
