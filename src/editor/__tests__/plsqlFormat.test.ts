import { describe, expect, it } from 'vitest'
import { formatPlsql } from '../plsqlFormat'

const keywords = new Set([
  'CREATE', 'OR', 'REPLACE', 'PACKAGE', 'BODY', 'AS', 'IS', 'PROCEDURE', 'FUNCTION', 'RETURN', 'IN', 'OUT',
  'NUMBER', 'VARCHAR2', 'BEGIN', 'END', 'SELECT', 'SUM', 'INTO', 'FROM', 'WHERE', 'IF', 'THEN', 'ELSIF', 'ELSE',
  'LOOP', 'FOR', 'EXCEPTION', 'WHEN', 'OTHERS', 'NO_DATA_FOUND', 'RAISE', 'NULL', 'CASE', 'DECLARE', 'CURSOR',
  'DBMS_OUTPUT', 'PUT_LINE', 'AND', 'NOT',
])
const fmt = (s: string) => formatPlsql(s, { indent: '  ', keywords, keywordCase: 'upper' })

describe('formatPlsql: caixa das palavras-chave', () => {
  it('padrão da equipe: palavras-chave em minúsculas', () => {
    const out = formatPlsql('BEGIN\nIF X > 0 THEN\nDBMS_OUTPUT.PUT_LINE(\'OK\');\nEND IF;\nEND;', { indent: '  ', keywords })
    expect(out).toBe("begin\n  if X > 0 then\n    dbms_output.put_line('OK');\n  end if;\nend;\n")
  })
})

describe('formatPlsql', () => {
  it('indenta package body com procedure, select e exceção', () => {
    const input = `create or replace package body pkg_vendas as
procedure total(p_id in number) is
v_total number;
begin
select sum(valor)
into v_total
from vendas where id = p_id;
if v_total > 100 then
dbms_output.put_line('Total: ' || v_total);
elsif v_total > 0 then
null;
else
raise no_data_found;
end if;
exception
when no_data_found then
null;
when others then
raise;
end total;
end pkg_vendas;
/`
    expect(fmt(input)).toBe(`CREATE OR REPLACE PACKAGE BODY pkg_vendas AS
  PROCEDURE total(p_id IN NUMBER) IS
    v_total NUMBER;
  BEGIN
    SELECT SUM(valor)
      INTO v_total
      FROM vendas WHERE id = p_id;
    IF v_total > 100 THEN
      DBMS_OUTPUT.PUT_LINE('Total: ' || v_total);
    ELSIF v_total > 0 THEN
      NULL;
    ELSE
      RAISE NO_DATA_FOUND;
    END IF;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      NULL;
    WHEN OTHERS THEN
      RAISE;
  END total;
END pkg_vendas;
/
`)
  })

  it('trata loops, CASE e cursor sem abrir bloco no IS do cursor', () => {
    const input = `declare
cursor c is select id from t;
begin
for r in c loop
case r.id
when 1 then
null;
else
null;
end case;
end loop;
end;`
    expect(fmt(input)).toBe(`DECLARE
  CURSOR c IS SELECT id FROM t;
BEGIN
  FOR r IN c LOOP
    CASE r.id
      WHEN 1 THEN
        NULL;
      ELSE
        NULL;
    END CASE;
  END LOOP;
END;
`)
  })

  it('não altera strings, comentários e binds', () => {
    const input = `begin
-- select from comentário
x := 'select from' || :new.valor; /* begin end */
end;`
    expect(fmt(input)).toBe(`BEGIN
  -- select from comentário
  x := 'select from' || :new.valor; /* begin end */
END;
`)
  })

  it('preserva comentários de várias linhas', () => {
    const input = `/* cabeçalho
   begin  end
*/
begin
null;
end;`
    expect(fmt(input)).toBe(`/* cabeçalho
   begin  end
*/
BEGIN
  NULL;
END;
`)
  })

  it('CASE em uma linha não altera a indentação', () => {
    const input = `begin
x := case when a then 1 else 2 end;
y := 1;
end;`
    expect(fmt(input)).toBe(`BEGIN
  x := CASE WHEN a THEN 1 ELSE 2 END;
  y := 1;
END;
`)
  })
})

