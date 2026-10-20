/**
 * Formatador de PL/SQL: reindenta blocos e padroniza a caixa das palavras reservadas (minúsculas, padrão da equipe),
 * mantendo as quebras de linha do autor (formatadores de SQL genéricos desmontam
 * procedures e packages). Só a primeira linha de cada comando é reposicionada; as linhas de
 * continuação (parâmetros, "rio" do select, colunas do insert) andam junto com ela, mantendo
 * o alinhamento do autor.
 */

// 'casex': case dentro de uma expressão (x := case …, select case …), não é bloco de comandos.
type Frame = 'decl' | 'block' | 'exc' | 'if' | 'loop' | 'case' | 'casex' | 'when'

interface Tok {
  kind: 'word' | 'other'
  text: string
}

export interface FormatOptions {
  indent: string
  /** Palavras reservadas, tipos e funções nativas (em maiúsculas). */
  keywords: Set<string>
  /** Padrão da equipe: minúsculas. */
  keywordCase?: 'lower' | 'upper'
  /**
   * Padrão da equipe: "--" depois de cada abertura de bloco, antes de cada fechamento e entre
   * um bloco e o comando vizinho. Comandos simples seguidos ficam agrupados como estão.
   */
  separators?: boolean
}

/** O que veio na última linha de código, para decidir onde vai o separador "--". */
type Prev = 'none' | 'comment' | 'opener' | 'exception' | 'blockEnd' | 'stmt'

const BLOCK_START = new Set(['IF', 'FOR', 'WHILE', 'LOOP', 'BEGIN', 'CASE', 'DECLARE', 'PROCEDURE', 'FUNCTION', 'CREATE'])

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
  // Indentação original e nova da primeira linha do comando atual.
  let anchorOrig = 0
  let anchorNew = 0
  let prev: Prev = 'none'

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
      prev = 'none'
      out.push('/')
      continue
    }

    const res = tokenize(line, false, false)
    const toks = res.tokens
    const words = toks.filter((t) => t.kind === 'word').map((t) => t.text.toUpperCase())
    const first = words[0] && toks[0]?.kind === 'word' ? words[0] : ''

    // ---- indentação desta linha ----
    let level = stack.length
    let continuation = false
    if (top() === 'casex') continuation = true // dentro de "x := case …": linhas do mesmo comando
    else if (first === 'END') level -= top() === 'when' ? 2 : 1
    else if (first === 'BEGIN' && top() === 'decl') level -= 1
    else if ((first === 'ELSE' || first === 'ELSIF') && (top() === 'if' || top() === 'when')) level -= 1
    else if (first === 'EXCEPTION' && top() === 'block') level -= 1
    else if (first === 'WHEN' && top() === 'when') level -= 1
    else continuation = stmt.length > 0
    level = Math.max(0, level)
    const origIndent = raw.length - raw.trimStart().length
    const prevAnchor = anchorNew
    let indent: string
    if (continuation) {
      // Mantém a distância até a primeira linha do comando; sem recuo próprio, um nível a mais.
      const offset = origIndent - anchorOrig
      indent =
        offset > 0
          ? ' '.repeat(anchorNew + offset)
          : opts.indent.repeat(level + (line.startsWith(')') || line.startsWith('--') ? 0 : 1))
    } else {
      indent = opts.indent.repeat(level)
      anchorOrig = origIndent
      anchorNew = indent.length
    }

    // ---- separador "--" antes desta linha (padrão da equipe) ----
    const isComment = line.startsWith('--') || line.startsWith('/*')
    if (opts.separators && !continuation && !isComment && prev !== 'none' && prev !== 'comment') {
      // Fechamento (end, elsif, else, exception, begin das declarações) ou when: recua um nível.
      const closer = level < stack.length || first === 'WHEN'
      if (closer) {
        if (prev === 'stmt' || prev === 'blockEnd') out.push(' '.repeat(prevAnchor) + '--')
      } else if (prev === 'opener' || prev === 'blockEnd' || (prev === 'stmt' && BLOCK_START.has(first))) {
        out.push(indent + '--')
      }
    }

    // ---- atualiza a pilha de blocos, token a token ----
    const depthBefore = stack.length
    let prevWord = ''
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
          if (prevWord !== 'END') stack.push('loop')
          break
        case 'IF':
          if (prevWord !== 'END') stack.push('if')
          break
        case 'CASE':
          if (prevWord !== 'END') stack.push(stmt.length > 0 ? 'casex' : 'case')
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
      // "cursor c is" continua no select da linha de baixo; "x := case" continua o comando.
      const cursorIs = (w === 'IS' || w === 'AS') && stmt.includes('CURSOR')
      const inExpr = stack.includes('casex')
      stmt = STMT_RESET.has(w) && !cursorIs && !inExpr ? [] : [...stmt, w]
      prevWord = w
    }
    // Linha que abriu um bloco (ex.: "CASE r.id") não deixa as seguintes como continuação.
    if (stack.length > depthBefore) stmt = []
    inComment = res.inComment
    inString = res.inString

    // ---- o que esta linha deixa para a próxima ----
    if (isComment) prev = 'comment'
    else {
      const code = toks.filter((t) => !t.text.startsWith('--') && !t.text.startsWith('/*')).map((t) => t.text).join('').trim()
      const lastWord = [...toks].reverse().find((t) => t.kind === 'word')?.text.toUpperCase() ?? ''
      if (stack.includes('casex')) prev = 'stmt'
      else if (/^end\b/i.test(code) || /\bend(\s+[\w$#]+)?\s*;$/i.test(code)) prev = 'blockEnd'
      else if (first === 'EXCEPTION' && lastWord === 'EXCEPTION') prev = 'exception'
      else if (stack.length > depthBefore || lastWord === 'THEN' || lastWord === 'ELSE' || first === 'BEGIN') prev = 'opener'
      else prev = 'stmt'
    }

    const text = toks
      .map((t) => {
        if (t.kind !== 'word' || !opts.keywords.has(t.text.toUpperCase())) return t.text
        return opts.keywordCase === 'upper' ? t.text.toUpperCase() : t.text.toLowerCase()
      })
      .join('')
      .trimEnd()
    out.push(indent + text)
  }

  alignParams(out)
  // No máximo uma linha em branco seguida.
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '\n')
}

