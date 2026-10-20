import { test, expect, newProject, createFiles, typeInEditor, typeLines, editorText } from './fixtures'

test.describe('padrão PL/SQL da equipe', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await newProject(page, 'oracle')
    await createFiles(page, 'prc_teste.prc')
  })

  test('Enter abre bloco com "--", fecha com end if e separa comandos', async ({ page }) => {
    await typeInEditor(page, 'begin')
    await page.keyboard.press('Escape') // fecha sugestões, se houver
    await page.keyboard.press('Enter')
    await page.keyboard.type('if (p_id is null) then')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Enter')
    await page.keyboard.type("raise_application_error(-20001, 'Id não informado.');")
    await page.keyboard.press('Enter')
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
    const enter = async (t: string) => {
      await page.keyboard.type(t)
      await page.keyboard.press('Escape')
      await page.keyboard.press('Enter')
    }
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
          'end;',
        ].join('\n'),
      )
  })

  test('exception volta para a coluna do begin e when others then abre o bloco', async ({ page }) => {
    const enter = async (t: string) => {
      await page.keyboard.type(t)
      await page.keyboard.press('Escape')
      await page.keyboard.press('Enter')
    }
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
    await expect.poll(() => editorText(page)).toMatch(/^begin\n\s+null;\n/)
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('selec')
    const suggest = page.locator('.suggest-widget .monaco-list-row').first()
    await expect(suggest).toContainText('select')
    await expect(suggest).not.toContainText('SELECT')
  })
})
