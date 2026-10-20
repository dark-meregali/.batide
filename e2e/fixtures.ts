import { test as base, expect, type Page } from '@playwright/test'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { PROXY } from '../playwright.config'

/**
 * Servidor git falso: um repositório "bare" numa pasta temporária, servido pelo próprio
 * git (upload-pack/receive-pack) por trás de rotas interceptadas no navegador. O app
 * acha que está falando com o Worker → github.com, mas tudo fica local.
 */
export class FakeGithub {
  readonly root = mkdtempSync(join(tmpdir(), 'batide-e2e-'))
  readonly bare = join(this.root, 'demo.git')
  private work = join(this.root, 'work')
  readonly cloneUrl = 'https://github.com/test/demo.git'
  /** Atraso artificial nas respostas do git, para observar estados de carregamento. */
  delayMs = 0

  constructor() {
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', this.bare])
    execFileSync('git', ['-C', this.bare, 'config', 'http.receivepack', 'true'])
    execFileSync('git', ['clone', '-q', this.bare, this.work])
    this.git('config', 'user.email', 'dono@example.com')
    this.git('config', 'user.name', 'Dono')
    this.git('checkout', '-q', '-b', 'main')
  }

  git(...args: string[]) {
    return execFileSync('git', ['-C', this.work, ...args], { encoding: 'utf8' })
  }

  /** Cria um commit no "GitHub" (como se outra pessoa tivesse enviado). */
  commit(files: Record<string, string>, message: string, branch = 'main') {
    this.git('fetch', '-q', 'origin')
    const exists = this.git('ls-remote', '--heads', 'origin', branch).trim() !== ''
    this.git('checkout', '-q', '-B', branch, ...(exists ? [`origin/${branch}`] : []))
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(dirname(join(this.work, file)), { recursive: true })
      writeFileSync(join(this.work, file), content)
    }
    this.git('add', '-A')
    this.git('commit', '-q', '-m', message)
    this.git('push', '-q', 'origin', branch)
  }

  /** Lê um arquivo de uma branch do repositório remoto. */
  show(ref: string) {
    return execFileSync('git', ['-C', this.bare, 'show', ref], { encoding: 'utf8' })
  }

  log(branch = 'main') {
    return execFileSync('git', ['-C', this.bare, 'log', '--format=%s|%an|%ae', branch], { encoding: 'utf8' }).trim().split('\n')
  }

  async install(page: Page) {
    await page.route(`${PROXY}/github.com/test/demo.git/**`, async (route) => {
      const req = route.request()
      if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs))
      const url = new URL(req.url())
      const service = url.pathname.endsWith('/info/refs') ? url.searchParams.get('service')! : url.pathname.split('/').pop()!
      const cmd = service.replace(/^git-/, '')
      if (url.pathname.endsWith('/info/refs')) {
        const refs = spawnSync('git', [cmd, '--stateless-rpc', '--advertise-refs', this.bare])
        const header = `# service=${service}\n`
        const pkt = (header.length + 4).toString(16).padStart(4, '0') + header + '0000'
        return route.fulfill({
          status: 200,
          headers: { 'content-type': `application/x-${service}-advertisement`, 'access-control-allow-origin': '*' },
          body: Buffer.concat([Buffer.from(pkt), refs.stdout]),
        })
      }
      const out = spawnSync('git', [cmd, '--stateless-rpc', this.bare], { input: req.postDataBuffer() ?? Buffer.alloc(0) })
      return route.fulfill({
        status: 200,
        headers: { 'content-type': `application/x-${service}-result`, 'access-control-allow-origin': '*' },
        body: out.stdout,
      })
    })

    await page.route('https://api.github.com/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      const json = (body: unknown) =>
        route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
      if (route.request().headers().authorization !== 'Bearer tok-e2e') {
        return route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Bad credentials"}' })
      }
      if (path === '/user') return json({ login: 'tester', name: 'Tester', id: 42, email: 'tester@example.com', avatar_url: '' })
      if (path === '/user/repos')
        return json([
          { id: 1, full_name: 'test/demo', name: 'demo', private: true, description: 'Repo de teste', clone_url: this.cloneUrl, default_branch: 'main', updated_at: '' },
          { id: 2, full_name: 'test/outro', name: 'outro', private: false, description: null, clone_url: 'https://github.com/test/outro.git', default_branch: 'main', updated_at: '' },
        ])
      return route.fulfill({ status: 404, body: '{}' })
    })
  }

  dispose() {
    rmSync(this.root, { recursive: true, force: true })
  }
}

