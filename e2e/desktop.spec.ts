import { test, expect, typeInEditor, editorText } from './fixtures'
import { installFakeTauri, fakeState } from './fakeTauri'

const FOLDER = '/home/eu/meu-projeto'

test.describe('app desktop (Tauri)', () => {
  test.beforeEach(async ({ page }) => {
    await installFakeTauri(page, { folder: FOLDER, files: { '/src/pkg.sql': 'begin null; end;', '/README.md': '# Projeto' } })
    await page.goto('/')
  })

  test('abre pasta do computador pelo seletor nativo e edita direto no disco', async ({ page }) => {
    await page.getByText('Abrir pasta do computador').click()
    await expect(page.locator('.sidebar-title')).toHaveText('meu-projeto')
    await expect(page.getByRole('treeitem', { name: 'src' })).toBeVisible()
    await expect(page.locator('.status-bar')).toContainText('Local')
    expect((await fakeState(page)).calls).toContain('plugin:dialog|open')

    await page.getByRole('treeitem', { name: 'README.md' }).click()
    await expect.poll(() => editorText(page)).toBe('# Projeto')
    await typeInEditor(page, '')
    await page.keyboard.press('Control+End')
    await page.keyboard.type(' editado')
    await page.keyboard.press('Control+s')
    await expect.poll(async () => (await fakeState(page)).files['/README.md']).toBe('# Projeto editado')

    // Criar arquivo inline grava no disco.
    await page.locator('.tree').click({ position: { x: 3, y: 3 } })
    await page.locator('.sidebar-header').getByRole('button', { name: 'Novo arquivo' }).click()
    await page.locator('.tree-edit input').fill('db/novo.pks')
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await fakeState(page)).files['/db/novo.pks']).toBe('')
  })

  test('lembra pastas recentes e reabre sem perguntar', async ({ page }) => {
    await page.getByText('Abrir pasta do computador').click()
    await expect(page.locator('.sidebar-title')).toHaveText('meu-projeto')
    await page.reload()
    const recent = page.locator('.project-list .project-link', { hasText: 'meu-projeto' })
    await expect(recent).toBeVisible()
    await expect(recent).toHaveAttribute('title', FOLDER)
    await recent.click()
    await expect(page.locator('.sidebar-title')).toHaveText('meu-projeto')
    expect((await fakeState(page)).calls.filter((c) => c === 'plugin:dialog|open')).toHaveLength(0)
  })

  test('terminal integrado: abre na pasta do projeto, recebe o prompt e executa comandos', async ({ page }) => {
    await page.getByText('Abrir pasta do computador').click()
    await expect(page.locator('.sidebar-title')).toHaveText('meu-projeto')

    await page.keyboard.press('Control+`')
    const panel = page.locator('.terminal-panel')
    await expect(panel).toBeVisible()
    await expect(panel.locator('.xterm-rows')).toContainText('$')
    expect((await fakeState(page)).terminal.cwd).toBe(FOLDER)

    await panel.locator('.xterm').click()
    await page.keyboard.type('ls')
    await page.keyboard.press('Enter')
    await expect(panel.locator('.xterm-rows')).toContainText('você digitou: ls')

    // Botão na barra de status alterna o painel; fechar o painel mantém a sessão.
    await page.getByRole('button', { name: /Terminal/ }).click()
    await expect(panel).toBeHidden()
    await page.getByRole('button', { name: /Terminal/ }).click()
    await expect(panel.locator('.xterm-rows')).toContainText('você digitou: ls')
    expect((await fakeState(page)).terminal.killed).toBe(false)
  })

  test('controle de versão em pasta do computador aponta para o terminal', async ({ page }) => {
    await page.getByText('Abrir pasta do computador').click()
    await page.keyboard.press('Control+Shift+G')
    await page.getByRole('button', { name: 'Abrir terminal' }).click()
    await expect(page.locator('.terminal-panel')).toBeVisible()
  })

  test('não registra service worker dentro do app', async ({ page }) => {
    await page.waitForTimeout(1500)
    const regs = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)
    expect(regs).toBe(0)
  })
})

test('no navegador não há terminal', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /Terminal/ })).toHaveCount(0)
  await page.keyboard.press('Control+`')
  await expect(page.locator('.terminal-panel')).toHaveCount(0)
})
