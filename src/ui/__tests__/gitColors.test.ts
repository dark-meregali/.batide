import { describe, expect, it } from 'vitest'
import { GIT_STATUS_COLORS } from '../gitColors'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8')

describe('cores de status do git', () => {
  it('vêm dos tokens de cor do tema (variáveis CSS definidas em styles.css)', () => {
    for (const [status, value] of Object.entries(GIT_STATUS_COLORS)) {
      const name = /^var\((--git-[a-z]+)\)$/.exec(value)?.[1]
      expect(name, status).toBeTruthy()
      expect(css, name!).toContain(`${name}:`)
    }
  })
})
