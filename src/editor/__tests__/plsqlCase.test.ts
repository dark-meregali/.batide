import { describe, expect, it } from 'vitest'
import { applyKeywordCase } from '../plsql'

const kw = new Set(['IF', 'THEN', 'END', 'NULL', 'NUMBER', 'BEFORE', 'AFTER', 'SQLERRM', 'REGEXP_REPLACE'])

describe('caixa das palavras-chave nos snippets', () => {
  it('minúsculas deixa o snippet como está', () => {
    const body = 'if (${1:condicao}) then\n  --\n  ${0}\n  --\nend if;'
    expect(applyKeywordCase(body, kw, 'lower')).toBe(body)
  })

  it('maiúsculas troca só as palavras-chave, inclusive nos valores padrão e nas escolhas', () => {
    expect(applyKeywordCase('if (${1:condicao}) then\n  ${0:null;}\nend if;', kw, 'upper')).toBe(
      'IF (${1:condicao}) THEN\n  ${0:NULL;}\nEND IF;',
    )
    expect(applyKeywordCase('${2|before,after|} ${3:number}', kw, 'upper')).toBe('${2|BEFORE,AFTER|} ${3:NUMBER}')
  })

  it('não mexe em textos entre aspas nem em identificadores', () => {
    expect(applyKeywordCase("p_end := regexp_replace(sqlerrm, '^if then', null);", kw, 'upper')).toBe(
      "p_end := REGEXP_REPLACE(SQLERRM, '^if then', NULL);",
    )
  })
})
