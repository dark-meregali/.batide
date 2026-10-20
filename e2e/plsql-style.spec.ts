import { test, expect, newProject, createFiles, typeInEditor, typeLines, typeAndEnter, editorText } from './fixtures'

test.describe('padrão PL/SQL da equipe', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await newProject(page, 'oracle')
    await createFiles(page, 'prc_teste.prc')
  })

  test('Enter abre bloco com "--", fecha com end if e separa comandos', async ({ page }) => {
    await typeInEditor(page, '')
    await typeAndEnter(page, 'begin')
    await typeAndEnter(page, 'if (p_id is null) then')
    await typeAndEnter(page, "raise_application_error(-20001, 'Id não informado.');")
    await page.keyboard.type('p_status := 1;')
    await expect
      .poll(() => editorText(page))
      .toBe(
        [
          'begin',
          '  --',
          '  if (p_id is null) then',
          '    --',
          "    raise_application_error(-20001, 'Id não informado.');",
          '    --',
          '    p_status := 1;',
          '    --',
          '  end if;',
          '  --',
          'end;',
        ].join('\n'),
      )
  })

  test('fluxo completo: declarações, begin, if e exception no padrão da equipe', async ({ page }) => {
    const enter = (t: string) => typeAndEnter(page, t)
    await typeInEditor(page, '')
    await enter('procedure prc_teste(p_id in number) is')
    await enter('v_total number;')
    await enter('begin')
    await enter('if (p_id is null) then')
    await page.keyboard.type("raise_application_error(-20001, 'x');")
    await expect
      .poll(() => editorText(page))
      .toBe(
        [
          'procedure prc_teste(p_id in number) is',
          '  --',
          '  v_total number;',
          '  --',
          'begin',
          '  --',
          '  if (p_id is null) then',
          '    --',
          "    raise_application_error(-20001, 'x');",
          '    --',
          '  end if;',
          '  --',
          'end prc_teste;',
        ].join('\n'),
      )
  })

  test('exception volta para a coluna do begin e when others then abre o bloco', async ({ page }) => {
    const enter = (t: string) => typeAndEnter(page, t)
    await typeInEditor(page, '')
    await enter('begin')
    await enter('p_status := 1;')
    await enter('exception')
    await enter('when others then')
    await page.keyboard.type("p_status := 'E';")
    await expect
      .poll(() => editorText(page))
      .toBe(
        ['begin', '  --', '  p_status := 1;', '  --', 'exception', '  when others then', '    --', "    p_status := 'E';", '    --', 'end;'].join('\n'),
      )
  })

  test('Shift+Enter quebra a linha sem separador (para agrupar open/fetch/close)', async ({ page }) => {
    await typeInEditor(page, 'open  c_itens;')
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('fetch c_itens into r_itens;')
    await expect.poll(() => editorText(page)).toBe('open  c_itens;\nfetch c_itens into r_itens;')
  })

  test('formatador e sugestões usam minúsculas', async ({ page }) => {
    await typeLines(page, 'BEGIN\nNULL;\nEND;')
    await page.keyboard.press('Shift+Alt+F')
    await expect.poll(() => editorText(page)).toMatch(/^begin\n  --\n  null;\n  --\nend;/)
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('selec')
    const suggest = page.locator('.suggest-widget .monaco-list-row').first()
    await expect(suggest).toContainText('select')
    await expect(suggest).not.toContainText('SELECT')
  })
})

test.describe('caixa das palavras-chave PL/SQL (configurável)', () => {
  test('lista de sugestões mostra a linha inteira (não fica cortada)', async ({ page }) => {
    await page.goto('/')
    await newProject(page, 'oracle')
    await createFiles(page, 'a.sql')
    await typeInEditor(page, 'proce')
    const row = page.locator('.suggest-widget .monaco-list-row').first()
    await expect(row).toBeVisible()
    const list = await page.locator('.suggest-widget .monaco-list').boundingBox()
    const rowBox = await row.boundingBox()
    expect(list!.height).toBeGreaterThanOrEqual(rowBox!.height)
  })

  test('com "Maiúsculas" nas configurações, sugestões, snippets e formatador usam MAIÚSCULAS', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Configurações' }).click()
    await page.getByLabel('Palavras-chave PL/SQL').selectOption('upper')
    await page.getByRole('button', { name: 'Configurações' }).click()
    await newProject(page, 'oracle')
    await createFiles(page, 'a.sql')

    await typeInEditor(page, 'selec')
    const suggest = page.locator('.suggest-widget .monaco-list-row').first()
    await expect(suggest).toContainText('SELECT')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Delete')

    await page.keyboard.type('if')
    await expect(page.locator('.suggest-widget .monaco-list-row.focused')).toContainText('if')
    await page.keyboard.press('Tab')
    await expect.poll(() => editorText(page)).toBe('IF (condicao) THEN\n  --\n  \n  --\nEND IF;')

    await page.keyboard.press('Control+A')
    await page.keyboard.press('Delete')
    await typeLines(page, 'begin\nnull;\nend;')
    await page.keyboard.press('Shift+Alt+F')
    await expect.poll(() => editorText(page)).toMatch(/^BEGIN\n  --\n  NULL;\n  --\nEND;/)
  })
})

test('depois de "registro." o autocomplete mostra as colunas do cursor', async ({ page }) => {
  await page.goto('/')
  await newProject(page, 'oracle')
  await createFiles(page, 'a.sql')
  await typeLines(
    page,
    ['procedure p is', 'cursor c_teste is', 'select t.id_teste, t.nome nome_teste', 'from teste t;', 'r_teste c_teste;', 'begin', 'r_teste.'].join('\n'),
  )
  const rows = page.locator('.suggest-widget .monaco-list-row')
  await expect(rows.first()).toBeVisible()
  await expect(page.locator('.suggest-widget')).toContainText('id_teste')
  await expect(page.locator('.suggest-widget')).toContainText('nome_teste')
  await expect(page.locator('.suggest-widget')).not.toContainText('abs')
  await expect(rows).toHaveCount(2)
  // A lista mostra as duas linhas inteiras.
  const list = await page.locator('.suggest-widget .monaco-list').boundingBox()
  const row = await rows.first().boundingBox()
  expect(list!.height).toBeGreaterThanOrEqual(row!.height * 2)
})
