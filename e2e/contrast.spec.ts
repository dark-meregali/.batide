import { test, expect, newProject, createFiles, typeInEditor } from './fixtures'
import type { Locator, Page } from '@playwright/test'

/** Contraste WCAG entre a cor do texto (ou placeholder) e o primeiro fundo opaco atrás dele. */
async function contrast(loc: Locator, pseudo?: '::placeholder') {
  return loc.first().evaluate((el, pseudo) => {
    const parse = (c: string) => {
      const m = c.match(/[\d.]+/g)!.map(Number)
      return { rgb: m.slice(0, 3), a: m[3] ?? 1 }
    }
    const lum = ([r, g, b]: number[]) => {
      const f = (x: number) => ((x /= 255) <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const fg = parse(getComputedStyle(el, pseudo ?? null).color).rgb
    let node: Element | null = el
    let bg = [14, 15, 19]
    while (node) {
      const c = parse(getComputedStyle(node).backgroundColor)
      if (c.a >= 0.99) {
        bg = c.rgb
        break
      }
      node = node.parentElement
    }
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x)
    return (a + 0.05) / (b + 0.05)
  }, pseudo)
}

const AA = 4.5

test('tela inicial: títulos de seção, textos de apoio e barra de status com contraste AA', async ({ page }) => {
  await page.goto('/')
  expect(await contrast(page.locator('.welcome h2'))).toBeGreaterThanOrEqual(AA)
  expect(await contrast(page.locator('.welcome .muted'))).toBeGreaterThanOrEqual(AA)
  expect(await contrast(page.locator('.status-bar .status-btn'))).toBeGreaterThanOrEqual(AA)
})

test('rótulo de offline é inequívoco', async ({ page }) => {
  await page.goto('/')
  const offline = page.locator('.status-bar').getByText(/offline/i)
  await expect(offline).toHaveText('Pronta offline')
})

test('botão principal, placeholders e textos de ajuda das configurações', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Configurações' }).click()
  expect(await contrast(page.getByRole('button', { name: 'Entrar com GitHub' }))).toBeGreaterThanOrEqual(AA)
  expect(await contrast(page.getByPlaceholder(/ghp_/), '::placeholder')).toBeGreaterThanOrEqual(AA)
  expect(await contrast(page.locator('.setting-col small'))).toBeGreaterThanOrEqual(AA)
})

test('editor: abas inativas legíveis e números de linha com pelo menos 3:1', async ({ page }) => {
  await page.goto('/')
  await newProject(page, 'contraste')
  await createFiles(page, 'a.ts', 'b.ts')
  await typeInEditor(page, '// comentário\nconst x = 1\n\n')
  expect(await contrast(page.locator('.tab:not(.active) .tab-name'))).toBeGreaterThanOrEqual(AA)
  const inactiveLine = page.locator('.editor-host:not([hidden]) .line-numbers:not(.active-line-number)')
  expect(await contrast(inactiveLine)).toBeGreaterThanOrEqual(3)
  const comment = page.locator('.editor-host:not([hidden]) .view-line span.mtki').first()
  expect(await contrast(comment)).toBeGreaterThanOrEqual(AA)
})

test.describe('clone', () => {
  test('dica do seletor rápido legível', async ({ page }: { page: Page }) => {
    await page.goto('/')
    await page.getByText('Clonar repositório do GitHub').click()
    expect(await contrast(page.locator('.quick-empty'))).toBeGreaterThanOrEqual(AA)
    expect(await contrast(page.locator('.quick-pick input'), '::placeholder')).toBeGreaterThanOrEqual(AA)
  })
})
