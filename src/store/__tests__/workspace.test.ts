import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserFs, createBrowserProject } from '../../fs/browserFs'
import { DIFF_PREFIX, editorBridge, useWorkspace } from '../workspace'

let fs: BrowserFs
let n = 0
const ws = () => useWorkspace.getState()

/** Responde aos prompt() na ordem dada. */
function answer(...values: (string | null)[]) {
  vi.stubGlobal('prompt', vi.fn(() => values.shift() ?? null))
}

beforeEach(async () => {
  vi.unstubAllGlobals()
  vi.stubGlobal('confirm', vi.fn(() => true))
  const name = `ws${++n}`
  await createBrowserProject(name)
  fs = new BrowserFs(name)
  await fs.mkdir('/src')
  await fs.writeFile('/src/a.ts', 'a')
  await fs.writeFile('/README.md', '# r')
  await fs.mkdir('/.git')
  editorBridge.disposeModel = vi.fn()
  editorBridge.renameModel = vi.fn()
  await ws().openProject(fs)
})

describe('openProject', () => {
  it('carrega a raiz com pastas primeiro e sem a pasta .git', () => {
    expect(ws().tree['/'].map((e) => e.name)).toEqual(['src', 'README.md'])
  })

  it('fechar o projeto limpa abas e árvore', async () => {
    ws().openFile('/README.md')
    ws().closeProject()
    expect(ws()).toMatchObject({ fs: null, tabs: [], active: null, tree: {} })
  })
})

describe('abas', () => {
  it('abrir o mesmo arquivo duas vezes não duplica a aba', () => {
    ws().openFile('/README.md')
    ws().openFile('/README.md')
    expect(ws().tabs).toHaveLength(1)
    expect(ws().active).toBe('/README.md')
  })

  it('fechar a aba ativa ativa a vizinha', () => {
    ws().openFile('/a')
    ws().openFile('/b')
    ws().openFile('/c')
    ws().setActive('/b')
    ws().closeTab('/b')
    expect(ws().active).toBe('/c')
    ws().closeTab('/c')
    expect(ws().active).toBe('/a')
  })

  it('pergunta antes de fechar aba com alterações não salvas', () => {
    ws().openFile('/README.md')
    ws().setDirty('/README.md', true)
    vi.stubGlobal('confirm', vi.fn(() => false))
    ws().closeTab('/README.md')
    expect(ws().tabs).toHaveLength(1)
  })

  it('abre aba de diff separada da aba do arquivo', () => {
    ws().openFile('/README.md')
    ws().openDiff('/README.md')
    expect(ws().tabs.map((t) => t.path)).toEqual(['/README.md', DIFF_PREFIX + '/README.md'])
    expect(ws().active).toBe(DIFF_PREFIX + '/README.md')
    expect(ws().tabs[1].name).toBe('README.md')
  })
})

describe('createEntry', () => {
  it('cria arquivo e abre no editor', async () => {
    answer('novo.ts')
    await ws().createEntry('/src', 'file')
    expect(await fs.readFile('/src/novo.ts')).toBe('')
    expect(ws().active).toBe('/src/novo.ts')
  })

  it('aceita caminho com subpastas', async () => {
    answer('a/b/c.sql')
    await ws().createEntry('/', 'file')
    expect(await fs.exists('/a/b/c.sql')).toBe(true)
  })

  it('revela o arquivo criado: abre as pastas intermediárias no explorador', async () => {
    answer('a/b/c.sql')
    await ws().createEntry('/', 'file')
    expect(ws().expanded).toMatchObject({ '/a': true, '/a/b': true })
    expect(ws().tree['/a/b'].map((e) => e.name)).toEqual(['c.sql'])
  })

  it('não sobrescreve item existente', async () => {
    answer('README.md')
    await ws().createEntry('/', 'file')
    expect(await fs.readFile('/README.md')).toBe('# r')
    expect(ws().toast).toBeTruthy()
  })
})

describe('renameEntry', () => {
  it('renomeia pasta e atualiza abas, alterações e modelos abertos', async () => {
    ws().openFile('/src/a.ts')
    ws().setDirty('/src/a.ts', true)
    answer('lib')
    await ws().renameEntry('/src')
    expect(await fs.exists('/lib/a.ts')).toBe(true)
    expect(ws().tabs[0]).toEqual({ path: '/lib/a.ts', name: 'a.ts' })
    expect(ws().active).toBe('/lib/a.ts')
    expect(ws().dirty['/lib/a.ts']).toBe(true)
    expect(editorBridge.renameModel).toHaveBeenCalledWith('/src/a.ts', '/lib/a.ts')
  })
})

describe('deleteEntry', () => {
  it('apaga e fecha as abas de dentro da pasta, mesmo com alterações', async () => {
    ws().openFile('/src/a.ts')
    ws().setDirty('/src/a.ts', true)
    await ws().deleteEntry('/src')
    expect(await fs.exists('/src')).toBe(false)
    expect(ws().tabs).toEqual([])
  })
})
