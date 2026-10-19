import { beforeEach, describe, expect, it, vi } from 'vitest'
import iso from 'isomorphic-git'
import { BrowserFs, createBrowserProject, lfs } from '../../fs/browserFs'
import { DIFF_PREFIX, editorBridge, useWorkspace } from '../workspace'
import { useGit } from '../git'
import { useAuth } from '../../github/auth'

let fs: BrowserFs
let n = 0
const g = () => useGit.getState()
const ws = () => useWorkspace.getState()
const author = { name: 'T', email: 't@e.com' }

beforeEach(async () => {
  vi.unstubAllGlobals()
  vi.stubGlobal('confirm', vi.fn(() => true))
  editorBridge.disposeModel = vi.fn()
  editorBridge.reloadFromDisk = vi.fn(async () => {})
  useAuth.setState({ token: null, user: null })
  const name = `gs${++n}`
  await createBrowserProject(name)
  fs = new BrowserFs(name)
  await iso.init({ fs: lfs, dir: fs.root, defaultBranch: 'main' })
  await fs.writeFile('/a.txt', 'A')
  await iso.add({ fs: lfs, dir: fs.root, filepath: 'a.txt' })
  await iso.commit({ fs: lfs, dir: fs.root, message: 'init', author })
  await ws().openProject(fs)
  await g().refresh()
})

describe('refresh', () => {
  it('detecta repositório, branch e alterações', async () => {
    await fs.writeFile('/a.txt', 'mudou')
    await g().refresh()
    expect(g()).toMatchObject({ isRepo: true, branch: 'main', changes: [{ file: 'a.txt', status: 'M' }] })
  })

  it('projeto sem .git não é repositório', async () => {
    await createBrowserProject(`plain${n}`)
    await ws().openProject(new BrowserFs(`plain${n}`))
    await g().refresh()
    expect(g()).toMatchObject({ isRepo: false, branch: null, changes: [] })
  })

  it('atualiza sozinho quando o projeto aberto muda', async () => {
    await createBrowserProject(`plain${n}`)
    await ws().openProject(new BrowserFs(`plain${n}`))
    await vi.waitFor(() => expect(g().isRepo).toBe(false))
  })
})

describe('commit', () => {
  it('exige mensagem', async () => {
    await fs.writeFile('/a.txt', 'mudou')
    await g().refresh()
    await g().commit()
    expect(ws().toast).toMatch(/mensagem|message/i)
    expect(g().changes).toHaveLength(1)
  })

  it('commita, limpa a mensagem e fecha diffs desatualizados', async () => {
    await fs.writeFile('/a.txt', 'mudou')
    await g().refresh()
    ws().openFile('/a.txt')
    ws().openDiff('/a.txt')
    g().setMessage('  minha mensagem  ')
    await g().commit()
    expect(g()).toMatchObject({ changes: [], message: '', busy: null })
    expect(ws().tabs.map((t) => t.path)).toEqual(['/a.txt'])
    const [last] = await iso.log({ fs: lfs, dir: fs.root, depth: 1 })
    expect(last.commit.message.trim()).toBe('minha mensagem')
  })
})

describe('discard', () => {
  it('pede confirmação e recarrega os editores abertos', async () => {
    await fs.writeFile('/a.txt', 'mudou')
    await g().refresh()
    ws().openFile('/a.txt')
    await g().discard(g().changes[0])
    expect(await fs.readFile('/a.txt')).toBe('A')
    expect(editorBridge.reloadFromDisk).toHaveBeenCalledWith('/a.txt')
    expect(g().changes).toEqual([])
  })

  it('não descarta se o usuário cancelar', async () => {
    await fs.writeFile('/a.txt', 'mudou')
    await g().refresh()
    vi.stubGlobal('confirm', vi.fn(() => false))
    await g().discard(g().changes[0])
    expect(await fs.readFile('/a.txt')).toBe('mudou')
  })
})

describe('branches', () => {
  it('cria e troca de branch', async () => {
    await g().createBranch('feature')
    expect(g().branch).toBe('feature')
    expect(g().local.sort()).toEqual(['feature', 'main'])
    await g().checkout('main')
    expect(g().branch).toBe('main')
  })

  it('não troca de branch com alterações se o usuário cancelar', async () => {
    await g().createBranch('feature')
    await fs.writeFile('/a.txt', 'mudou')
    await g().refresh()
    vi.stubGlobal('confirm', vi.fn(() => false))
    await g().checkout('main')
    expect(g().branch).toBe('feature')
  })
})

describe('operações remotas', () => {
  it('push que falha mostra o erro e libera o estado ocupado', async () => {
    // Repositório sem remoto "origin": o push falha.
    await g().push()
    expect(ws().toast).toMatch(/remote/i)
    expect(g().busy).toBeNull()
  })

  it('não roda duas operações ao mesmo tempo', async () => {
    useGit.setState({ busy: 'pull' })
    await fs.writeFile('/a.txt', 'mudou')
    await g().refresh()
    g().setMessage('x')
    await g().commit()
    expect(g().changes).toHaveLength(1)
  })
})

describe('abas de diff', () => {
  it('usam o prefixo de diff', () => {
    ws().openDiff('/a.txt')
    expect(ws().active).toBe(DIFF_PREFIX + '/a.txt')
  })
})
