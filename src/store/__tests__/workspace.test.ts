import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserFs, createBrowserProject } from '../../fs/browserFs'
import { DIFF_PREFIX, editorBridge, useWorkspace } from '../workspace'
import { useDialogs } from '../../ui/dialogs'
import { answerDialogs } from '../../test/dialogs'

let fs: BrowserFs
let n = 0
let answered: ReturnType<typeof answerDialogs> | undefined
const ws = () => useWorkspace.getState()
const answer = (...a: unknown[]) => (answered = answerDialogs(...a))

beforeEach(async () => {
  useDialogs.setState({ queue: [] })
  const name = `ws${++n}`
  await createBrowserProject(name)
  fs = new BrowserFs(name)
  await fs.mkdir('/src')
  await fs.writeFile('/src/a.ts', 'a')
  await fs.writeFile('/README.md', '# r')
  await fs.mkdir('/.git')
  editorBridge.disposeModel = vi.fn()
  editorBridge.renameModel = vi.fn()
  editorBridge.save = vi.fn(async () => {})
  useWorkspace.setState({ fs: null, tabs: [], dirty: {}, active: null })
  await ws().openProject(fs)
})

afterEach(() => answered?.unsubscribe())

describe('openProject / closeProject', () => {
  it('carrega a raiz com pastas primeiro e sem a pasta .git', () => {
    expect(ws().tree['/'].map((e) => e.name)).toEqual(['src', 'README.md'])
  })

  it('fecha sem perguntar quando não há alterações', async () => {
    const a = answer()
    ws().openFile('/README.md')
    expect(await ws().closeProject()).toBe(true)
    expect(ws()).toMatchObject({ fs: null, tabs: [], active: null, tree: {} })
    expect(a.asked).toEqual([])
  })

  it('com alterações não salvas, cancelar mantém o projeto aberto', async () => {
    ws().openFile('/README.md')
    ws().setDirty('/README.md', true)
    const a = answer(null)
    expect(await ws().closeProject()).toBe(false)
    expect(ws().fs).toBe(fs)
    expect(ws().tabs).toHaveLength(1)
    expect(a.asked[0]).toMatchObject({ kind: 'choose' })
  })

  it('"Salvar tudo" salva cada arquivo alterado antes de fechar', async () => {
    ws().openFile('/README.md')
    ws().openFile('/src/a.ts')
    ws().setDirty('/README.md', true)
    ws().setDirty('/src/a.ts', true)
    answer('save')
    expect(await ws().closeProject()).toBe(true)
    expect(editorBridge.save).toHaveBeenCalledWith('/README.md')
    expect(editorBridge.save).toHaveBeenCalledWith('/src/a.ts')
    expect(ws().fs).toBeNull()
  })

  it('"Descartar" fecha sem salvar', async () => {
    ws().openFile('/README.md')
    ws().setDirty('/README.md', true)
    answer('discard')
    expect(await ws().closeProject()).toBe(true)
    expect(editorBridge.save).not.toHaveBeenCalled()
    expect(ws().fs).toBeNull()
  })

  it('abrir outro projeto respeita o cancelamento', async () => {
    ws().openFile('/README.md')
    ws().setDirty('/README.md', true)
    answer(null)
    await createBrowserProject(`outro${n}`)
    await ws().openProject(new BrowserFs(`outro${n}`))
    expect(ws().fs).toBe(fs)
  })
})

describe('abas', () => {
  it('abrir o mesmo arquivo duas vezes não duplica a aba', () => {
    ws().openFile('/README.md')
    ws().openFile('/README.md')
    expect(ws().tabs).toHaveLength(1)
    expect(ws().active).toBe('/README.md')
  })

  it('fechar a aba ativa ativa a vizinha', async () => {
    ws().openFile('/a')
    ws().openFile('/b')
    ws().openFile('/c')
    ws().setActive('/b')
    await ws().closeTab('/b')
    expect(ws().active).toBe('/c')
    await ws().closeTab('/c')
    expect(ws().active).toBe('/a')
  })

  it('aba com alterações: cancelar mantém, salvar salva e fecha, descartar fecha', async () => {
    ws().openFile('/README.md')
    ws().setDirty('/README.md', true)
    answer(null, 'save')
    await ws().closeTab('/README.md')
    expect(ws().tabs).toHaveLength(1)
    await ws().closeTab('/README.md')
    expect(editorBridge.save).toHaveBeenCalledWith('/README.md')
    expect(ws().tabs).toHaveLength(0)

    ws().openFile('/src/a.ts')
    ws().setDirty('/src/a.ts', true)
    answered?.unsubscribe()
    answer('discard')
    await ws().closeTab('/src/a.ts')
    expect(ws().tabs).toHaveLength(0)
  })

  it('abre aba de diff separada da aba do arquivo', () => {
    ws().openFile('/README.md')
    ws().openDiff('/README.md')
    expect(ws().tabs.map((t) => t.path)).toEqual(['/README.md', DIFF_PREFIX + '/README.md'])
    expect(ws().active).toBe(DIFF_PREFIX + '/README.md')
    expect(ws().tabs[1].name).toBe('README.md')
  })
})

