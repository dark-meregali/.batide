import { describe, expect, it } from 'vitest'
import manifest from 'material-icon-theme/dist/material-icons.json'
import { iconName, buildIconIndex } from '../fileIcons'

const index = buildIconIndex(manifest)
const file = (name: string) => iconName(index, name, 'file')
const folder = (name: string, open = false) => iconName(index, name, 'dir', open)

describe('ícones de arquivo', () => {
  it.each([
    ['App.tsx', 'react_ts'],
    ['main.ts', 'typescript'],
    ['index.js', 'javascript'],
    ['styles.css', 'css'],
    ['index.html', 'html'],
    ['README.md', 'readme'],
    ['notas.md', 'markdown'],
    ['package.json', 'nodejs'],
    ['tsconfig.json', 'tsconfig'],
    ['vite.config.ts', 'vite'],
    ['.gitignore', 'git'],
    ['Dockerfile', 'docker'],
    ['dados.json', 'json'],
    ['logo.svg', 'svg'],
  ])('%s → %s', (name, icon) => {
    expect(file(name)).toBe(icon)
  })

  it('prefere a extensão mais longa (x.test.ts é teste, não TypeScript)', () => {
    expect(file('git.test.ts')).toBe('test-ts')
    expect(file('tipos.d.ts')).toBe('typescript-def')
  })

  it('ignora maiúsculas/minúsculas', () => {
    expect(file('PACKAGE.JSON')).toBe('nodejs')
    expect(file('APP.TSX')).toBe('react_ts')
  })

  it.each(['pkg.sql', 'pkg_vendas.pkb', 'pkg_vendas.pks', 'x.pls', 'x.plsql', 'p.prc', 'f.fnc', 't.trg', 'p.pck'])(
    'arquivos PL/SQL (%s) usam o ícone de banco de dados',
    (name) => {
      expect(file(name)).toBe('database')
    },
  )

  it('arquivo desconhecido usa o ícone genérico', () => {
    expect(file('coisa.xyzabc')).toBe('file')
    expect(file('SEMEXTENSAO')).toBe('file')
  })
})

describe('ícones de pasta', () => {
  it('usa o ícone específico da pasta, com versão aberta', () => {
    expect(folder('src')).toBe('folder-src')
    expect(folder('src', true)).toBe('folder-src-open')
    expect(folder('components')).toBe('folder-components')
    expect(folder('.github')).toBe('folder-github')
    expect(folder('node_modules')).toBe('folder-node')
  })

  it('pasta desconhecida usa o ícone genérico, aberto ou fechado', () => {
    expect(folder('minhas-coisas')).toBe('folder')
    expect(folder('minhas-coisas', true)).toBe('folder-open')
  })

  it('ignora maiúsculas/minúsculas', () => {
    expect(folder('SRC')).toBe('folder-src')
  })
})

describe('buildIconIndex', () => {
  it('todo ícone apontado pelo índice existe nas definições', () => {
    const defined = new Set(Object.keys(manifest.iconDefinitions))
    for (const name of ['App.tsx', 'pkg.sql', 'src', 'x.test.ts']) {
      expect(defined.has(file(name))).toBe(true)
    }
    expect(defined.has(folder('src', true))).toBe(true)
  })
})
