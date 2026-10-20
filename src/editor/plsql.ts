import type * as Monaco from 'monaco-editor'
import { formatPlsql } from './plsqlFormat'
import { recordColumns } from './plsqlColumns'

/** Suporte a PL/SQL (Oracle): destaque de sintaxe, snippets e formatação. */

const keywords = [
  'ACCESSIBLE', 'ADD', 'AGGREGATE', 'ALL', 'ALTER', 'AND', 'ANY', 'AS', 'ASC', 'AUTHID', 'AUTONOMOUS_TRANSACTION',
  'BEGIN', 'BETWEEN', 'BODY', 'BULK', 'BY', 'CASE', 'CHECK', 'CLOSE', 'COLLECT', 'COLUMN', 'COMMENT', 'COMMIT',
  'CONNECT', 'CONSTANT', 'CONSTRAINT', 'CONTINUE', 'CREATE', 'CROSS', 'CURRENT', 'CURRENT_USER', 'CURSOR', 'DECLARE',
  'DEFAULT', 'DEFINER', 'DELETE', 'DESC', 'DETERMINISTIC', 'DISTINCT', 'DROP', 'EDITIONABLE', 'ELSE', 'ELSIF', 'END',
  'EXCEPTION', 'EXCEPTION_INIT', 'EXECUTE', 'EXISTS', 'EXIT', 'FETCH', 'FOR', 'FORALL', 'FOREIGN', 'FROM', 'FULL',
  'FUNCTION', 'GOTO', 'GRANT', 'GROUP', 'HAVING', 'IF', 'IMMEDIATE', 'IN', 'INDEX', 'INNER', 'INSERT', 'INTERSECT',
  'INTO', 'IS', 'JOIN', 'KEY', 'LEFT', 'LIKE', 'LIMIT', 'LOOP', 'MERGE', 'MINUS', 'MATCHED', 'NOCOPY', 'NOT', 'NULL',
  'OF', 'ON', 'OPEN', 'OR', 'ORDER', 'OTHERS', 'OUT', 'OUTER', 'OVER', 'PACKAGE', 'PARTITION', 'PIPE', 'PIPELINED',
  'PRAGMA', 'PRIMARY', 'PRIOR', 'PROCEDURE', 'RAISE', 'RECORD', 'REF', 'REFERENCES', 'REPLACE', 'RESULT_CACHE',
  'RETURN', 'RETURNING', 'REVERSE', 'REVOKE', 'RIGHT', 'ROLLBACK', 'ROW', 'ROWTYPE', 'SAVEPOINT', 'SELECT', 'SEQUENCE',
  'SERIALLY_REUSABLE', 'SET', 'START', 'SUBTYPE', 'SYNONYM', 'TABLE', 'THEN', 'TO', 'TRIGGER', 'TYPE', 'UNION',
  'UNIQUE', 'UPDATE', 'USING', 'VALUES', 'VIEW', 'WHEN', 'WHERE', 'WHILE', 'WITH', 'BEFORE', 'AFTER', 'INSTEAD',
  'EACH', 'NEW', 'OLD', 'TRUE', 'FALSE', 'ROWNUM', 'ROWID', 'LEVEL', 'SYSDATE', 'SYSTIMESTAMP', 'SQL', 'SQLCODE',
  'SQLERRM', 'NO_DATA_FOUND', 'TOO_MANY_ROWS', 'DUP_VAL_ON_INDEX', 'ZERO_DIVIDE', 'VALUE_ERROR', 'INVALID_NUMBER',
  'FOUND', 'NOTFOUND', 'ISOPEN', 'ROWCOUNT', 'BULK_ROWCOUNT', 'FETCH', 'NOCYCLE', 'CASCADE', 'FORCE', 'NOFORCE',
]

