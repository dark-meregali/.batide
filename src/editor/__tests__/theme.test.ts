import { describe, expect, it } from 'vitest'
import { batideDark } from '../theme'

const c = batideDark.colors

/** Saturação (HSL) de uma cor #rrggbb, 0–1. */
function saturation(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1))
}

describe('tema batide-dark', () => {
  it('paleta de comandos (F1) e listas usam a seleção da Batide, não o azul padrão do VS Code', () => {
    for (const key of ['quickInputList.focusBackground', 'list.activeSelectionBackground', 'list.focusBackground']) {
      expect(c[key], key).toBeDefined()
      expect(c[key].toLowerCase()).not.toBe('#04395e')
    }
    expect(c['quickInput.background']).toBe(c['editorWidget.background'])
    expect(c['list.highlightForeground']).toBeDefined()
  })

  it('cores de colchetes e guias são discretas (sem o amarelo forte padrão)', () => {
    for (let i = 1; i <= 3; i++) {
      const fg = c[`editorBracketHighlight.foreground${i}`]
      expect(fg, `foreground${i}`).toMatch(/^#[0-9a-f]{6}$/i)
      expect(fg.toLowerCase()).not.toBe('#ffd700')
    }
    const guide = c['editorBracketPairGuide.activeBackground1']
    expect(guide).toBeDefined()
    expect(saturation(guide.slice(0, 7))).toBeLessThan(0.5)
  })
})
