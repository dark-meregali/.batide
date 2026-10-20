import { readFileSync, writeFileSync } from 'node:fs'
import { test, expect, newProject, createFiles, typeInEditor, appDialog } from './fixtures'

/**
 * Versão nova publicada com a IDE aberta: aparece o aviso na barra de status (sem recarregar
 * sozinho) e, ao clicar, pergunta pelas alterações não salvas antes de recarregar.
 */
for (const firstVisit of [false, true]) {
  test(`versão nova: aviso na barra de status, pergunta pelo que não foi salvo e recarrega${firstVisit ? ' (primeira visita)' : ''}`, async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Pronta offline')).toBeVisible({ timeout: 30000 })
    if (!firstVisit) {
      // Quem volta à IDE já abre a página controlada pelo service worker.
      await page.reload()
      await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
    }
    await newProject(page, 'atualiza')
    await createFiles(page, 'a.sql')
    await typeInEditor(page, 'null;')

    // "Publica" uma versão nova: muda um caractere do sw.js (mesmo tamanho, para o servidor estático).
    const swPath = 'dist/sw.js'
    const original = readFileSync(swPath, 'utf8')
    const m = /revision:"([0-9a-f])/.exec(original)!
    const changed = original.slice(0, m.index + 10) + (m[1] === '0' ? '1' : '0') + original.slice(m.index + 11)
    writeFileSync(swPath, changed)
    try {
      let reloaded = false
      page.on('framenavigated', (f) => f === page.mainFrame() && (reloaded = true))
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
      const button = page.getByRole('button', { name: 'Nova versão · atualizar' })
      await expect(button).toBeVisible({ timeout: 30000 })
      expect(reloaded).toBe(false) // não recarrega sozinho

      await button.click()
      const dialog = appDialog(page)
      await expect(dialog).toContainText('Salvar as alterações antes de atualizar?')
      await dialog.getByRole('button', { name: 'Cancelar' }).click()
      await expect(button).toBeVisible()
      expect(reloaded).toBe(false)

      await button.click()
      await appDialog(page).getByRole('button', { name: 'Salvar tudo' }).click()
      await expect.poll(() => reloaded, { timeout: 30000 }).toBe(true)
      await expect(page.getByRole('button', { name: 'Nova versão · atualizar' })).toHaveCount(0)
    } finally {
      writeFileSync(swPath, original)
    }
  })
}
