import { test, expect, newProject, createFiles, typeInEditor, appDialog } from './fixtures'

test.describe('foco pelo teclado', () => {
  test('contorno de foco do botão principal fica visível (fora do botão, com contraste)', async ({ page }) => {
    await page.goto('/')
    await page.getByText('Novo projeto no navegador').click()
    await appDialog(page).getByRole('textbox').fill('x')
    await page.keyboard.press('Tab') // Cancelar
    await page.keyboard.press('Tab') // Criar
    const create = appDialog(page).getByRole('button', { name: 'Criar' })
    await expect(create).toBeFocused()
    const ring = await create.evaluate((el) => {
      const s = getComputedStyle(el)
      const bg = getComputedStyle(el.closest('.dialog')!).backgroundColor
      const lum = (c: string) => {
        const [r, g, b] = c.match(/[\d.]+/g)!.map(Number).map((x) => ((x /= 255) <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
      }
      const [a, b] = [lum(s.outlineColor), lum(bg)].sort((x, y) => y - x)
      return { offset: parseFloat(s.outlineOffset), width: parseFloat(s.outlineWidth), contrast: (a + 0.05) / (b + 0.05) }
    })
    expect(ring.width).toBeGreaterThanOrEqual(2)
    expect(ring.offset).toBeGreaterThanOrEqual(1) // desenhado fora do botão
    expect(ring.contrast).toBeGreaterThanOrEqual(3)
  })

  test('Ctrl+M liga "Tab move o foco" no editor, com aviso na barra de status', async ({ page }) => {
    await page.goto('/')
    await newProject(page, 'tabfoco')
    await createFiles(page, 'a.ts')
    await typeInEditor(page, '')
    await page.keyboard.press('Control+m')
    const status = page.locator('.status-bar').getByRole('button', { name: /Tab move o foco/ })
    await expect(status).toBeVisible()
    await page.keyboard.press('Tab')
    const inEditor = await page.evaluate(() => !!document.activeElement?.closest('.monaco-editor'))
    expect(inEditor).toBe(false)
    // Clicar no aviso desliga o modo.
    await status.click()
    await expect(status).toHaveCount(0)
  })

  test('a lista de atalhos ensina o Ctrl+M', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.shortcuts')).toContainText('Tab move o foco')
  })

  test('avisos (toasts) são anunciados a leitores de tela', async ({ page }) => {
    await page.goto('/')
    await newProject(page, 'aviso')
    await createFiles(page, 'a.ts')
    await page.locator('.tree').click({ position: { x: 3, y: 3 } })
    await page.locator('.sidebar-header').getByRole('button', { name: 'Novo arquivo' }).click()
    await page.locator('.tree-edit input').fill('a.ts')
    await page.keyboard.press('Enter')
    const toast = page.locator('.toast')
    await expect(toast).toHaveAttribute('role', 'status')
    await expect(toast).toHaveAttribute('aria-live', 'polite')
  })
})

test.describe('muitas abas', () => {
  test('a aba ativa sempre fica visível e nomes longos usam reticências', async ({ page }) => {
    await page.goto('/')
    await newProject(page, 'abas')
    const names = Array.from({ length: 12 }, (_, i) => `pkg_relatorio_mensal_consolidado_${i}.sql`)
    await createFiles(page, ...names)

    const bar = page.locator('.tab-bar')
    const visible = async (name: string) => {
      const [b, t] = await Promise.all([bar.boundingBox(), page.getByRole('tab', { name }).boundingBox()])
      return t!.x >= b!.x - 1 && t!.x + t!.width <= b!.x + b!.width + 1
    }
    await expect.poll(() => visible(names[11])).toBe(true)

    await page.getByRole('treeitem', { name: names[0] }).click()
    await expect.poll(() => visible(names[0])).toBe(true)

    const tabName = page.getByRole('tab', { name: names[0] }).locator('.tab-name')
    const style = await tabName.evaluate((el) => ({ overflow: getComputedStyle(el).textOverflow, width: el.getBoundingClientRect().width }))
    expect(style.overflow).toBe('ellipsis')
    expect(style.width).toBeLessThanOrEqual(180)
    await expect(page.getByRole('tab', { name: names[0] })).toHaveAttribute('title', `/${names[0]}`)
  })
})

test.describe('controle de versão em projeto sem git', () => {
  test('oferece inicializar o repositório ali mesmo', async ({ page }) => {
    await page.goto('/')
    await newProject(page, 'semgit')
    await createFiles(page, 'main.sql')
    await page.keyboard.press('Control+Shift+G')
    await page.getByRole('button', { name: 'Inicializar repositório' }).click()
    await expect(page.locator('.scm-branch')).toContainText('main')
    await expect(page.locator('.scm-row')).toHaveCount(1)
    await expect(page.locator('.status-bar')).toContainText('main')
  })

  test('ou clonar do GitHub sem voltar à tela inicial', async ({ page }) => {
    await page.goto('/')
    await newProject(page, 'semgit2')
    await page.keyboard.press('Control+Shift+G')
    await page.getByRole('button', { name: 'Clonar do GitHub…' }).click()
    await expect(page.locator('.quick-pick input')).toBeFocused()
  })
})
