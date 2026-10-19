import { test, expect, typeInEditor, editorText, type FakeGithub } from './fixtures'
import type { Page } from '@playwright/test'

async function loginWithToken(page: Page) {
  await page.goto('/')
  await page.getByTitle('Configurações').click()
  await page.getByPlaceholder(/ghp_/).fill('tok-e2e')
  await page.getByRole('button', { name: 'Usar token' }).click()
  await expect(page.getByText('tester')).toBeVisible()
  await page.getByTitle('Configurações').click() // fecha a barra lateral
}

async function cloneDemo(page: Page) {
  await page.getByText('Clonar repositório do GitHub').click()
  await page.keyboard.type('test/demo')
  await page.keyboard.press('Enter')
  await expect(page.locator('.tree-row', { hasText: 'README.md' })).toBeVisible()
}

function seed(github: FakeGithub) {
  github.commit({ 'README.md': '# Demo\n', 'db/pkg.sql': 'begin null; end;\n' }, 'inicial')
  github.commit({ 'dev.txt': 'só na dev\n' }, 'commit na dev', 'dev')
}

test('lista os repositórios do usuário e clona', async ({ page, github }) => {
  seed(github)
  await loginWithToken(page)
  await page.getByText('Clonar repositório do GitHub').click()
  await expect(page.locator('.quick-item')).toHaveCount(2)
  await page.keyboard.type('demo')
  await expect(page.locator('.quick-item')).toHaveCount(1)
  await page.keyboard.press('Enter')

  await expect(page.locator('.tree-row', { hasText: 'README.md' })).toBeVisible()
  await expect(page.locator('.tree-row', { hasText: 'db' })).toBeVisible()
  await expect(page.locator('.tree-row', { hasText: '.git' })).toHaveCount(0)
  await expect(page.locator('.status-bar')).toContainText('main')
})

test('clona por URL sem estar logado', async ({ page, github }) => {
  seed(github)
  await page.goto('/')
  await page.getByText('Clonar repositório do GitHub').click()
  await page.keyboard.type('https://github.com/test/demo')
  await expect(page.locator('.quick-item')).toHaveText(/Clonar https:\/\/github\.com\/test\/demo\.git/)
  await page.keyboard.press('Enter')
  await expect(page.locator('.tree-row', { hasText: 'README.md' })).toBeVisible()
})

test('edita, vê o diff, faz commit e push', async ({ page, github }) => {
  seed(github)
  await loginWithToken(page)
  await cloneDemo(page)

  await page.locator('.tree-row', { hasText: 'README.md' }).click()
  await page.keyboard.press('Control+End')
  await typeInEditor(page, '')
  await page.keyboard.press('Control+End')
  await page.keyboard.type('Linha nova')
  await page.keyboard.press('Control+s')

  // Explorador e controle de versão mostram o arquivo modificado.
  await expect(page.locator('.tree-row', { hasText: 'README.md' }).locator('.tree-status')).toHaveText('M')
  await page.keyboard.press('Control+Shift+G')
  await expect(page.locator('.scm-row')).toHaveCount(1)
  await expect(page.locator('.activity-badge')).toHaveText('1')

  // Diff lado a lado.
  await page.locator('.scm-row').click()
  await expect(page.locator('.monaco-diff-editor')).toBeVisible()
  await expect(page.locator('.monaco-diff-editor .modified .view-lines')).toContainText('Linha nova')

  // Commit + push.
  await page.locator('.scm-message').fill('Atualiza README')
  await page.keyboard.press('Control+Enter')
  await expect(page.locator('.scm-row')).toHaveCount(0)
  await expect(page.locator('.monaco-diff-editor')).toHaveCount(0)
  await expect(page.locator('.scm-branch')).toContainText('↑1')

  await page.getByTitle('Enviar commits (push)').click()
  await expect(page.locator('.toast')).toContainText('enviados')
  await expect(page.locator('.scm-branch')).not.toContainText('↑')
  expect(github.log()[0]).toBe('Atualiza README|Tester|tester@example.com')
  expect(github.show('main:README.md')).toBe('# Demo\nLinha nova')
})

test('descarta alterações de um arquivo', async ({ page, github }) => {
  seed(github)
  page.on('dialog', (d) => d.accept())
  await page.goto('/')
  await cloneDemo(page)
  await page.locator('.tree-row', { hasText: 'README.md' }).click()
  await typeInEditor(page, 'lixo ')
  await page.keyboard.press('Control+s')
  await page.keyboard.press('Control+Shift+G')
  await page.locator('.scm-row').hover()
  await page.getByTitle('Descartar alterações').click()
  await expect(page.locator('.scm-row')).toHaveCount(0)
  await expect.poll(() => editorText(page)).toBe('# Demo\n')
})

test('troca para branch remota e cria branch nova', async ({ page, github }) => {
  seed(github)
  await page.goto('/')
  await cloneDemo(page)

  await page.locator('.status-bar').getByText('main').click()
  await expect(page.locator('.quick-item', { hasText: 'dev' })).toContainText('origin')
  await page.keyboard.type('dev')
  await page.locator('.quick-item', { hasText: /^dev/ }).click()
  await expect(page.locator('.status-bar')).toContainText('dev')
  await expect(page.locator('.tree-row', { hasText: 'dev.txt' })).toBeVisible()

  await page.locator('.status-bar').getByText('dev').click()
  await page.keyboard.type('minha feature')
  await expect(page.locator('.quick-item').first()).toHaveText(/Criar branch "minha-feature"/)
  await page.keyboard.press('Enter')
  await expect(page.locator('.status-bar')).toContainText('minha-feature')
})

test('pull traz commits novos e atualiza o arquivo aberto', async ({ page, github }) => {
  seed(github)
  await page.goto('/')
  await cloneDemo(page)
  await page.locator('.tree-row', { hasText: 'README.md' }).click()
  await expect.poll(() => editorText(page)).toBe('# Demo\n')

  github.commit({ 'README.md': '# Demo\nDo remoto\n' }, 'remoto')
  await page.keyboard.press('Control+Shift+G')
  await page.getByTitle('Baixar alterações (pull)').click()
  await expect.poll(() => editorText(page)).toBe('# Demo\nDo remoto\n')
})
