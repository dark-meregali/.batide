import { test, expect, typeInEditor, newProject, createFiles } from './fixtures'
import type { Page } from '@playwright/test'

async function newProjectWith(page: Page, ...entries: string[]) {
  await page.goto('/')
  await newProject(page, 'visual')
  await createFiles(page, ...entries)
}

const row = (page: Page, name: string) => page.locator('.tree-row', { hasText: new RegExp(`^${name}$`) })

/** Espera a imagem do ícone carregar de verdade (não só existir a tag). */
async function expectIcon(locator: ReturnType<Page['locator']>, icon: string) {
  await expect(locator).toHaveAttribute('data-icon', icon)
  await expect.poll(() => locator.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
}

test.describe('ícones', () => {
  test('arquivos e pastas mostram o ícone do tipo, e a pasta abre', async ({ page }) => {
    await newProjectWith(page, 'src/App.tsx', 'banco/pkg_vendas.pkb', 'package.json')

    await expectIcon(row(page, 'package.json').locator('img.file-icon'), 'nodejs')
    await expectIcon(row(page, 'src').locator('img.file-icon'), 'folder-src-open')
    await expectIcon(row(page, 'App.tsx').locator('img.file-icon'), 'react_ts')
    await expectIcon(row(page, 'pkg_vendas.pkb').locator('img.file-icon'), 'database')

    await row(page, 'src').click() // fecha
    await expectIcon(row(page, 'src').locator('img.file-icon'), 'folder-src')
    await expectIcon(row(page, 'banco').locator('img.file-icon'), 'folder-open')
  })

  test('abas mostram o ícone do arquivo', async ({ page }) => {
    await newProjectWith(page, 'App.tsx')
    await expectIcon(page.locator('.tab.active img.file-icon'), 'react_ts')
  })
})

test.describe('fonte do editor', () => {
  /** Spans de token do editor com esse texto (o Monaco junta espaços vizinhos de mesma cor). */
  const tokens = (page: Page, text: string) =>
    page.locator('.editor-host:not([hidden]) .view-lines span span').filter({ hasText: new RegExp(`^\\s*${text}\\s*$`) })

  const style = (loc: ReturnType<Page['locator']>) =>
    loc.evaluate((el) => {
      const s = getComputedStyle(el)
      const chars = el.textContent!.length
      return { family: s.fontFamily, italic: s.fontStyle === 'italic', charWidth: el.getBoundingClientRect().width / chars }
    })

  test('nomes de função em itálico cursivo, alinhados com o resto do código', async ({ page }) => {
    await newProjectWith(page, 'soma.ts')
    await typeInEditor(page, 'function soma(a: number) {\nreturn soma(a) + total\n')

    // O tokenizador de TS carrega sob demanda e a linha é redesenhada: espera estabilizar.
    await expect.poll(async () => (await style(tokens(page, 'soma').first())).family).toMatch(/Victor Mono/)
    const decl = await style(tokens(page, 'soma').first())
    expect(decl.italic).toBe(true)
    expect(await tokens(page, 'soma').count()).toBe(2) // declaração e chamada

    // Variáveis e palavras-chave continuam na fonte normal.
    const plain = await style(tokens(page, 'total'))
    expect(plain.family).toMatch(/JetBrains Mono/)
    expect(plain.italic).toBe(false)
    expect((await style(tokens(page, 'return'))).italic).toBe(false)

    // Mesma largura por caractere: o cursor não fica desalinhado.
    expect(Math.abs(decl.charWidth - plain.charWidth)).toBeLessThan(0.05)
  })

  test('PL/SQL: chamadas de função cursivas, palavras-chave não', async ({ page }) => {
    await newProjectWith(page, 'pkg.sql')
    await typeInEditor(page, 'begin\nv := calcula_total(1);\nif (v > 1) then null; end if;\n')
    await expect.poll(async () => (await style(tokens(page, 'calcula_total'))).italic).toBe(true)
    expect((await style(tokens(page, 'if').first())).italic).toBe(false)
  })

  test('ligaduras ativas: != e => viram símbolos', async ({ page }) => {
    await newProjectWith(page, 'lig.ts')
    await typeInEditor(page, 'a != b => c')
    const lines = page.locator('.editor-host:not([hidden]) .view-lines')
    await expect.poll(() => page.evaluate(() => document.fonts.check('14px "JetBrains Mono Variable"'))).toBe(true)

    const line = page.locator('.editor-host:not([hidden]) .view-line').first()
    const withLigatures = await line.screenshot()
    await lines.evaluate((el) => ((el as HTMLElement).style.fontFeatureSettings = '"liga" 0, "calt" 0'))
    const without = await line.screenshot()
    expect(withLigatures.equals(without)).toBe(false)
  })
})