describe('criar (edição inline na árvore)', () => {
  it('a pasta de destino é a selecionada, ou a pasta do arquivo selecionado, ou a raiz', () => {
    ws().select(null)
    expect(ws().newEntryTarget()).toBe('/')
    ws().select('/src')
    expect(ws().newEntryTarget()).toBe('/src')
    ws().select('/src/a.ts')
    expect(ws().newEntryTarget()).toBe('/src')
  })

  it('startCreate abre a pasta de destino e mostra a linha de edição nela', async () => {
    await ws().startCreate('/src', 'file')
    expect(ws().editing).toEqual({ mode: 'create', dir: '/src', kind: 'file' })
    expect(ws().expanded['/src']).toBe(true)
  })

  it('confirmar cria o arquivo e abre no editor', async () => {
    await ws().startCreate('/src', 'file')
    await ws().commitEdit('novo.ts')
    expect(await fs.readFile('/src/novo.ts')).toBe('')
    expect(ws().active).toBe('/src/novo.ts')
    expect(ws().editing).toBeNull()
  })

  it('aceita subpastas e revela o arquivo abrindo as pastas', async () => {
    await ws().startCreate('/', 'file')
    await ws().commitEdit('a/b/c.sql')
    expect(await fs.exists('/a/b/c.sql')).toBe(true)
    expect(ws().expanded).toMatchObject({ '/a': true, '/a/b': true })
    expect(ws().tree['/a/b'].map((e) => e.name)).toEqual(['c.sql'])
  })

  it('cria pasta', async () => {
    await ws().startCreate('/', 'dir')
    await ws().commitEdit('lib')
    expect((await fs.readDir('/')).find((e) => e.name === 'lib')?.kind).toBe('dir')
    expect(ws().selected).toBe('/lib')
  })

  it('nome existente: avisa e continua editando para corrigir', async () => {
    await ws().startCreate('/', 'file')
    await ws().commitEdit('README.md')
    expect(await fs.readFile('/README.md')).toBe('# r')
    expect(ws().toast).toBeTruthy()
    expect(ws().editing).not.toBeNull()
  })

  it('nome vazio ou cancelar não cria nada', async () => {
    await ws().startCreate('/', 'file')
    await ws().commitEdit('   ')
    expect(ws().editing).toBeNull()
    await ws().startCreate('/', 'file')
    ws().cancelEdit()
    expect(ws().editing).toBeNull()
    expect((await fs.readDir('/')).map((e) => e.name).sort()).toEqual(['.git', 'README.md', 'src'])
  })
})

describe('renomear (edição inline)', () => {
  it('renomeia pasta e atualiza abas, alterações e modelos abertos', async () => {
    ws().openFile('/src/a.ts')
    ws().setDirty('/src/a.ts', true)
    ws().startRename('/src')
    expect(ws().editing).toEqual({ mode: 'rename', path: '/src' })
    await ws().commitEdit('lib')
    expect(await fs.exists('/lib/a.ts')).toBe(true)
    expect(ws().tabs[0]).toEqual({ path: '/lib/a.ts', name: 'a.ts' })
    expect(ws().active).toBe('/lib/a.ts')
    expect(ws().dirty['/lib/a.ts']).toBe(true)
    expect(editorBridge.renameModel).toHaveBeenCalledWith('/src/a.ts', '/lib/a.ts')
    expect(ws().editing).toBeNull()
  })

  it('mesmo nome não faz nada', async () => {
    ws().startRename('/README.md')
    await ws().commitEdit('README.md')
    expect(ws().editing).toBeNull()
    expect(await fs.exists('/README.md')).toBe(true)
  })
})

describe('deleteEntry', () => {
  it('pede confirmação de ação perigosa', async () => {
    const a = answer(false)
    await ws().deleteEntry('/README.md')
    expect(await fs.exists('/README.md')).toBe(true)
    expect(a.asked[0]).toMatchObject({ kind: 'confirm', danger: true })
  })

  it('apaga e fecha as abas de dentro da pasta, mesmo com alterações', async () => {
    answer(true)
    ws().openFile('/src/a.ts')
    ws().setDirty('/src/a.ts', true)
    await ws().deleteEntry('/src')
    expect(await fs.exists('/src')).toBe(false)
    expect(ws().tabs).toEqual([])
  })
})
