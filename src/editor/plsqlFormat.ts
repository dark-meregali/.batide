/**
 * Formatador de PL/SQL: reindenta blocos e põe palavras reservadas em maiúsculas,
 * mantendo as quebras de linha do autor (formatadores de SQL genéricos desmontam
 * procedures e packages).
 */

type Frame = 'decl' | 'block' | 'exc' | 'if' | 'loop' | 'case' | 'when'

interface Tok {
  kind: 'word' | 'other'
  text: string
}

export interface FormatOptions {
  indent: string
  upperWords: Set<string>
}

// Palavras que iniciam a declaração de uma unidade cujo IS/AS abre uma seção de declarações.
const UNIT_WORDS = new Set(['PROCEDURE', 'FUNCTION', 'PACKAGE', 'BODY'])
// Depois destas palavras começa um novo comando.
const STMT_RESET = new Set(['BEGIN', 'DECLARE', 'THEN', 'LOOP', 'ELSE', 'EXCEPTION', 'IS', 'AS', 'CASE'])

export function formatPlsql(source: string, opts: FormatOptions): string {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  const stack: Frame[] = []
  let inComment = false
  let inString = false
  let stmt: string[] = [] // palavras do comando atual (desde o último ';' ou abertura de bloco)

  const top = () => stack[stack.length - 1]

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      out.push('')
      continue
    }
    // Linha que continua um comentário ou string de várias linhas: não mexemos.
    if (inComment || inString) {
      const res = tokenize(raw, inComment, inString)
      inComment = res.inComment
      inString = res.inString
      out.push(raw.trimEnd())
      continue
    }
    if (line === '/') {
      stack.length = 0
      stmt = []
      out.push('/')
      continue
    }

    const res = tokenize(line, false, false)
    const toks = res.tokens
    const words = toks.filter((t) => t.kind === 'word').map((t) => t.text.toUpperCase())
    const first = words[0] && toks[0]?.kind === 'word' ? words[0] : ''

    // ---- indentação desta linha ----
    let level = stack.length
    if (first === 'END') level -= top() === 'when' ? 2 : 1
    else if (first === 'BEGIN' && top() === 'decl') level -= 1
    else if ((first === 'ELSE' || first === 'ELSIF') && (top() === 'if' || top() === 'when')) level -= 1
    else if (first === 'EXCEPTION' && top() === 'block') level -= 1
    else if (first === 'WHEN' && top() === 'when') level -= 1
    else if (stmt.length > 0 && !line.startsWith(')') && !line.startsWith('--')) level += 1 // continuação
    level = Math.max(0, level)

    // ---- atualiza a pilha de blocos, token a token ----
    const depthBefore = stack.length
    let prev = ''
    for (let i = 0; i < toks.length; i++) {
      const tok = toks[i]
      if (tok.kind !== 'word') {
        if (tok.text === ';') stmt = []
        continue
      }
      const w = tok.text.toUpperCase()
      switch (w) {
        case 'DECLARE':
          stack.push('decl')
          break
        case 'IS':
        case 'AS':
          if (stmt.some((s) => UNIT_WORDS.has(s)) && !stmt.includes('CURSOR') && isLastCodeWord(toks, i)) stack.push('decl')
          break
        case 'BEGIN':
          if (top() === 'decl') stack[stack.length - 1] = 'block'
          else stack.push('block')
          break
        case 'LOOP':
          if (prev !== 'END') stack.push('loop')
          break
        case 'IF':
          if (prev !== 'END') stack.push('if')
          break
        case 'CASE':
          if (prev !== 'END') stack.push('case')
          break
        case 'EXCEPTION':
          if (i === 0 && top() === 'block') stack[stack.length - 1] = 'exc'
          break
        case 'WHEN':
          if (top() === 'when') stack.pop()
          if (top() === 'case' || top() === 'exc') stack.push('when')
          break
        case 'ELSE':
          if (top() === 'when') {
            stack.pop()
            stack.push('when')
          }
          break
        case 'END':
          if (top() === 'when') stack.pop()
          stack.pop()
          break
      }
      stmt = STMT_RESET.has(w) ? [] : [...stmt, w]
      prev = w
    }
    // Linha que abriu um bloco (ex.: "CASE r.id") não deixa as seguintes como continuação.
    if (stack.length > depthBefore) stmt = []
    inComment = res.inComment
    inString = res.inString

    const text = toks
      .map((t) => (t.kind === 'word' && opts.upperWords.has(t.text.toUpperCase()) ? t.text.toUpperCase() : t.text))
      .join('')
      .trimEnd()
    out.push(opts.indent.repeat(level) + text)
  }

  // No máximo uma linha em branco seguida.
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '\n')
}

/** IS/AS é a última palavra de código da linha (ex.: "PROCEDURE p IS"), e não "x AS alias". */
function isLastCodeWord(toks: Tok[], i: number) {
  for (let j = i + 1; j < toks.length; j++) {
    const t = toks[j]
    if (t.kind === 'word') return false
    if (/^\s*$/.test(t.text) || t.text.startsWith('--') || t.text.startsWith('/*')) continue
    return false
  }
  return true
}

/**
 * Divide uma linha em palavras e "o resto". Strings, comentários e identificadores entre
 * aspas viram tokens 'other' para nunca serem alterados.
 */
function tokenize(line: string, inComment: boolean, inString: boolean) {
  const tokens: Tok[] = []
  let i = 0
  const push = (kind: Tok['kind'], text: string) => text && tokens.push({ kind, text })

  if (inComment) {
    const end = line.indexOf('*/')
    if (end < 0) return { tokens: [{ kind: 'other' as const, text: line }], inComment: true, inString: false }
    push('other', line.slice(0, end + 2))
    i = end + 2
  } else if (inString) {
    const end = findStringEnd(line, 0)
    if (end < 0) return { tokens: [{ kind: 'other' as const, text: line }], inComment: false, inString: true }
    push('other', line.slice(0, end + 1))
    i = end + 1
  }

  while (i < line.length) {
    const rest = line.slice(i)
    if (rest.startsWith('--')) {
      push('other', rest)
      break
    }
    if (rest.startsWith('/*')) {
      const end = line.indexOf('*/', i + 2)
      if (end < 0) {
        push('other', rest)
        return { tokens, inComment: true, inString: false }
      }
      push('other', line.slice(i, end + 2))
      i = end + 2
      continue
    }
    if (line[i] === "'") {
      const end = findStringEnd(line, i + 1)
      if (end < 0) {
        push('other', rest)
        return { tokens, inComment: false, inString: true }
      }
      push('other', line.slice(i, end + 1))
      i = end + 1
      continue
    }
    if (line[i] === '"') {
      const end = line.indexOf('"', i + 1)
      const stop = end < 0 ? line.length : end + 1
      push('other', line.slice(i, stop))
      i = stop
      continue
    }
    const word = /^[A-Za-z_][\w$#]*/.exec(rest)
    if (word) {
      // Variáveis de ligação (:x) e de substituição (&x) não são palavras-chave.
      const before = line[i - 1]
      push(before === ':' || before === '&' ? 'other' : 'word', word[0])
      i += word[0].length
      continue
    }
    push('other', line[i])
    i++
  }
  return { tokens, inComment: false, inString: false }
}

/** Posição do apóstrofo que fecha a string ('' é escape), ou -1 se continua na próxima linha. */
function findStringEnd(line: string, from: number) {
  for (let i = from; i < line.length; i++) {
    if (line[i] !== "'") continue
    if (line[i + 1] === "'") {
      i++
      continue
    }
    return i
  }
  return -1
}
