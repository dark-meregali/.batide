import type { languages } from 'monaco-editor'

/** Identificador seguido de "(": declaração ou chamada de função. */
const FUNCTION_CALL = /#?[a-zA-Z_$][\w$]*(?=\s*\()/

/**
 * Devolve uma cópia do tokenizador Monarch (TS/JS do Monaco) que marca nomes de função
 * com o token "function", para o tema poder estilizá-los (itálico cursivo).
 */
export function withFunctionTokens<T extends languages.IMonarchLanguage>(lang: T): T {
  const common = lang.tokenizer.common as languages.IMonarchLanguageRule[]
  return {
    ...lang,
    tokenizer: {
      ...lang.tokenizer,
      common: [[FUNCTION_CALL, { cases: { '@keywords': 'keyword', '@default': 'function' } }], ...common],
    },
  }
}
