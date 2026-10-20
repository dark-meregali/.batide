/**
 * Enter no padrão PL/SQL da equipe: blocos abertos com "--" logo depois da abertura e antes
 * do fechamento, "--" entre comandos, indentação de 2 espaços e fechamento automático
 * (end if; end loop; end case; end;). Função pura: recebe as linhas e devolve o que inserir.
 */

export interface EnterInput {
  lines: string[]
  /** Linha do cursor (0-based). */
  line: number
  /** Coluna do cursor (0-based, em caracteres). */
  column: number
  tabSize: number
}

export interface EnterResult {
  /** Novo texto da linha atual (ex.: begin reposicionado na coluna da procedure). */
  replaceLine?: string
  /** Remove a linha logo abaixo (ex.: o "--" final do begin, que ficaria solto depois do exception). */
  removeNext?: boolean
  /** Quantas linhas pular antes de inserir (reaproveita um "--" que já está abaixo). */
  after?: number
  /** Linhas novas, inseridas abaixo da linha atual (depois de `after` linhas). */
  insert: string[]
  /** Em qual linha nova o cursor fica (índice em `insert`) e em que coluna. */
  cursorLine: number
  cursorColumn: number
}

const indentOf = (s: string) => /^\s*/.exec(s)![0]

/** Parte de código da linha, sem comentário final; null se a linha termina dentro de uma string. */
function codePart(line: string): string | null {
  let inString = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inString) {
      if (c === "'") {
        if (line[i + 1] === "'") i++
        else inString = false
      }
    } else if (c === "'") inString = true
    else if (c === '-' && line[i + 1] === '-') return line.slice(0, i)
  }
  return inString ? null : line
}

const isBoundary = (code: string) => {
  const t = code.trim().toLowerCase()
  if (t === '' || t === '--' || t.endsWith(';')) return true
  // "cursor c is" continua no select da linha de baixo: não termina o comando.
  if (/^cursor\b/.test(t)) return false
  return /\b(then|loop|begin|else|declare|exception|is|as)$/.test(t)
}

/** Indentação da linha onde o comando começa (comandos podem ocupar várias linhas). */
function statementIndent(lines: string[], line: number) {
  let start = line
  while (start > 0 && !isBoundary(codePart(lines[start - 1]) ?? '')) start--
  return indentOf(lines[start])
}

/** Já existe um fechamento (end/elsif/else/exception/when) para o bloco aberto nesta indentação? */
function hasCloser(lines: string[], line: number, base: string, closers = /^(end|elsif|else|exception|when)\b/i) {
  for (let i = line + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const ind = indentOf(lines[i]).length
    if (ind > base.length) continue
    // Um "end" mais à esquerda fecha o bloco de fora, não este.
    return ind === base.length && closers.test(lines[i].trim())
  }
  return false
}

/** Linha "pai": a primeira acima com indentação menor que a da linha atual. */
function parentLine(lines: string[], line: number) {
  const ind = indentOf(lines[line]).length
  for (let i = line - 1; i >= 0; i--) {
    if (lines[i].trim() && indentOf(lines[i]).length < ind) return lines[i]
  }
  return null
}

const UNIT_HEADER = /^\s*(create\s+(or\s+replace\s+)?)?(procedure|function|package|trigger|type\s+body)\b/i
/** Nome da unidade no cabeçalho, sem o schema: "package body owner.pck" → "pck". */
const UNIT_NAME = /\b(?:procedure|function|package(?:\s+body)?|type\s+body)\s+(?:[\w$#]+\.)?([\w$#]+)/i

export function plsqlEnter({ lines, line, column, tabSize }: EnterInput): EnterResult | null {
  const text = lines[line]
  if (column < text.trimEnd().length) return null
  const code = codePart(text)
  if (code === null) return null
  const trimmed = code.trim()
  if (!trimmed) return null
  const lower = trimmed.toLowerCase()
  const unit = ' '.repeat(tabSize)
  // Fechamento na mesma caixa que o usuário escreveu a abertura.
  const lastWord = /\w+$/.exec(trimmed)?.[0] ?? ''
  const kw = (s: string) => (/[A-Z]/.test(lastWord) && lastWord === lastWord.toUpperCase() ? s.toUpperCase() : s)

  const block = (base: string, closer: string | null, replaceLine?: string, closers?: RegExp): EnterResult => {
    const inner = base + unit
    const close = closer && !hasCloser(lines, line, base, closers) ? [base + closer] : []
    // Já existe o "--" de abertura logo abaixo: reaproveita em vez de duplicar.
    const next = lines[line + 1]
    if (next !== undefined && next.trim() === '--' && indentOf(next) === inner) {
      return { replaceLine, after: 1, insert: [inner, inner + '--', ...close], cursorLine: 0, cursorColumn: inner.length }
    }
    return { replaceLine, insert: [inner + '--', inner, inner + '--', ...close], cursorLine: 1, cursorColumn: inner.length }
  }

  // Seção de declarações: cabeçalho de procedure/function/package (… is/as) ou declare.
  if (lower === 'declare') return block(indentOf(text), null)
  if (/(^|[\s)])(is|as)$/.test(lower)) {
    let start = line
    while (start > 0 && !UNIT_HEADER.test(lines[start]) && !/;\s*$/.test(lines[start - 1])) start--
    if (!UNIT_HEADER.test(lines[start])) return null // cursor … is, type … is: não é bloco
    // Fecha com "end nome;" (a não ser que o corpo já exista abaixo).
    const name = UNIT_NAME.exec(lines.slice(start, line + 1).join(' '))?.[1]
    return block(indentOf(lines[start]), name ? `${kw('end')} ${name};` : null, undefined, /^(begin|end)\b/i)
  }

  const base = indentOf(text)
  const parent = parentLine(lines, line)
  if (lower === 'exception') {
    // exception fica na coluna do begin a que pertence.
    const b = parent && /^begin$/i.test(parent.trim()) ? indentOf(parent) : base
    const next = lines[line + 1]
    const orphan =
      next !== undefined && next.trim() === '--' && indentOf(next) === b + unit && /^end\b/i.test(lines[line + 2]?.trim() ?? '')
    return {
      replaceLine: b !== base ? b + trimmed : undefined,
      removeNext: orphan || undefined,
      insert: [b + unit],
      cursorLine: 0,
      cursorColumn: b.length + unit.length,
    }
  }
  if (lower === 'begin' && parent && (UNIT_HEADER.test(parent) || /^declare$/i.test(parent.trim()))) {
    // begin digitado dentro das declarações volta para a coluna da procedure/declare.
    const b = indentOf(parent)
    return block(b, kw('end;'), b !== base ? b + trimmed : undefined)
  }
  if (/^if\b.*\bthen$/.test(lower)) return block(base, kw('end if;'))
  if (/^(elsif|when)\b.*\bthen$/.test(lower) || lower === 'else') return block(base, null)
  if (/\bloop$/.test(lower) && !/^end\b/.test(lower)) return block(base, kw('end loop;'))
  if (/^case\b/.test(lower) && !lower.endsWith(';')) return block(base, kw('end case;'))
  if (lower === 'begin') return block(base, kw('end;'))

  // Fim de comando: separador "--" na indentação onde o comando começou.
  if (lower.endsWith(';') && !/^end\b/.test(lower)) {
    const ind = statementIndent(lines, line)
    return { insert: [ind + '--', ind], cursorLine: 1, cursorColumn: ind.length }
  }
  return null
}
