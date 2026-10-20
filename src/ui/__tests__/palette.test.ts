import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { batideDark, batideModern } from '../../editor/theme'

const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8')
const icon = readFileSync(new URL('../../../public/icon.svg', import.meta.url), 'utf8')
const token = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(css)?.[1]

function hsl(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: (h * 60 + 360) % 360, s, l }
}
const isRed = (hex: string) => {
  const { h, s } = hsl(hex)
  return (h >= 345 || h <= 15) && s > 0.55
}

describe('paleta da Batide', () => {
  it('fundo quase preto (escolha do usuário)', () => {
    const bg = token('bg')!
    expect(bg).toBeDefined()
    expect(hsl(bg).l).toBeLessThan(0.03)
  })

  it('cor de destaque é vermelha (carmesim), e o botão principal também', () => {
    expect(isRed(token('accent')!)).toBe(true)
    expect(isRed(token('accent-strong')!)).toBe(true)
  })

  it('o editor usa o mesmo fundo da interface e palavras-chave vermelhas', () => {
    expect(batideDark.colors['editor.background']).toBe(token('bg'))
    const keyword = batideDark.rules.find((r) => r.token === 'keyword')!.foreground!
    expect(isRed('#' + keyword)).toBe(true)
  })

  it('o logo acompanha a paleta (gradiente vermelho → âmbar)', () => {
    const stops = [...icon.matchAll(/stop-color="(#[0-9a-f]{6})"/gi)].map((m) => m[1])
    expect(stops.length).toBeGreaterThanOrEqual(2)
    expect(isRed(stops[0])).toBe(true)
    const last = hsl(stops[stops.length - 1])
    expect(last.h).toBeGreaterThan(20)
    expect(last.h).toBeLessThan(45) // âmbar
  })
})

describe('tema "Escuro moderno" (estilo VS Code, padrão)', () => {
  const block = /:root\[data-theme='modern'\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
  const mt = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(block)?.[1]
  const lum = (hex: string) => {
    const f = (x: number) => ((x /= 255) <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
    return (x + 0.05) / (y + 0.05)
  }

  it('a interface tem os tokens do tema moderno, com contraste AA', () => {
    for (const t of ['bg', 'bg-elev', 'bg-panel', 'text', 'text-dim', 'text-faint', 'accent', 'accent-strong']) expect(mt(t), t).toBeDefined()
    for (const bg of ['bg', 'bg-elev', 'bg-panel']) {
      expect(ratio(mt('text')!, mt(bg)!)).toBeGreaterThanOrEqual(4.5)
      expect(ratio(mt('text-faint')!, mt(bg)!)).toBeGreaterThanOrEqual(4.5)
    }
    expect(ratio('#ffffff', mt('accent-strong')!)).toBeGreaterThanOrEqual(4.5)
  })

  it('o editor usa o fundo do tema e as cores de sintaxe do VS Code', () => {
    expect(batideModern.colors['editor.background']).toBe(mt('bg'))
    const color = (token: string) => batideModern.rules.find((r) => r.token === token)?.foreground?.toLowerCase()
    expect(color('keyword')).toBe('569cd6')
    expect(color('function')).toBe('dcdcaa')
    expect(color('string')).toBe('ce9178')
    expect(color('number')).toBe('b5cea8')
    expect(color('type')).toBe('4ec9b0')
    expect(color('identifier')).toBe('9cdcfe')
    expect(color('comment')).toBe('6a9955')
  })
})
