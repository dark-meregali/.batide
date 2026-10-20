import { test, expect, typeInEditor, editorText, newProject, createFiles, appDialog } from './fixtures'
import type { Page } from '@playwright/test'

const closeProjectButton = (page: Page) => page.getByRole('button', { name: 'Fechar projeto' })

test('Enter no diálogo confirma uma vez só (não reabre o diálogo pelo botão que recebe o foco)', async ({ page }) => {
  await page.goto('/')
  await page.waitForTimeout(800) // tela inicial já carregada: o botão de origem está pronto para receber o foco
  await page.getByText('Novo projeto no navegador').click()
  await appDialog(page).getByRole('textbox').fill('enter-unico')
  await page.keyboard.press('Enter')
  await expect(page.locator('.sidebar-title')).toHaveText('enter-unico')
  await page.waitForTimeout(300)
  await expect(appDialog(page)).toHaveCount(0)
})

test.describe('fechar projeto com alterações não salvas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await newProject(page, 'seguro')
    await createFiles(page, 'main.sql')
    await typeInEditor(page, 'select 1 from dual;')
    await expect(page.locator('.tab-close.dirty')).toHaveCount(1)
    await closeProjectButton(page).click()
  })

  test('pergunta antes, e cancelar (ou Esc) mantém tudo', async ({ page }) => {
    const dialog = appDialog(page)
    await expect(dialog).toContainText('alterações não salvas')
    await expect(dialog.getByRole('button')).toHaveText(['Cancelar', 'Descartar', 'Salvar tudo'])
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('.tab-close.dirty')).toHaveCount(1)

    await closeProjectButton(page).click()
    await appDialog(page).getByRole('button', { name: 'Cancelar' }).click()
    await expect(page.locator('.sidebar-title')).toHaveText('seguro')
  })

  test('"Salvar tudo" salva antes de fechar', async ({ page }) => {
    await appDialog(page).getByRole('button', { name: 'Salvar tudo' }).click()
    await expect(page.getByText('Novo projeto no navegador')).toBeVisible()
    await page.getByText('seguro').click()
    await page.locator('.tree-row', { hasText: 'main.sql' }).click()
    await expect.poll(() => editorText(page)).toBe('select 1 from dual;')
  })
})

test.describe('atalhos com o editor focado', () => {
  test('Alt+W fecha a aba; com alterações pergunta antes', async ({ page }) => {
    await page.goto('/')
    await newProject(page, 'atalhos')
    await createFiles(page, 'a.ts', 'b.ts')
    await typeInEditor(page, '')
    await page.keyboard.press('Alt+w')
    await expect(page.locator('.tab')).toHaveCount(1)
    await expect(page.locator('.find-widget.visible')).toHaveCount(0)

    await typeInEditor(page, 'x')
    await page.keyboard.press('Alt+w')
    await expect(appDialog(page)).toContainText('Salvar as alterações em "a.ts"?')
    await appDialog(page).getByRole('button', { name: 'Descartar' }).click()
    await expect(page.locator('.tab')).toHaveCount(0)
  })
})

test.describe('criar e renomear na árvore', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await newProject(page, 'arvore')
  })

  test('projeto vazio mostra ações visíveis para criar', async ({ page }) => {
    const empty = page.locator('.tree-empty')
    await expect(empty.getByRole('button', { name: 'Novo arquivo' })).toBeVisible()
    await expect(empty.getByRole('button', { name: 'Nova pasta' })).toBeVisible()
    // Ações do cabeçalho visíveis sem passar o mouse.
    const headerNew = page.locator('.sidebar-header').getByRole('button', { name: 'Novo arquivo' })
    expect(Number(await headerNew.evaluate((el) => getComputedStyle(el.parentElement!).opacity))).toBeGreaterThan(0.4)
  })

  test('editor vazio oferece ações e atalhos em vez de só o logo', async ({ page }) => {
    const empty = page.locator('.empty-editor')
    await empty.getByRole('button', { name: 'Novo arquivo' }).click()
    await expect(page.locator('.tree-edit input')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(empty).toContainText('Ctrl')
  })

  test('o campo inline aparece dentro da pasta de destino; Esc cancela', async ({ page }) => {
    await createFiles(page, 'src/App.tsx')
    // Com src/App.tsx selecionado, o novo arquivo vai para src/.
    await page.locator('.sidebar-header').getByRole('button', { name: 'Novo arquivo' }).click()
    const edit = page.locator('.tree-edit')
    await expect(edit).toBeVisible()
    const srcName = await page.locator('.tree-row', { hasText: /^src$/ }).locator('.tree-name').boundingBox()
    const input = await edit.locator('input').boundingBox()
    expect(input!.x).toBeGreaterThan(srcName!.x) // indentado: dentro de src/
    expect(input!.y).toBeGreaterThan(srcName!.y)

    await page.keyboard.press('Escape')
    await expect(edit).toHaveCount(0)

    await page.locator('.sidebar-header').getByRole('button', { name: 'Novo arquivo' }).click()
    await page.locator('.tree-edit input').fill('util.ts')
    await page.keyboard.press('Enter')
    await expect(page.locator('.tab.active')).toHaveAttribute('title', '/src/util.ts')
  })

  test('F2 renomeia inline', async ({ page }) => {
    await createFiles(page, 'velho.ts')
    const row = page.locator('.tree-row', { hasText: 'velho.ts' })
    await row.click()
    const input = page.locator('.tree-edit input')
    // Abrir o arquivo leva o foco para o editor quando ele termina de carregar; se isso acontecer
    // logo antes do F2, o atalho vai para o editor. Volta o foco para a árvore e tenta de novo.
    await expect(async () => {
      if (!(await input.count())) {
        await row.focus()
        await page.keyboard.press('F2')
      }
      await expect(input).toHaveValue('velho.ts', { timeout: 1000 })
    }).toPass()
    await input.fill('novo.ts')
    await page.keyboard.press('Enter')
    await expect(page.locator('.tree-row', { hasText: 'novo.ts' })).toBeVisible()
    await expect(page.locator('.tab.active')).toContainText('novo.ts')
  })

  test('excluir pede confirmação no diálogo da Batide', async ({ page }) => {
    await createFiles(page, 'apagar.txt')
    await page.locator('.tree-row', { hasText: 'apagar.txt' }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: /Excluir/ }).click()
    const dialog = appDialog(page)
    await expect(dialog).toContainText('Excluir "apagar.txt"?')
    await expect(dialog.getByRole('button', { name: 'Excluir' })).toHaveClass(/danger/)
    await dialog.getByRole('button', { name: 'Excluir' }).click()
    await expect(page.locator('.tree-row', { hasText: 'apagar.txt' })).toHaveCount(0)
  })
})
