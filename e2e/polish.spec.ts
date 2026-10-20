import { test, expect, newProject, createFiles, typeInEditor, appDialog } from './fixtures'

test('configurações: o seletor de idioma mostra "Português" inteiro e o rótulo da tabulação é claro', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Configurações' }).click()
  const select = page.locator('.setting-row select').first()
  const fits = await select.evaluate((el: HTMLSelectElement) => {
    const ctx = document.createElement('canvas').getContext('2d')!
    ctx.font = getComputedStyle(el).font
    const text = ctx.measureText(el.options[el.selectedIndex].text).width
    return el.clientWidth >= text + 28 // texto + padding + seta
  })
  expect(fits).toBe(true)
  await expect(page.getByText('Tamanho da tabulação')).toBeVisible()
})

test('botão de idioma da barra de status tem nome acessível', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /Idioma da interface/ })).toBeVisible()
})

test('fechar projeto com alterações pergunta em forma de pergunta', async ({ page }) => {
  await page.goto('/')
  await newProject(page, 'pergunta')
  await createFiles(page, 'a.sql')
  await typeInEditor(page, 'x')
  await page.getByRole('button', { name: 'Fechar projeto' }).click()
  await expect(appDialog(page).getByRole('heading')).toHaveText('Fechar o projeto com alterações não salvas?')
  await expect(appDialog(page)).toContainText('a.sql')
  await page.keyboard.press('Escape')
})

test.describe('tela estreita (celular)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('barra lateral tem fundo escurecido, fecha ao tocar fora e ao abrir um arquivo', async ({ page }) => {
    await page.goto('/')
    await newProject(page, 'celular')
    await createFiles(page, 'a.ts')
    // Criar o arquivo abre no editor: no celular a barra lateral sai da frente.
    await expect(page.locator('.sidebar')).toHaveCount(0)

    await page.getByRole('button', { name: 'Explorador' }).click()
    const scrim = page.locator('.sidebar-scrim')
    await expect(scrim).toBeVisible()
    await scrim.click({ position: { x: 320, y: 400 } }) // à direita da barra lateral
    await expect(page.locator('.sidebar')).toHaveCount(0)

    await page.getByRole('button', { name: 'Explorador' }).click()
    await page.getByRole('treeitem', { name: 'a.ts' }).click()
    await expect(page.locator('.sidebar')).toHaveCount(0)
  })

  test('botão de idioma cabe na barra de status', async ({ page }) => {
    await page.goto('/')
    await newProject(page, 'status')
    await createFiles(page, 'um-nome-de-arquivo-bem-comprido.ts')
    const box = await page.getByRole('button', { name: /Idioma da interface/ }).boundingBox()
    expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  })
})

test('operação do git em andamento mostra indicador animado e anunciado', async ({ page, github }) => {
  github.commit({ 'README.md': '# Demo\n' }, 'inicial')
  await page.goto('/')
  await page.getByText('Clonar repositório do GitHub').click()
  await page.keyboard.type('test/demo')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('treeitem', { name: 'README.md' })).toBeVisible()

  github.delayMs = 1500
  await page.keyboard.press('Control+Shift+G')
  await page.getByTitle('Baixar alterações (pull)').click()
  const status = page.locator('.status-bar [role="status"]')
  await expect(status).toContainText('Baixando')
  await expect(status.locator('.spinner')).toBeVisible()
  await expect(page.locator('.status-bar')).not.toContainText('⟳')
  await expect(status).toHaveCount(0, { timeout: 10_000 })
})
