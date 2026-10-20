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
