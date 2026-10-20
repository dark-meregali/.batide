// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { language as tsLanguage } from 'monaco-editor/languages/definitions/typescript/typescript'
import { withFunctionTokens } from '../functionTokens'

type Rule = [RegExp, unknown]

const firstRule = (lang: typeof tsLanguage) => (lang.tokenizer.common as Rule[])[0]
const matchAt = (re: RegExp, text: string) => new RegExp('^(?:' + re.source + ')', re.flags).exec(text)?.[0] ?? null

describe('withFunctionTokens', () => {
  const lang = withFunctionTokens(tsLanguage)
  const [re, action] = firstRule(lang)

  it('marca identificador seguido de "(" como função', () => {
    expect(matchAt(re, 'soma(1)')).toBe('soma')
    expect(matchAt(re, 'calculaTotal (x)')).toBe('calculaTotal')
    expect(matchAt(re, 'Number(x)')).toBe('Number')
    expect(action).toEqual({ cases: { '@keywords': 'keyword', '@default': 'function' } })
  })

  it('não marca identificador comum', () => {
    expect(matchAt(re, 'total + 1')).toBeNull()
    expect(matchAt(re, 'obj.prop')).toBeNull()
  })

  it('palavras-chave antes de "(" continuam palavras-chave (if, for, return…)', () => {
    expect(lang.keywords).toEqual(expect.arrayContaining(['if', 'for', 'while', 'return', 'function']))
  })

  it('não altera a definição original do Monaco', () => {
    expect(firstRule(tsLanguage)[1]).toEqual({ cases: { '@keywords': 'keyword', '@default': 'identifier' } })
    expect(lang.tokenizer).not.toBe(tsLanguage.tokenizer)
    expect((lang.tokenizer.common as Rule[]).length).toBe((tsLanguage.tokenizer.common as Rule[]).length + 1)
  })
})