const types = [
  'BINARY_DOUBLE', 'BINARY_FLOAT', 'BINARY_INTEGER', 'BLOB', 'BOOLEAN', 'CHAR', 'CLOB', 'DATE', 'DEC', 'DECIMAL',
  'FLOAT', 'INT', 'INTEGER', 'INTERVAL', 'LONG', 'NCHAR', 'NCLOB', 'NUMBER', 'NUMERIC', 'NVARCHAR2', 'PLS_INTEGER',
  'RAW', 'REAL', 'SIMPLE_INTEGER', 'SMALLINT', 'SYS_REFCURSOR', 'TIMESTAMP', 'UROWID', 'VARCHAR', 'VARCHAR2',
  'XMLTYPE', 'ZONE', 'LOCAL', 'TIME', 'YEAR', 'MONTH', 'DAY', 'SECOND', 'VARRAY',
]

const builtins = [
  'ABS', 'ADD_MONTHS', 'AVG', 'CAST', 'CEIL', 'COALESCE', 'CONCAT', 'COUNT', 'DECODE', 'DENSE_RANK', 'EXTRACT',
  'FIRST_VALUE', 'FLOOR', 'GREATEST', 'INITCAP', 'INSTR', 'LAG', 'LAST_DAY', 'LAST_VALUE', 'LEAD', 'LEAST', 'LENGTH',
  'LISTAGG', 'LOWER', 'LPAD', 'LTRIM', 'MAX', 'MIN', 'MOD', 'MONTHS_BETWEEN', 'NEXT_DAY', 'NULLIF', 'NVL', 'NVL2',
  'POWER', 'RANK', 'REGEXP_INSTR', 'REGEXP_LIKE', 'REGEXP_REPLACE', 'REGEXP_SUBSTR', 'REPLACE', 'ROUND', 'ROW_NUMBER',
  'RPAD', 'RTRIM', 'SIGN', 'SQRT', 'SUBSTR', 'SUM', 'SYS_GUID', 'TO_CHAR', 'TO_CLOB', 'TO_DATE', 'TO_NUMBER',
  'TO_TIMESTAMP', 'TRANSLATE', 'TRIM', 'TRUNC', 'UPPER', 'USER', 'DBMS_OUTPUT', 'PUT_LINE', 'RAISE_APPLICATION_ERROR',
  'DBMS_SQL', 'DBMS_LOB', 'UTL_FILE', 'DBMS_SCHEDULER', 'DBMS_UTILITY', 'NEXTVAL', 'CURRVAL', 'XMLAGG', 'JSON_VALUE',
  'JSON_TABLE', 'JSON_OBJECT', 'JSON_ARRAYAGG',
]

