import { describe, expect, it } from 'vitest'
import { recordColumns } from '../plsqlColumns'

const prc = `procedure prc_teste (p_teste) is
  --
  cursor c_teste is
    select t.id_teste
      from teste t
     where t.id_conta = 115;
  --
  r_teste c_teste;
  --
begin
  --
  open c_teste;
  fetch c_teste into r_teste;
  close c_teste;
  --
  r_teste.
end prc_teste;`

describe('colunas de registro baseado em cursor', () => {
  it('variável declarada com o tipo do cursor (r_teste c_teste;) traz as colunas do select', () => {
    expect(recordColumns(prc, 'r_teste')).toEqual(['id_teste'])
  })

  it('%rowtype, várias colunas, apelidos (com e sem "as"), funções e colunas sem prefixo', () => {
    const src = `
      cursor c_itens(p_id in number) is
        select ii.id_produto
              ,nvl(ii.quantidade, 0) qtd
              ,ii.valor * 2 as valor_dobro
              ,count(*) over (partition by ii.id_produto, ii.lote) total
              ,descricao
          from itens ii
         where ii.id = p_id;
      r_item c_itens%rowtype;`
    expect(recordColumns(src, 'r_item')).toEqual(['id_produto', 'qtd', 'valor_dobro', 'total', 'descricao'])
  })

  it('for r in cursor loop e for r in (select …) loop', () => {
    const src = `
      cursor c_produtos is select p.id, p.nome from produtos p;
      begin
        for r_prod in c_produtos loop
          null;
        end loop;
        for r_x in (select a.cod, b.descricao desc_b from a, b) loop
          null;
        end loop;`
    expect(recordColumns(src, 'r_prod')).toEqual(['id', 'nome'])
    expect(recordColumns(src, 'r_x')).toEqual(['cod', 'desc_b'])
  })

  it('ignora maiúsculas/minúsculas no nome e comentários/strings no meio do select', () => {
    const src = `
      CURSOR C_A IS
        SELECT A.ID -- comentário, com vírgula
              ,'x, y' TEXTO
          FROM A;
      R_A C_A;`
    expect(recordColumns(src, 'r_a')).toEqual(['ID', 'TEXTO'])
  })

  it('nome que não é registro de cursor devolve null', () => {
    expect(recordColumns(prc, 'v_total')).toBeNull()
    expect(recordColumns(prc, 'c_teste')).toBeNull()
  })
})
