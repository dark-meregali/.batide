import { test, expect, newProject, createFiles, appDialog } from './fixtures'
import type { Page } from '@playwright/test'

async function projectWithTree(page: Page) {
  await page.goto('/')
  await newProject(page, 'teclado')
  await createFiles(page, 'src/b.ts', 'src/a.ts', 'README.md')
}

const item = (page: Page, name: string) => page.getByRole('treeitem', { name, exact: true })

test.describe('árvore de arquivos pelo teclado', () => {
  test('setas navegam, abrem/fecham pastas e Enter abre o arquivo', async ({ page }) => {
    await projectWithTree(page)
    await expect(page.getByRole('tree')).toBeVisible()

    await item(page, 'src').focus()
    await expect(item(page, 'src')).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('ArrowLeft') // fecha a pasta
    await expect(item(page, 'src')).toHaveAttribute('aria-expanded', 'false')
    await expect(item(page, 'a.ts')).toHaveCount(0)

    await page.keyboard.press('ArrowRight') // abre
    await expect(item(page, 'a.ts')).toBeVisible()
    await page.keyboard.press('ArrowDown') // primeiro filho
    await expect(item(page, 'a.ts')).toBeFocused()
    await expect(item(page, 'a.ts')).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('ArrowDown')
    await expect(item(page, 'b.ts')).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Enter')
    await expect(page.locator('.tab.active')).toHaveAttribute('title', '/src/a.ts')
  })

  test('só um item da árvore entra na ordem do Tab (roving tabindex)', async ({ page }) => {
    await projectWithTree(page)
    const tabbable = await page.getByRole('treeitem').evaluateAll((els) => els.filter((e) => e.getAttribute('tabindex') === '0').length)
    expect(tabbable).toBe(1)
  })

  test('Shift+F10 abre o menu de contexto, setas navegam, Esc fecha e devolve o foco', async ({ page }) => {
    await projectWithTree(page)
    await item(page, 'README.md').focus()
    await page.keyboard.press('Shift+F10')
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem').first()).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(menu.getByRole('menuitem', { name: /Excluir/ })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(item(page, 'README.md')).toBeFocused()
  })
})

test.describe('abas e controles', () => {
  test('abas são tabs acessíveis, ativáveis pelo teclado, com botão de fechar nomeado', async ({ page }) => {
    await projectWithTree(page)
    const tabs = page.getByRole('tab')
    await expect(page.getByRole('tablist')).toBeVisible()
    await expect(tabs).toHaveCount(3)
    await expect(page.getByRole('tab', { name: 'README.md' })).toHaveAttribute('aria-selected', 'true')

    await page.getByRole('tab', { name: 'a.ts' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('tab', { name: 'a.ts' })).toHaveAttribute('aria-selected', 'true')

    const close = page.getByRole('button', { name: 'Fechar a.ts' })
    await close.focus()
    expect(Number(await close.evaluate((el) => getComputedStyle(el).opacity))).toBe(1)
  })

  test('botões só de ícone têm nome acessível e indicam a vista ativa', async ({ page }) => {
    await projectWithTree(page)
    const explorer = page.getByRole('button', { name: 'Explorador' })
    await expect(explorer).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: /Controle de versão/ })).toHaveAttribute('aria-pressed', 'false')
  })

  test('foco visível com contorno de 2px', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Tab')
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineWidth)
    expect(outline).toBe('2px')
  })
})

test.describe('reduzir movimento', () => {
  test('diálogos e toasts aparecem sem animação', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    await page.getByText('Novo projeto no navegador').click()
    const name = await appDialog(page).evaluate((el) => getComputedStyle(el).animationName)
    expect(name).toBe('none')
  })
})
