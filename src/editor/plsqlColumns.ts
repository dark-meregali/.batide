/**
 * Colunas de registros baseados em cursor, para o autocomplete depois de "registro.".
 * Reconhece `r c_cursor;`, `r c_cursor%rowtype;`, `for r in c_cursor loop` e
 * `for r in (select …) loop`. Função pura sobre o texto do arquivo.
 */

const ID = '[a-zA-Z_][\\w$#]*'

/** Tira comentários e o conteúdo de strings (mantém as aspas), para não confundir vírgulas e "from". */
function strip(src: string) {
  return src.replace(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'/g, (m) => (m.startsWith("'") ? "''" : ' '))
}

/** Nomes das colunas do select que começa em `start` (logo depois da palavra select). */
function selectColumns(code: string, start: number): string[] {
  let depth = 0
  let end = code.length
  const items: string[] = []
  let itemStart = start
  for (let i = start; i < code.length; i++) {
    const c = code[i]
    if (c === '(') depth++
    else if (c === ')') {
      if (depth === 0) { end = i; break } // fim do (select …) de um for
      depth--
    } else if (depth === 0 && c === ',') {
      items.push(code.slice(itemStart, i))
      itemStart = i + 1
    } else if (depth === 0 && /^from\b/i.test(code.slice(i, i + 5)) && /\W/.test(code[i - 1] ?? ' ')) {
      end = i
      break
    }
  }
  items.push(code.slice(itemStart, end))
  const cols: string[] = []
  for (const raw of items) {
    const item = raw.trim()
    const m = new RegExp(`(${ID})$`).exec(item)
    if (!m) continue // expressão sem apelido, ou "*"
    const before = item.slice(0, m.index)
    // "col", "t.col", "expr apelido" ou "expr as apelido"; "nvl(x" + ")" não chega aqui.
    if (before === '' || before.endsWith('.') || /\s$/.test(before)) cols.push(m[1])
  }
  return cols
}

function cursorColumns(code: string, cursor: string): string[] | null {
  const re = new RegExp(`\\bcursor\\s+(${ID})\\s*(?:\\([^)]*\\))?\\s*is\\s+select\\b`, 'gi')
  for (const m of code.matchAll(re)) {
    if (m[1].toLowerCase() === cursor.toLowerCase()) return selectColumns(code, m.index + m[0].length)
  }
  return null
}

export function recordColumns(src: string, name: string): string[] | null {
  const code = strip(src)
  const n = name.toLowerCase()
  const decl = new RegExp(`\\b(${ID})\\s+(${ID})\\s*(?:%\\s*rowtype)?\\s*;`, 'gi')
  for (const m of code.matchAll(decl)) {
    if (m[1].toLowerCase() !== n) continue
    const cols = cursorColumns(code, m[2])
    if (cols) return cols
  }
  const forCursor = new RegExp(`\\bfor\\s+(${ID})\\s+in\\s+(${ID})\\s*(?:\\([^)]*\\))?\\s*loop\\b`, 'gi')
  for (const m of code.matchAll(forCursor)) {
    if (m[1].toLowerCase() !== n) continue
    const cols = cursorColumns(code, m[2])
    if (cols) return cols
  }
  const forSelect = new RegExp(`\\bfor\\s+(${ID})\\s+in\\s*\\(\\s*select\\b`, 'gi')
  for (const m of code.matchAll(forSelect)) {
    if (m[1].toLowerCase() === n) return selectColumns(code, m.index + m[0].length)
  }
  return null
}
