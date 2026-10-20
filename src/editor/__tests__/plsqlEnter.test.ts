import { describe, expect, it } from 'vitest'
import { plsqlEnter } from '../plsqlEnter'

/**
 * Aplica o Enter na linha `line` (cursor no fim) de `doc` e devolve o texto final, com "|"
 * marcando onde o cursor ficou. null = Enter comum (a IDE não interfere).
 */
function enter(doc: string, line: number) {
  const lines = doc.split('\n')
  const r = plsqlEnter({ lines, line, column: lines[line].length, tabSize: 2 })
  if (!r) return null
  const out = [...lines]
  if (r.replaceLine !== undefined) out[line] = r.replaceLine
  if (r.removeNext) out.splice(line + 1, 1)
  const at = line + 1 + (r.after ?? 0)
  out.splice(at, 0, ...r.insert)
  out[at + r.cursorLine] = out[at + r.cursorLine].slice(0, r.cursorColumn) + '|' + out[at + r.cursorLine].slice(r.cursorColumn)
  return out.join('\n')
}

describe('Enter no padrão PL/SQL da equipe', () => {
  it('if … then: abre o bloco com "--", cursor no meio e fecha com end if', () => {
    expect(enter('  if (x is null) then', 0)).toBe(['  if (x is null) then', '    --', '    |', '    --', '  end if;'].join('\n'))
  })

  it('for … loop fecha com end loop; case fecha com end case', () => {
    expect(enter('for r in c_produtos loop', 0)).toBe('for r in c_produtos loop\n  --\n  |\n  --\nend loop;')
    expect(enter('while v_i < 10 loop', 0)).toBe('while v_i < 10 loop\n  --\n  |\n  --\nend loop;')
    expect(enter('case v_tipo', 0)).toBe('case v_tipo\n  --\n  |\n  --\nend case;')
  })

  it('begin sem fechamento abaixo ganha end;', () => {
    expect(enter('begin', 0)).toBe('begin\n  --\n  |\n  --\nend;')
  })

  it('não duplica o fechamento quando ele já existe abaixo', () => {
    const doc = ['  if (a) then', '    --', '    x;', '    --', '  elsif (b) then', '  end if;'].join('\n')
    expect(enter(doc, 4)).toBe(['  if (a) then', '    --', '    x;', '    --', '  elsif (b) then', '    --', '    |', '    --', '  end if;'].join('\n'))

    const begin = ['begin', '  null;', 'end;'].join('\n')
    expect(enter(begin, 0)).toBe(['begin', '  --', '  |', '  --', '  null;', 'end;'].join('\n'))
  })

  it('else e when … then abrem bloco sem fechamento próprio', () => {
    expect(enter(['  if (a) then', '    x;', '  else', '  end if;'].join('\n'), 2)).toBe(
      ['  if (a) then', '    x;', '  else', '    --', '    |', '    --', '  end if;'].join('\n'),
    )
    expect(enter(['exception', '  when others then', 'end;'].join('\n'), 1)).toBe(
      ['exception', '  when others then', '    --', '    |', '    --', 'end;'].join('\n'),
    )
  })

  it('exception: só indenta (a próxima linha é o when, sem "--")', () => {
    expect(enter(['  exception', '  end;'].join('\n'), 0)).toBe(['  exception', '    |', '  end;'].join('\n'))
  })

  it('cabeçalho de procedure/function (… is) e declare abrem a seção de declarações', () => {
    const header = [
      'procedure prc_movimenta(p_id in number',
      '                       ,p_status out char) is',
    ].join('\n')
    expect(enter(header, 1)).toBe([...header.split('\n'), '  --', '  |', '  --'].join('\n'))
    expect(enter('declare', 0)).toBe('declare\n  --\n  |\n  --')
    expect(enter('  function fnc_total return number is', 0)).toBe('  function fnc_total return number is\n    --\n    |\n    --')
  })

  it('cursor is select … não é bloco (é declaração de cursor)', () => {
    expect(enter('  cursor c_itens is', 0)).toBeNull()
  })

  it('comando terminado em ";" ganha a linha separadora "--"', () => {
    expect(enter('    p_status := \'F\';', 0)).toBe("    p_status := 'F';\n    --\n    |")
    expect(enter(['    raise_application_error(-20001, \'x\');', '    --', '  end if;'].join('\n'), 0)).toBe(
      ['    raise_application_error(-20001, \'x\');', '    --', '    |', '    --', '  end if;'].join('\n'),
    )
  })

  it('comando de várias linhas (cursor … is select …; insert … values(…);) separa na indentação onde começou', () => {
    const cursor = [
      '    --',
      '    cursor c_produtos is',
      '      select ii.id_produto',
      '        from indenizacoes_itens ii',
      "       where ii.status != 'CA';",
    ]
    expect(enter(cursor.join('\n'), 4)).toBe([...cursor, '    --', '    |'].join('\n'))

    const insert = [
      '        --',
      '        insert into movimentacao_estoque (id_movimentacao,',
      '                                          id_conta)',
      '                                   values(seq.nextval,',
      '                                          p_id_conta',
      '                                          );',
    ]
    expect(enter(insert.join('\n'), 5)).toBe([...insert, '        --', '        |'].join('\n'))
  })

  it('begin digitado dentro das declarações volta para a coluna da procedure e reaproveita o "--"', () => {
    const doc = ['procedure p is', '  --', '  v_total number;', '  --', '  begin', '  --']
    expect(enter(doc.join('\n'), 4)).toBe(
      ['procedure p is', '  --', '  v_total number;', '  --', 'begin', '  --', '  |', '  --', 'end;'].join('\n'),
    )
  })

  it('begin aninhado no corpo continua onde está', () => {
    const doc = ['begin', '  --', '  begin', 'end;']
    expect(enter(doc.join('\n'), 2)).toBe(['begin', '  --', '  begin', '    --', '    |', '    --', '  end;', 'end;'].join('\n'))
  })

  it('exception digitado no nível dos comandos volta para a coluna do begin', () => {
    const doc = ['begin', '  --', '  null;', '  --', '  exception', 'end;']
    expect(enter(doc.join('\n'), 4)).toBe(['begin', '  --', '  null;', '  --', 'exception', '  |', 'end;'].join('\n'))
  })

  it('exception tira o "--" final do begin que ficaria solto antes do end', () => {
    const doc = ['begin', '  --', '  null;', '  --', '  exception', '  --', 'end;']
    expect(enter(doc.join('\n'), 4)).toBe(['begin', '  --', '  null;', '  --', 'exception', '  |', 'end;'].join('\n'))
  })

  it('fechamentos (end if; end loop; end;) não ganham separador', () => {
    expect(enter('  end if;', 0)).toBeNull()
    expect(enter('end loop;', 0)).toBeNull()
    expect(enter('  end prc_movimenta_estoque;', 0)).toBeNull()
  })

  it('não interfere fora do fim da linha, em comentários, strings e listas de parâmetros', () => {
    const lines = ['  if (x) then']
    expect(plsqlEnter({ lines, line: 0, column: 5, tabSize: 2 })).toBeNull()
    expect(enter('  -- se der erro then', 0)).toBeNull()
    expect(enter("  v := 'abre o loop", 0)).toBeNull()
    expect(enter('procedure p(a in number', 0)).toBeNull()
    expect(enter('             ,b in number', 0)).toBeNull()
    expect(enter('    --', 0)).toBeNull()
  })

  it('o fechamento segue a caixa da abertura (THEN → END IF)', () => {
    expect(enter('IF (x) THEN', 0)).toBe('IF (x) THEN\n  --\n  |\n  --\nEND IF;')
  })
})
