import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }))

const { TauriFs } = await import('../tauriFs')

beforeEach(() => invoke.mockReset())

describe('TauriFs', () => {
  const fs = new TauriFs('/home/eu/projetos/vendas')

  it('usa o nome da pasta como nome do projeto, em qualquer sistema', () => {
    expect(fs.name).toBe('vendas')
    expect(fs.kind).toBe('local')
    expect(new TauriFs('C:\\Users\\eu\\pkg_oracle\\').name).toBe('pkg_oracle')
  })

  it('repassa cada operação ao comando Rust com a raiz do projeto', async () => {
    invoke.mockResolvedValueOnce([{ name: 'src', path: '/src', kind: 'dir' }])
    expect(await fs.readDir('/')).toEqual([{ name: 'src', path: '/src', kind: 'dir' }])
    expect(invoke).toHaveBeenLastCalledWith('fs_read_dir', { root: fs.root, path: '/' })

    invoke.mockResolvedValueOnce('conteúdo')
    expect(await fs.readFile('/a.sql')).toBe('conteúdo')
    expect(invoke).toHaveBeenLastCalledWith('fs_read_file', { root: fs.root, path: '/a.sql' })

    await fs.writeFile('/a.sql', 'x')
    expect(invoke).toHaveBeenLastCalledWith('fs_write_file', { root: fs.root, path: '/a.sql', content: 'x' })
    await fs.mkdir('/lib')
    expect(invoke).toHaveBeenLastCalledWith('fs_mkdir', { root: fs.root, path: '/lib' })
    await fs.remove('/lib')
    expect(invoke).toHaveBeenLastCalledWith('fs_remove', { root: fs.root, path: '/lib' })
    await fs.rename('/a.sql', '/b.sql')
    expect(invoke).toHaveBeenLastCalledWith('fs_rename', { root: fs.root, from: '/a.sql', to: '/b.sql' })
    invoke.mockResolvedValueOnce(true)
    expect(await fs.exists('/b.sql')).toBe(true)
    expect(invoke).toHaveBeenLastCalledWith('fs_exists', { root: fs.root, path: '/b.sql' })
  })

  it('erros do Rust (texto) viram Error com a mensagem', async () => {
    invoke.mockRejectedValueOnce('caminho fora do projeto: /..')
    await expect(fs.readFile('/..')).rejects.toThrow('caminho fora do projeto')
  })
})
