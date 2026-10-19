import LightningFS from '@isomorphic-git/lightning-fs'
import { type FsEntry, type FsProvider, joinPath, sortEntries } from './types'

/**
 * Sistema de arquivos persistido no IndexedDB do navegador. É compartilhado com o
 * isomorphic-git (fase 2), então repositórios clonados vivem aqui também.
 */
export const lfs = new LightningFS('batide')
const pfs = lfs.promises

export const PROJECTS_DIR = '/projects'

async function ensureDir(path: string) {
  try {
    await pfs.mkdir(path)
  } catch (e) {
    if ((e as { code?: string }).code !== 'EEXIST') throw e
  }
}

export async function listBrowserProjects(): Promise<string[]> {
  await ensureDir(PROJECTS_DIR)
  const names = await pfs.readdir(PROJECTS_DIR)
  return names.sort((a, b) => a.localeCompare(b))
}

export async function createBrowserProject(name: string) {
  await ensureDir(PROJECTS_DIR)
  await pfs.mkdir(`${PROJECTS_DIR}/${name}`)
}

export async function deleteBrowserProject(name: string) {
  await removeRecursive(`${PROJECTS_DIR}/${name}`)
}

async function removeRecursive(abs: string) {
  const st = await pfs.stat(abs)
  if (st.isDirectory()) {
    for (const child of await pfs.readdir(abs)) await removeRecursive(`${abs}/${child}`)
    await pfs.rmdir(abs)
  } else {
    await pfs.unlink(abs)
  }
}

export class BrowserFs implements FsProvider {
  kind = 'browser' as const
  private root: string

  constructor(public name: string) {
    this.root = `${PROJECTS_DIR}/${name}`
  }

  private abs(path: string) {
    return path === '/' ? this.root : this.root + path
  }

  async readDir(path: string): Promise<FsEntry[]> {
    const names = await pfs.readdir(this.abs(path))
    const entries = await Promise.all(
      names.map(async (name) => {
        const st = await pfs.stat(this.abs(joinPath(path, name)))
        return { name, path: joinPath(path, name), kind: st.isDirectory() ? 'dir' : 'file' } as FsEntry
      }),
    )
    return sortEntries(entries)
  }

  async readFile(path: string) {
    return (await pfs.readFile(this.abs(path), { encoding: 'utf8' })) as string
  }

  writeFile(path: string, content: string) {
    return pfs.writeFile(this.abs(path), content, { encoding: 'utf8', mode: 0o666 })
  }

  mkdir(path: string) {
    return pfs.mkdir(this.abs(path))
  }

  remove(path: string) {
    return removeRecursive(this.abs(path))
  }

  rename(from: string, to: string) {
    return pfs.rename(this.abs(from), this.abs(to))
  }

  async exists(path: string) {
    try {
      await pfs.stat(this.abs(path))
      return true
    } catch {
      return false
    }
  }
}