describe('formatPlsql: padrão da equipe com alinhamentos', () => {
  const lower = (s: string) => formatPlsql(s, { indent: '  ', keywords: new Set([...keywords, 'CHAR', 'NVL', 'INSERT', 'VALUES', 'SYSDATE', 'OPEN', 'FETCH', 'CLOSE', 'ROWTYPE', 'RAISE_APPLICATION_ERROR', 'REGEXP_REPLACE', 'SQLERRM', 'IS', 'NULL']) })

  // Mesmo estilo da procedure de exemplo da equipe: parâmetros com vírgula na frente,
  // "rio" do select, colunas do insert alinhadas e comentários no fim das linhas.
  const canon = `procedure prc_baixa_pedido(p_id_pedido in number
                          ,p_id_conta  in number
                          ,p_mensagem  out varchar2
                          ,p_status    out char) is
  --
  cursor c_pedido is
    select p.id_pedido
          ,p.id_empresa
          ,nvl(p.desconto, 0) desconto
      from pedidos p
     where p.id_pedido = p_id_pedido
       and p.id_conta = p_id_conta;
  --
  r_pedido c_pedido%rowtype;
  --
  cursor c_itens(pc_id_pedido number) is
    select i.id_item
          ,i.quantidade
      from pedidos_itens i
     where i.id_pedido = pc_id_pedido
       and i.status != 'CA';
  --
  v_total number;
  --
begin
  --
  if (p_id_pedido is null) then
    --
    raise_application_error(-20001, 'Pedido não informado.');
    --
  elsif (p_id_conta is null) then
    --
    raise_application_error(-20001, 'Conta não informada.');
    --
  end if;
  --
  open  c_pedido;
  fetch c_pedido into r_pedido;
  close c_pedido;
  --
  for r_itens in c_itens(r_pedido.id_pedido) loop
    --
    if (v_total is null) then
      --
      v_total := pck_util.fnc_total(p_id_conta
                                   ,r_pedido.id_empresa);
      --
    end if;
    --
    insert into baixas (id_baixa,
                        id_item,
                        quantidade,
                        data_hora)
                 values(seq_baixas.nextval,
                        r_itens.id_item, -- id_item
                        r_itens.quantidade,--quantidade
                        sysdate
                        );
    --
  end loop;
  --
  p_status := 'F';
  --
exception
  when others then
    --
    p_status := 'E';
    p_mensagem := regexp_replace(sqlerrm,'^ORA-[0-9]+: ', null);
    --
end prc_baixa_pedido;
`

  it('código já no padrão sai idêntico (não desmonta parâmetros, select e insert alinhados)', () => {
    expect(lower(canon)).toBe(canon)
    expect(formatPlsql(canon, { indent: '  ', keywords, keywordCase: 'lower', separators: true })).toBe(canon)
  })

  it('reindenta blocos desalinhados e leva as linhas de continuação junto, sem perder o alinhamento', () => {
    // Desloca cada comando inteiro (primeira linha e continuações) para a esquerda ou direita.
    const lines = canon.split('\n')
    const shifted = lines.map((l, i) => (i >= 5 && i < 12 ? '      ' + l : i >= 49 && i < 58 ? l.slice(4) : l)).join('\n')
    expect(shifted).not.toBe(canon)
    expect(lower(shifted)).toBe(canon)
  })
})

describe('formatPlsql: separadores "--" do padrão da equipe', () => {
  const team = (s: string) => formatPlsql(s, { indent: '  ', keywords, keywordCase: 'lower', separators: true })

  it('põe "--" entre o fim de um bloco e o comando seguinte, e antes do fechamento', () => {
    const input = ['begin', '  --', '  if (a) then', '    --', '    x;', '    --', '  end if;', '  htp.p(1);', '  htp.p(2);', 'end;'].join('\n')
    expect(team(input)).toBe(
      ['begin', '  --', '  if (a) then', '    --', '    x;', '    --', '  end if;', '  --', '  htp.p(1);', '  htp.p(2);', '  --', 'end;', ''].join('\n'),
    )
  })

  it('monta o padrão completo em código sem nenhum "--", mantendo agrupados os comandos simples', () => {
    const input = `procedure p is
v number;
begin
open c;
fetch c into r;
close c;
if (v is null) then
x := 1;
elsif (v = 1) then
x := 2;
else
x := 3;
end if;
for r in c loop
null;
end loop;
exception
when others then
raise;
end p;`
    expect(team(input)).toBe(`procedure p is
  --
  v number;
  --
begin
  --
  open c;
  fetch c into r;
  close c;
  --
  if (v is null) then
    --
    x := 1;
    --
  elsif (v = 1) then
    --
    x := 2;
    --
  else
    --
    x := 3;
    --
  end if;
  --
  for r in c loop
    --
    null;
    --
  end loop;
  --
exception
  when others then
    --
    raise;
    --
end p;
`)
  })

  it('comentário já conta como separador; case dentro de expressão não ganha "--"', () => {
    const input = ['begin', '  -- abre', '  if (a) then', '    -- faz x', '    x := case', '           when a then 1', '           else 2', '         end;', '    -- fim', '  end if;', 'end;'].join('\n')
    expect(team(input)).toBe([...input.split('\n').slice(0, 10), '  --', 'end;', ''].join('\n'))
  })

  it('sem a opção, não acrescenta nada', () => {
    expect(fmt('begin\nif a then\nx;\nend if;\ny;\nend;')).not.toContain('--')
  })
})

describe('formatPlsql: alinhamento da lista de parâmetros', () => {
  const team = (s: string) => formatPlsql(s, { indent: '  ', keywords, keywordCase: 'lower', separators: true })

  it('vírgula embaixo do "(" e modo/tipo na mesma coluna, inclusive na primeira linha', () => {
    const input = `procedure prc_x(p_id_conta              in number
                  ,p_id_empresas           in varchar2
                  ,p_tipo  in char := 'V'
                  ,p_somente in char default '0') is
begin
  --
  null;
  --
end;`
    expect(team(input)).toBe(`procedure prc_x(p_id_conta    in number
               ,p_id_empresas in varchar2
               ,p_tipo        in char := 'V'
               ,p_somente     in char default '0') is
begin
  --
  null;
  --
end;
`)
  })

  it('também em cursor e function (com return na última linha)', () => {
    const input = `declare
  --
  cursor c_a(pc_filtro varchar2
     ,pc_considerar_os_painel char) is
    select 1 from dual;
  --
  function fnc_a(p_a in number
  ,p_bb in number) return number is
  begin
    --
    return 1;
    --
  end fnc_a;
  --
begin
  --
  null;
  --
end;`
    const out = team(input)
    expect(out).toContain('  cursor c_a(pc_filtro               varchar2\n            ,pc_considerar_os_painel char) is\n')
    expect(out).toContain('  function fnc_a(p_a  in number\n                ,p_bb in number) return number is\n')
  })
})
