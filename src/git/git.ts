import { Buffer } from 'buffer'
import git, { type AuthCallback, type ProgressCallback } from 'isomorphic-git'
import http from 'isomorphic-git/http/web'
import { lfs, PROJECTS_DIR } from '../fs/browserFs'
import { commitAuthor, proxyUrl, useAuth } from '../github/auth'

// O isomorphic-git usa Buffer, que não existe no navegador.
;(globalThis as { Buffer?: typeof Buffer }).Buffer ??= Buffer

export type ChangeStatus = 'M' | 'A' | 'D' | 'U'

export interface Change {
  /** Caminho relativo à raiz do repositório, sem "/" inicial. */
  file: string
  status: ChangeStatus
}

const fs = lfs
const onAuth: AuthCallback = () => {
  const token = useAuth.getState().token
  return token ? { username: token, password: 'x-oauth-basic' } : { cancel: true }
}
const remoteOpts = () => ({ http, corsProxy: proxyUrl(), onAuth })

export const isRepo = (dir: string) =>
  fs.promises.stat(`${dir}/.git`).then(
    () => true,
    () => false,
  )

export async function initRepo(dir: string) {
  await git.init({ fs, dir, defaultBranch: 'main' })
}

export async function clone(url: string, name: string, onProgress?: ProgressCallback) {
  const dir = `${PROJECTS_DIR}/${name}`
  try {
    await git.clone({ fs, dir, url, noTags: true, onProgress, ...remoteOpts() })
  } catch (e) {
    // Não deixa um projeto pela metade para trás.
    await removeTree(dir).catch(() => {})
    throw e
  }
  return dir
}

async function removeTree(abs: string) {
  const st = await fs.promises.stat(abs)
  if (st.isDirectory()) {
    for (const child of await fs.promises.readdir(abs)) await removeTree(`${abs}/${child}`)
    await fs.promises.rmdir(abs)
  } else await fs.promises.unlink(abs)
}

export async function currentBranch(dir: string) {
  return (await git.currentBranch({ fs, dir, fullname: false })) ?? null
}

export async function branches(dir: string) {
  const [local, remote] = await Promise.all([
    git.listBranches({ fs, dir }),
    git.listBranches({ fs, dir, remote: 'origin' }).catch(() => [] as string[]),
  ])
  return { local, remote: remote.filter((b) => b !== 'HEAD' && !local.includes(b)) }
}

/**
 * Mudanças em relação ao HEAD. Matriz do isomorphic-git: [arquivo, HEAD, workdir, stage],
 * onde 0 = ausente, 1 = igual ao HEAD, 2 = diferente, 3 = stage diferente do workdir.
 */
export async function status(dir: string): Promise<Change[]> {
  const matrix = await git.statusMatrix({ fs, dir })
  const changes: Change[] = []
  for (const [file, head, workdir, stage] of matrix) {
    if (head === 1 && workdir === 1 && stage === 1) continue
    let st: ChangeStatus
    if (head === 0) st = stage === 0 ? 'U' : 'A'
    else if (workdir === 0) st = 'D'
    else st = 'M'
    changes.push({ file, status: st })
  }
  return changes
}

/** Conteúdo do arquivo no HEAD ('' se for novo). */
export async function readHead(dir: string, file: string) {
  try {
    const oid = await git.resolveRef({ fs, dir, ref: 'HEAD' })
    const { blob } = await git.readBlob({ fs, dir, oid, filepath: file })
    return new TextDecoder().decode(blob)
  } catch {
    return ''
  }
}

/** Faz stage de todas as mudanças (como "git add -A") e cria o commit. */
export async function commitAll(dir: string, message: string) {
  const changes = await status(dir)
  for (const c of changes) {
    if (c.status === 'D') await git.remove({ fs, dir, filepath: c.file })
    else await git.add({ fs, dir, filepath: c.file })
  }
  return git.commit({ fs, dir, message, author: commitAuthor() })
}

/** Descarta as mudanças de um arquivo, voltando para a versão do HEAD. */
export async function discard(dir: string, change: Change) {
  if (change.status === 'U' || change.status === 'A') {
    await git.remove({ fs, dir, filepath: change.file }).catch(() => {})
    await fs.promises.unlink(`${dir}/${change.file}`)
    return
  }
  await git.checkout({ fs, dir, filepaths: [change.file], force: true })
}

export async function checkout(dir: string, ref: string) {
  await git.checkout({ fs, dir, ref, remote: 'origin' })
}

export async function createBranch(dir: string, ref: string) {
  await git.branch({ fs, dir, ref, checkout: true })
}

export async function pull(dir: string, ref: string, onProgress?: ProgressCallback) {
  await git.pull({ fs, dir, ref, singleBranch: true, author: commitAuthor(), onProgress, ...remoteOpts() })
}

export async function push(dir: string, ref: string, onProgress?: ProgressCallback) {
  const res = await git.push({ fs, dir, ref, remote: 'origin', onProgress, ...remoteOpts() })
  if (!res.ok) throw new Error(res.error ?? 'push falhou')
}

/** Commits locais ainda não enviados e commits remotos ainda não baixados. */
export async function aheadBehind(dir: string, ref: string) {
  try {
    const local = await git.resolveRef({ fs, dir, ref })
    const remote = await git.resolveRef({ fs, dir, ref: `refs/remotes/origin/${ref}` })
    if (local === remote) return { ahead: 0, behind: 0 }
    // Commits de cada lado que o outro lado não alcança (histórico limitado a 200).
    const [localLog, remoteLog] = await Promise.all([
      git.log({ fs, dir, ref: local, depth: 200 }),
      git.log({ fs, dir, ref: remote, depth: 200 }),
    ])
    const localSet = new Set(localLog.map((c) => c.oid))
    const remoteSet = new Set(remoteLog.map((c) => c.oid))
    return {
      ahead: localLog.filter((c) => !remoteSet.has(c.oid)).length,
      behind: remoteLog.filter((c) => !localSet.has(c.oid)).length,
    }
  } catch {
    // Branch sem equivalente no remoto: tudo é "à frente".
    return { ahead: -1, behind: 0 }
  }
}

/** URL do repositório no GitHub (owner/repo), se o remoto for do GitHub. */
export async function githubSlug(dir: string) {
  const url = await git.getConfig({ fs, dir, path: 'remote.origin.url' }).catch(() => null)
  const m = /github\.com[/:]([\w.-]+)\/([\w.-]+?)(\.git)?$/.exec(url ?? '')
  return m ? `${m[1]}/${m[2]}` : null
}
