import { test, expect, typeLines, editorText, newProject, createFiles } from './fixtures'

test('cria projeto no navegador, edita PL/SQL, formata e salva', async ({ page }) => {
  await page.goto('/')
  await newProject(page, 'meu-projeto')
  await createFiles(page, 'pkg_vendas.pkb')

  await typeLines(page, 'begin\nnull;\nend;')
  await expect(page.locator('.tab-close.dirty')).toHaveCount(1)
  await page.keyboard.press('Shift+Alt+F')
  await expect.poll(() => editorText(page)).toBe('begin\n  null;\nend;\n')
  await page.keyboard.press('Control+s')
  await expect(page.locator('.tab-close.dirty')).toHaveCount(0)
  await expect(page.locator('.status-bar')).toContainText('PL/SQL')

  // Persistência: recarrega a página e reabre o projeto.
  await page.reload()
  await page.getByText('meu-projeto').click()
  await page.getByText('pkg_vendas.pkb').click()
  await expect.poll(() => editorText(page)).toBe('begin\n  null;\nend;\n')
})

test('troca o idioma da interface', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Começar')).toBeVisible()
  await page.locator('.status-btn', { hasText: 'PT' }).click()
  await expect(page.getByText('Start', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Start', { exact: true })).toBeVisible()
})
