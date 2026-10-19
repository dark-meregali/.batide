import { beforeEach, describe, expect, it } from 'vitest'
import iso from 'isomorphic-git'
import { lfs, createBrowserProject, PROJECTS_DIR } from '../../fs/browserFs'
import * as git from '../git'
import { useAuth } from '../../github/auth'
import { useSettings } from '../../store/settings'

const pfs = lfs.promises
const author = { name: 'Teste', email: 't@example.com' }
let dir: string
let n = 0

async function write(file: string, content: string) {
  await pfs.writeFile(`${dir}/${file}`, content, { encoding: 'utf8', mode: 0o666 })
}
async function read(file: string) {
  return (await pfs.readFile(`${dir}/${file}`, { encoding: 'utf8' })) as string
}
const exists = (file: string) => pfs.stat(`${dir}/${file}`).then(() => true, () => false)

/** Repositório com um commit contendo a.txt e b.txt, na branch main. */
beforeEach(async () => {
  const name = `repo${++n}`
  await createBrowserProject(name)
  dir = `${PROJECTS_DIR}/${name}`
  await iso.init({ fs: lfs, dir, defaultBranch: 'main' })
  await write('a.txt', 'A\n')
  await write('b.txt', 'B\n')
  await iso.add({ fs: lfs, dir, filepath: '.' })
  await iso.commit({ fs: lfs, dir, message: 'inicial', author })
  useAuth.setState({ token: null, user: { login: 'octo', name: 'Octo Cat', id: 7, email: null, avatar_url: '' } })
  useSettings.setState({ proxyUrl: '' })
})

describe('isRepo', () => {
  it('reconhece repositórios e pastas comuns', async () => {
    await createBrowserProject(`plain${n}`)
    expect(await git.isRepo(dir)).toBe(true)
    expect(await git.isRepo(`${PROJECTS_DIR}/plain${n}`)).toBe(false)
  })
})

describe('status', () => {
  it('fica vazio sem alterações', async () => {
    expect(await git.status(dir)).toEqual([])
  })

  it('classifica modificado, novo e apagado', async () => {
    await write('a.txt', 'A mudou\n')
    await write('novo.txt', 'N\n')
    await pfs.unlink(`${dir}/b.txt`)
    const changes = await git.status(dir)
    expect(changes).toEqual(
      expect.arrayContaining([
        { file: 'a.txt', status: 'M' },
        { file: 'novo.txt', status: 'U' },
        { file: 'b.txt', status: 'D' },
      ]),
    )
    expect(changes).toHaveLength(3)
  })

  it('arquivo novo já em stage aparece como A', async () => {
    await write('novo.txt', 'N\n')
    await iso.add({ fs: lfs, dir, filepath: 'novo.txt' })
    expect(await git.status(dir)).toEqual([{ file: 'novo.txt', status: 'A' }])
  })
})

describe('readHead', () => {
  it('lê o conteúdo do último commit, ignorando o que está no disco', async () => {
    await write('a.txt', 'outro\n')
    expect(await git.readHead(dir, 'a.txt')).toBe('A\n')
  })

  it('devolve vazio para arquivo que não existe no HEAD', async () => {
    expect(await git.readHead(dir, 'nao-existe.txt')).toBe('')
  })
})

describe('commitAll', () => {
  it('commita modificações, arquivos novos e remoções de uma vez', async () => {
    await write('a.txt', 'A2\n')
    await write('pasta/c.txt', 'C\n').catch(async () => {
      await pfs.mkdir(`${dir}/pasta`)
      await write('pasta/c.txt', 'C\n')
    })
    await pfs.unlink(`${dir}/b.txt`)

    await git.commitAll(dir, 'mudanças')

    expect(await git.status(dir)).toEqual([])
    const [last] = await iso.log({ fs: lfs, dir, depth: 1 })
    expect(last.commit.message.trim()).toBe('mudanças')
    expect(await git.readHead(dir, 'pasta/c.txt')).toBe('C\n')
    expect(await git.readHead(dir, 'b.txt')).toBe('')
  })

  it('usa o usuário do GitHub como autor, com e-mail noreply se o e-mail for privado', async () => {
    await write('a.txt', 'A2\n')
    await git.commitAll(dir, 'msg')
    const [last] = await iso.log({ fs: lfs, dir, depth: 1 })
    expect(last.commit.author.name).toBe('Octo Cat')
    expect(last.commit.author.email).toBe('7+octo@users.noreply.github.com')
  })
})

describe('discard', () => {
  it('volta um arquivo modificado para a versão do HEAD', async () => {
    await write('a.txt', 'estragado\n')
    await git.discard(dir, { file: 'a.txt', status: 'M' })
    expect(await read('a.txt')).toBe('A\n')
    expect(await git.status(dir)).toEqual([])
  })

  it('restaura um arquivo apagado', async () => {
    await pfs.unlink(`${dir}/b.txt`)
    await git.discard(dir, { file: 'b.txt', status: 'D' })
    expect(await read('b.txt')).toBe('B\n')
  })

  it('apaga um arquivo novo', async () => {
    await write('novo.txt', 'N\n')
    await git.discard(dir, { file: 'novo.txt', status: 'U' })
    expect(await exists('novo.txt')).toBe(false)
    expect(await git.status(dir)).toEqual([])
  })

  it('não mexe nos outros arquivos alterados', async () => {
    await write('a.txt', 'A2\n')
    await write('b.txt', 'B2\n')
    await git.discard(dir, { file: 'a.txt', status: 'M' })
    expect(await read('b.txt')).toBe('B2\n')
  })
})

