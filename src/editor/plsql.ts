import type * as Monaco from 'monaco-editor'
import { formatPlsql } from './plsqlFormat'

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

const snippets: [label: string, doc: string, body: string][] = [
  ['proc', 'CREATE OR REPLACE PROCEDURE', 'CREATE OR REPLACE PROCEDURE ${1:nome} (\n  ${2:p_param} IN ${3:VARCHAR2}\n) IS\nBEGIN\n  ${0:NULL;}\nEND ${1:nome};\n/'],
  ['func', 'CREATE OR REPLACE FUNCTION', 'CREATE OR REPLACE FUNCTION ${1:nome} (\n  ${2:p_param} IN ${3:VARCHAR2}\n) RETURN ${4:NUMBER} IS\n  v_result ${4:NUMBER};\nBEGIN\n  ${0}\n  RETURN v_result;\nEND ${1:nome};\n/'],
  ['pks', 'CREATE OR REPLACE PACKAGE (spec)', 'CREATE OR REPLACE PACKAGE ${1:pkg_nome} AS\n  ${0}\nEND ${1:pkg_nome};\n/'],
  ['pkb', 'CREATE OR REPLACE PACKAGE BODY', 'CREATE OR REPLACE PACKAGE BODY ${1:pkg_nome} AS\n  ${0}\nEND ${1:pkg_nome};\n/'],
  ['trg', 'CREATE OR REPLACE TRIGGER', 'CREATE OR REPLACE TRIGGER ${1:trg_nome}\n  ${2|BEFORE,AFTER|} ${3|INSERT,UPDATE,DELETE|} ON ${4:tabela}\n  FOR EACH ROW\nBEGIN\n  ${0}\nEND;\n/'],
  ['block', 'Bloco anônimo DECLARE/BEGIN/END', 'DECLARE\n  ${1}\nBEGIN\n  ${0}\nEND;\n/'],
  ['exc', 'EXCEPTION WHEN', 'EXCEPTION\n  WHEN ${1:NO_DATA_FOUND} THEN\n    ${2:NULL;}\n  WHEN OTHERS THEN\n    ${0:RAISE;}'],
  ['forc', 'FOR rec IN (cursor) LOOP', 'FOR ${1:r} IN (\n  SELECT ${2:*}\n    FROM ${3:tabela}\n) LOOP\n  ${0}\nEND LOOP;'],
  ['fori', 'FOR i IN 1..n LOOP', 'FOR ${1:i} IN ${2:1}..${3:n} LOOP\n  ${0}\nEND LOOP;'],
  ['if', 'IF / THEN / END IF', 'IF ${1:condicao} THEN\n  ${0}\nEND IF;'],
  ['case', 'CASE WHEN', 'CASE\n  WHEN ${1:condicao} THEN ${2:valor}\n  ELSE ${0:valor}\nEND'],
  ['cur', 'CURSOR declarado', 'CURSOR ${1:c_nome} IS\n  SELECT ${2:*}\n    FROM ${3:tabela};'],
  ['bulk', 'BULK COLLECT + FORALL', 'SELECT ${1:*}\n  BULK COLLECT INTO ${2:v_tab}\n  FROM ${3:tabela};\n\nFORALL i IN 1..${2:v_tab}.COUNT\n  ${0}'],
  ['dbms', 'DBMS_OUTPUT.PUT_LINE', "DBMS_OUTPUT.PUT_LINE(${0:'texto'});"],
  ['rae', 'RAISE_APPLICATION_ERROR', "RAISE_APPLICATION_ERROR(-20${1:001}, '${0:mensagem}');"],
  ['merge', 'MERGE INTO', 'MERGE INTO ${1:destino} d\nUSING ${2:origem} o\n   ON (d.${3:id} = o.${3:id})\n WHEN MATCHED THEN\n   UPDATE SET d.${4:col} = o.${4:col}\n WHEN NOT MATCHED THEN\n   INSERT (${5:cols}) VALUES (${0:valores});'],
]

export const PLSQL_EXTENSIONS = ['sql', 'pls', 'plsql', 'pks', 'pkb', 'pck', 'prc', 'fnc', 'trg', 'tps', 'tpb', 'vw', 'ddl', 'dml']

export function registerPlsql(monaco: typeof Monaco) {
  monaco.languages.register({ id: 'plsql', extensions: PLSQL_EXTENSIONS.map((e) => '.' + e), aliases: ['PL/SQL', 'plsql'] })
  monaco.languages.setMonarchTokensProvider('plsql', language)
  monaco.languages.setLanguageConfiguration('plsql', configuration)

  monaco.languages.registerCompletionItemProvider('plsql', {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
      const K = monaco.languages.CompletionItemKind
      const words = (list: string[], kind: Monaco.languages.CompletionItemKind) =>
        list.map((w) => ({ label: w, kind, insertText: w, range }))
      return {
        suggestions: [
          ...snippets.map(([label, doc, body]) => ({
            label,
            kind: K.Snippet,
            detail: doc,
            documentation: body.replace(/\$\{\d+:?([^}]*)\}/g, '$1'),
            insertText: body,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
          })),
          ...words(keywords, K.Keyword),
          ...words(types, K.TypeParameter),
          ...words(builtins, K.Function),
        ],
      }
    },
  })

  const upperWords = new Set([...keywords, ...types, ...builtins])
  monaco.languages.registerDocumentFormattingEditProvider('plsql', {
    provideDocumentFormattingEdits(model, options) {
      const indent = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t'
      const text = formatPlsql(model.getValue(), { indent, upperWords })
      return [{ range: model.getFullModelRange(), text }]
    },
  })
}
