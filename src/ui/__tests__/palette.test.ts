import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { batideDark } from '../../editor/theme'

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