const language: Monaco.languages.IMonarchLanguage = {
  ignoreCase: true,
  defaultToken: '',
  tokenPostfix: '.plsql',
  keywords,
  types,
  builtins,
  operators: [':=', '=>', '||', '<>', '!=', '^=', '<=', '>=', '**', '..', '=', '<', '>', '+', '-', '*', '/'],
  symbols: /[=><!~?:&|+\-*/^%.]+/,
  tokenizer: {
    root: [
      [/--.*$/, 'comment'],
      [/\/\*/, 'comment', '@comment'],
      [/[qQ]'\[/, 'string', '@qbracket'],
      [/[qQ]'\{/, 'string', '@qbrace'],
      [/[qQ]'\(/, 'string', '@qparen'],
      [/[nN]?'/, 'string', '@string'],
      [/"[^"]*"/, 'identifier.quote'],
      [/:[a-zA-Z_][\w$#]*/, 'variable'],
      [/&&?[a-zA-Z_][\w$#]*/, 'variable'],
      [/%\s*(type|rowtype|found|notfound|isopen|rowcount|bulk_rowcount)\b/i, 'keyword'],
      [/\d+(\.\d+)?([eE][+-]?\d+)?[fFdD]?/, 'number'],
      [/^\s*\/\s*$/, 'delimiter.slash'],
      // Identificador seguido de "(": chamada ou declaração de função.
      [
        /[a-zA-Z_][\w$#]*(?=\s*\()/,
        { cases: { '@keywords': 'keyword', '@types': 'type', '@builtins': 'predefined', '@default': 'function' } },
      ],
      [
        /[a-zA-Z_][\w$#]*/,
        { cases: { '@keywords': 'keyword', '@types': 'type', '@builtins': 'predefined', '@default': 'identifier' } },
      ],
      [/[;,.]/, 'delimiter'],
      [/[()]/, '@brackets'],
      [/@symbols/, { cases: { '@operators': 'operator', '@default': '' } }],
      [/\s+/, 'white'],
    ],
    comment: [
      [/[^*/]+/, 'comment'],
      [/\*\//, 'comment', '@pop'],
      [/[*/]/, 'comment'],
    ],
    string: [
      [/[^']+/, 'string'],
      [/''/, 'string.escape'],
      [/'/, 'string', '@pop'],
    ],
    qbracket: [[/\]'/, 'string', '@pop'], [/./, 'string']],
    qbrace: [[/\}'/, 'string', '@pop'], [/./, 'string']],
    qparen: [[/\)'/, 'string', '@pop'], [/./, 'string']],
  },
}

const configuration: Monaco.languages.LanguageConfiguration = {
  comments: { lineComment: '--', blockComment: ['/*', '*/'] },
  brackets: [['(', ')']],
  autoClosingPairs: [
    { open: '(', close: ')' },
    { open: "'", close: "'", notIn: ['string', 'comment'] },
    { open: '"', close: '"', notIn: ['string'] },
  ],
  surroundingPairs: [
    { open: '(', close: ')' },
    { open: "'", close: "'" },
    { open: '"', close: '"' },
  ],
  wordPattern: /[a-zA-Z_][\w$#]*/,
  indentationRules: {
    increaseIndentPattern: /^\s*(BEGIN|DECLARE|LOOP|THEN|ELSE|EXCEPTION|IS|AS)\b.*$|\b(LOOP|THEN|IS|AS)\s*$/i,
    decreaseIndentPattern: /^\s*(END|ELSE|ELSIF|EXCEPTION|WHEN)\b/i,
  },
}

// Snippets no padrão da equipe: minúsculas, "--" abrindo/fechando blocos e entre comandos,
// parâmetros com a vírgula na frente.
const snippets: [label: string, doc: string, body: string][] = [
  ['proc', 'procedure', 'procedure ${1:prc_nome}(${2:p_param} in ${3:number}\n${1/./ /g}          ,p_mensagem out varchar2\n${1/./ /g}          ,p_status   out char) is\n  --\nbegin\n  --\n  ${0:null;}\n  --\n  p_status := \'F\';\n  --\nexception\n  when others then\n    --\n    p_status := \'E\';\n    p_mensagem := regexp_replace(sqlerrm, \'^ORA-[0-9]+: \', null);\n    --\nend ${1:prc_nome};'],
  ['func', 'function', 'function ${1:fnc_nome}(${2:p_param} in ${3:number}) return ${4:number} is\n  --\n  v_retorno ${4:number};\n  --\nbegin\n  --\n  ${0}\n  --\n  return v_retorno;\n  --\nend ${1:fnc_nome};'],
  ['pks', 'create or replace package (spec)', 'create or replace package ${1:pck_nome} is\n  --\n  ${0}\n  --\nend ${1:pck_nome};\n/'],
  ['pkb', 'create or replace package body', 'create or replace package body ${1:pck_nome} is\n  --\n  ${0}\n  --\nend ${1:pck_nome};\n/'],
  ['trg', 'create or replace trigger', 'create or replace trigger ${1:trg_nome}\n  ${2|before,after|} ${3|insert,update,delete|} on ${4:tabela}\n  for each row\nbegin\n  --\n  ${0}\n  --\nend;\n/'],
  ['block', 'bloco anônimo declare/begin/end', 'declare\n  --\n  ${1}\n  --\nbegin\n  --\n  ${0}\n  --\nend;\n/'],
  ['exc', 'exception when others', 'exception\n  when ${1:others} then\n    --\n    ${0:raise;}\n    --'],
  ['forc', 'for r in cursor loop', 'for ${1:r_item} in ${2:c_itens} loop\n  --\n  ${0}\n  --\nend loop;'],
  ['fori', 'for i in 1..n loop', 'for ${1:i} in ${2:1}..${3:n} loop\n  --\n  ${0}\n  --\nend loop;'],
  ['if', 'if / then / end if', 'if (${1:condicao}) then\n  --\n  ${0}\n  --\nend if;'],
  ['case', 'case when', 'case\n  when ${1:condicao} then ${2:valor}\n  else ${0:valor}\nend'],
  ['cur', 'cursor declarado', 'cursor ${1:c_nome} is\n  select ${2:t.coluna}\n    from ${3:tabela} t\n   where ${0:1 = 1};'],
  ['ofc', 'open / fetch / close', 'open  ${1:c_nome};\nfetch ${1:c_nome} into ${2:r_nome};\nclose ${1:c_nome};'],
  ['bulk', 'bulk collect + forall', 'select ${1:*}\n  bulk collect into ${2:v_tab}\n  from ${3:tabela};\n--\nforall i in 1..${2:v_tab}.count\n  ${0}'],
  ['dbms', 'dbms_output.put_line', "dbms_output.put_line(${0:'texto'});"],
  ['rae', 'raise_application_error', "raise_application_error(-20${1:001}, '${0:mensagem}');"],
  ['merge', 'merge into', 'merge into ${1:destino} d\nusing ${2:origem} o\n   on (d.${3:id} = o.${3:id})\n when matched then\n   update set d.${4:col} = o.${4:col}\n when not matched then\n   insert (${5:cols}) values (${0:valores});'],
]

type KeywordCase = 'lower' | 'upper'

/** Aplica a caixa escolhida às palavras-chave de um trecho (fora de textos entre aspas). */
export function applyKeywordCase(text: string, keywords: Set<string>, kase: KeywordCase) {
  return text.replace(/'(?:[^']|'')*'|[a-zA-Z_][\w#]*/g, (m) => {
    if (m.startsWith("'") || !keywords.has(m.toUpperCase())) return m
    return kase === 'upper' ? m.toUpperCase() : m.toLowerCase()
  })
}

export const PLSQL_EXTENSIONS = ['sql', 'pls', 'plsql', 'pks', 'pkb', 'pck', 'prc', 'fnc', 'trg', 'tps', 'tpb', 'vw', 'ddl', 'dml']

export function registerPlsql(monaco: typeof Monaco, keywordCase: () => KeywordCase = () => 'lower') {
  monaco.languages.register({ id: 'plsql', extensions: PLSQL_EXTENSIONS.map((e) => '.' + e), aliases: ['PL/SQL', 'plsql'] })
  monaco.languages.setMonarchTokensProvider('plsql', language)
  monaco.languages.setLanguageConfiguration('plsql', configuration)

  const keywordSet = new Set([...keywords, ...types, ...builtins])
  monaco.languages.registerCompletionItemProvider('plsql', {
    triggerCharacters: ['.'],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
      const K = monaco.languages.CompletionItemKind
      // "registro." → colunas do cursor do registro; outro "algo." não recebe palavras-chave.
      const before = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1)
      const qualifier = /([a-zA-Z_][\w$#]*)\.$/.exec(before)?.[1]
      if (qualifier) {
        const cols = recordColumns(model.getValue(), qualifier) ?? []
        return { suggestions: cols.map((c) => ({ label: c, kind: K.Field, insertText: c, range })) }
      }
      const kase = keywordCase()
      const cased = (w: string) => (kase === 'upper' ? w.toUpperCase() : w.toLowerCase())
      const words = (list: string[], kind: Monaco.languages.CompletionItemKind) =>
        list.map((w) => ({ label: cased(w), kind, insertText: cased(w), range }))
      return {
        suggestions: [
          ...snippets.map(([label, doc, raw]) => {
            const body = applyKeywordCase(raw, keywordSet, kase)
            return {
              label,
              kind: K.Snippet,
              detail: doc,
              documentation: body.replace(/\$\{\d+:?([^}]*)\}/g, '$1'),
              insertText: body,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range,
            }
          }),
          ...words(keywords, K.Keyword),
          ...words(types, K.TypeParameter),
          ...words(builtins, K.Function),
        ],
      }
    },
  })

  monaco.languages.registerDocumentFormattingEditProvider('plsql', {
    provideDocumentFormattingEdits(model, options) {
      const indent = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t'
      const text = formatPlsql(model.getValue(), { indent, keywords: keywordSet, keywordCase: keywordCase(), separators: true })
      return [{ range: model.getFullModelRange(), text }]
    },
  })
}