const PARAM_HEADER = /^(\s*(?:create\s+(?:or\s+replace\s+)?)?(?:procedure|function|cursor)\s+[\w$#."]+\s*\()\s*(.*)$/i
const PARAM = /^([\w$#"]+)\s*(.*)$/

/**
 * Lista de parâmetros com a vírgula na frente (padrão da equipe): vírgula embaixo do "(" e
 * modo/tipo de todos os parâmetros na mesma coluna, inclusive o da primeira linha.
 */
function alignParams(out: string[]) {
  for (let i = 0; i < out.length; i++) {
    const head = PARAM_HEADER.exec(out[i])
    if (!head || !out[i + 1]?.trimStart().startsWith(',')) continue
    const params = [head[2]]
    let j = i + 1
    while (j < out.length && out[j].trimStart().startsWith(',')) params.push(out[j++].trimStart().slice(1).trimStart())
    const parsed = params.map((p) => PARAM.exec(p))
    if (parsed.some((m) => !m)) continue
    const width = Math.max(...parsed.map((m) => m![1].length))
    const cell = (m: RegExpExecArray) => (m[2] ? m[1].padEnd(width) + ' ' + m[2] : m[1])
    const col = head[1].length - 1 // coluna do "("
    out[i] = head[1] + cell(parsed[0]!)
    for (let k = 1; k < parsed.length; k++) out[i + k] = ' '.repeat(col) + ',' + cell(parsed[k]!)
    i = j - 1
  }
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