export const test = base.extend<{ github: FakeGithub }>({
  // A Batide não usa prompt()/confirm() do navegador: qualquer diálogo nativo reprova o teste.
  page: async ({ page }, use) => {
    const native: string[] = []
    page.on('dialog', (d) => {
      native.push(`${d.type()}: ${d.message()}`)
      d.dismiss().catch(() => {})
    })
    await use(page)
    expect(native, 'diálogos nativos do navegador').toEqual([])
  },
  github: async ({ page }, use) => {
    const gh = new FakeGithub()
    await gh.install(page)
    await use(gh)
    gh.dispose()
  },
})

export { expect }

/** Diálogo da Batide aberto no momento. */
export const appDialog = (page: Page) => page.getByRole('dialog')

/** Cria um projeto no navegador pela tela inicial (o nome vai no diálogo da Batide). */
export async function newProject(page: Page, name: string) {
  await page.getByText('Novo projeto no navegador').click()
  await appDialog(page).getByRole('textbox').fill(name)
  await page.keyboard.press('Enter')
  await expect(page.locator('.sidebar-title')).toHaveText(name)
}

/** Cria arquivos na raiz do projeto pela edição inline do explorador. */
export async function createFiles(page: Page, ...paths: string[]) {
  for (const path of paths) {
    await page.locator('.file-tree').click({ position: { x: 3, y: 3 } }) // limpa a seleção: cria na raiz
    await page.getByRole('button', { name: 'Novo arquivo' }).first().click()
    await page.locator('.tree-edit input').fill(path)
    await page.keyboard.press('Enter')
    const name = path.split('/').pop()!
    await expect(page.locator('.tab.active')).toContainText(name)
  }
}

/**
 * Digita linhas no editor usando Shift+Enter (quebra comum). Em PL/SQL o Enter aplica o
 * padrão da equipe (esqueleto de blocos e "--"), o que mudaria o texto digitado.
 */
export async function typeLines(page: Page, text: string) {
  await page.locator('.editor-host:not([hidden]) .monaco-editor .view-lines').click()
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      await closeSuggest(page) // com a lista aberta, Shift+Enter aceitaria a sugestão
      await page.keyboard.press('Shift+Enter')
    }
    await page.keyboard.type(lines[i])
  }
}

/**
 * Digita a linha e aperta Enter no editor (com o Enter do padrão PL/SQL). Antes, fecha a lista
 * de sugestões: espera ela abrir (se for abrir) para o Escape não chegar antes dela.
 */
export async function typeAndEnter(page: Page, text: string) {
  await page.keyboard.type(text)
  await closeSuggest(page)
  await page.keyboard.press('Enter')
}

async function closeSuggest(page: Page) {
  await page.locator('.suggest-widget.visible').waitFor({ timeout: 700 }).catch(() => {})
  await page.keyboard.press('Escape')
  await expect(page.locator('.suggest-widget.visible')).toHaveCount(0)
}

/** Digita no editor Monaco visível. */
export async function typeInEditor(page: Page, text: string) {
  await page.locator('.editor-host:not([hidden]) .monaco-editor .view-lines').click()
  await page.keyboard.type(text)
}

/** Texto do editor visível, linha a linha (o innerText do Monaco perde a última linha vazia). */
export const editorText = (page: Page) =>
  page.locator('.editor-host:not([hidden]) .monaco-editor .view-lines').first().evaluate((el) =>
    [...el.querySelectorAll<HTMLElement>('.view-line')]
      .sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top))
      .map((l) => l.textContent!.replace(/\u00a0/g, ' '))
      .join('\n'),
  )