describe('branches', () => {
  it('lista, cria e troca de branch', async () => {
    expect(await git.currentBranch(dir)).toBe('main')
    await git.createBranch(dir, 'feature')
    expect(await git.currentBranch(dir)).toBe('feature')
    await write('a.txt', 'na feature\n')
    await git.commitAll(dir, 'feature')

    await git.checkout(dir, 'main')
    expect(await git.currentBranch(dir)).toBe('main')
    expect(await read('a.txt')).toBe('A\n')
    expect((await git.branches(dir)).local.sort()).toEqual(['feature', 'main'])
  })

  it('separa branches remotas que ainda não existem localmente', async () => {
    const head = await iso.resolveRef({ fs: lfs, dir, ref: 'HEAD' })
    await iso.writeRef({ fs: lfs, dir, ref: 'refs/remotes/origin/main', value: head })
    await iso.writeRef({ fs: lfs, dir, ref: 'refs/remotes/origin/outra', value: head })
    expect(await git.branches(dir)).toEqual({ local: ['main'], remote: ['outra'] })
  })
})

describe('aheadBehind', () => {
  it('conta commits locais não enviados e remotos não baixados', async () => {
    const base = await iso.resolveRef({ fs: lfs, dir, ref: 'HEAD' })
    await iso.writeRef({ fs: lfs, dir, ref: 'refs/remotes/origin/main', value: base })
    expect(await git.aheadBehind(dir, 'main')).toEqual({ ahead: 0, behind: 0 })

    await write('a.txt', '1\n')
    await git.commitAll(dir, 'um')
    await write('a.txt', '2\n')
    await git.commitAll(dir, 'dois')
    expect(await git.aheadBehind(dir, 'main')).toEqual({ ahead: 2, behind: 0 })
  })

  it('conta commits do remoto que ainda não foram baixados', async () => {
    await git.createBranch(dir, 'tmp')
    await write('a.txt', 'remoto\n')
    await git.commitAll(dir, 'remoto')
    const remoteHead = await iso.resolveRef({ fs: lfs, dir, ref: 'HEAD' })
    await git.checkout(dir, 'main')
    await iso.writeRef({ fs: lfs, dir, ref: 'refs/remotes/origin/main', value: remoteHead })
    expect(await git.aheadBehind(dir, 'main')).toEqual({ ahead: 0, behind: 1 })
  })

  it('conta os dois lados quando local e remoto divergiram', async () => {
    await git.createBranch(dir, 'tmp')
    await write('a.txt', 'remoto\n')
    await git.commitAll(dir, 'remoto')
    const remoteHead = await iso.resolveRef({ fs: lfs, dir, ref: 'HEAD' })
    await git.checkout(dir, 'main')
    await iso.writeRef({ fs: lfs, dir, ref: 'refs/remotes/origin/main', value: remoteHead })
    await write('b.txt', 'local\n')
    await git.commitAll(dir, 'local')
    expect(await git.aheadBehind(dir, 'main')).toEqual({ ahead: 1, behind: 1 })
  })

  it('branch sem remoto conta como "nunca enviada"', async () => {
    expect(await git.aheadBehind(dir, 'main')).toEqual({ ahead: -1, behind: 0 })
  })
})

describe('githubSlug', () => {
  it.each([
    ['https://github.com/octo/repo.git', 'octo/repo'],
    ['https://github.com/octo/repo', 'octo/repo'],
    ['git@github.com:octo/my.repo.git', 'octo/my.repo'],
  ])('extrai owner/repo de %s', async (url, slug) => {
    await iso.setConfig({ fs: lfs, dir, path: 'remote.origin.url', value: url })
    expect(await git.githubSlug(dir)).toBe(slug)
  })

  it('devolve null sem remoto do GitHub', async () => {
    expect(await git.githubSlug(dir)).toBeNull()
    await iso.setConfig({ fs: lfs, dir, path: 'remote.origin.url', value: 'https://gitlab.com/a/b.git' })
    expect(await git.githubSlug(dir)).toBeNull()
  })
})

describe('operações remotas', () => {
  it('exigem o servidor (Worker) configurado', async () => {
    await expect(git.push(dir, 'main')).rejects.toThrow(/Cloudflare Worker/)
  })

  it('clone que falha não deixa projeto pela metade', async () => {
    useSettings.setState({ proxyUrl: 'http://127.0.0.1:9' })
    await expect(git.clone('https://github.com/octo/repo.git', `falho${n}`)).rejects.toThrow()
    expect(await pfs.stat(`${PROJECTS_DIR}/falho${n}`).then(() => true, () => false)).toBe(false)
  })
})
