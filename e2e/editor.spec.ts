import { test, expect, answerDialogs, typeInEditor, editorText } from './fixtures'

test('cria projeto no navegador, edita PL/SQL, formata e salva', async ({ page }) => {
  answerDialogs(page, 'meu-projeto', 'pkg_vendas.pkb')
  await page.goto('/')
  await page.getByText('Novo projeto no navegador').click()
  await page.getByTitle('Novo arquivo').click()
  await expect(page.locator('.tab.active')).toHaveText(/pkg_vendas\.pkb/)

  await typeInEditor(page, 'begin\nnull;\nend;')
  await expect(page.locator('.tab-close.dirty')).toHaveCount(1)
  await page.keyboard.press('Shift+Alt+F')
  await expect.poll(() => editorText(page)).toBe('BEGIN\n  NULL;\nEND;\n')
  await page.keyboard.press('Control+s')
  await expect(page.locator('.tab-close.dirty')).toHaveCount(0)
  await expect(page.locator('.status-bar')).toContainText('PL/SQL')

  // Persistência: recarrega a página e reabre o projeto.
  await page.reload()
  await page.getByText('meu-projeto').click()
  await page.getByText('pkg_vendas.pkb').click()
  await expect.poll(() => editorText(page)).toBe('BEGIN\n  NULL;\nEND;\n')
})

test('troca o idioma da interface', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Começar')).toBeVisible()
  await page.locator('.status-btn', { hasText: 'PT' }).click()
  await expect(page.getByText('Start', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Start', { exact: true })).toBeVisible()
})
