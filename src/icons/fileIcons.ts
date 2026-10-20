/**
 * Escolha de ícones de arquivo e pasta com o mapeamento do Material Icon Theme (o mesmo
 * tema de ícones popular no VS Code). Função pura: recebe o índice e devolve o nome do ícone.
 */

export interface IconManifest {
  file: string
  folder: string
  folderExpanded: string
  fileExtensions: Record<string, string>
  fileNames: Record<string, string>
  folderNames: Record<string, string>
  folderNamesExpanded: Record<string, string>
}

export type IconIndex = IconManifest

// Extensões PL/SQL que o tema não conhece (ele só mapeia .sql/.pks/.pkb).
const EXTRA_EXTENSIONS: Record<string, string> = Object.fromEntries(
  ['sql', 'pls', 'plsql', 'pks', 'pkb', 'pck', 'prc', 'fnc', 'trg', 'tps', 'tpb', 'vw', 'ddl', 'dml'].map((e) => [e, 'database']),
)

const lowerKeys = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v]))

export function buildIconIndex(m: IconManifest): IconIndex {
  return {
    file: m.file,
    folder: m.folder,
    folderExpanded: m.folderExpanded,
    fileExtensions: { ...lowerKeys(m.fileExtensions), ...EXTRA_EXTENSIONS },
    fileNames: lowerKeys(m.fileNames),
    folderNames: lowerKeys(m.folderNames),
    folderNamesExpanded: lowerKeys(m.folderNamesExpanded),
  }
}

export function iconName(index: IconIndex, name: string, kind: 'file' | 'dir', open = false): string {
  const lower = name.toLowerCase()
  if (kind === 'dir') {
    return (open ? index.folderNamesExpanded[lower] : index.folderNames[lower]) ?? (open ? index.folderExpanded : index.folder)
  }
  const byName = index.fileNames[lower]
  if (byName) return byName
  // Da extensão mais longa para a mais curta: "a.test.ts" tenta "test.ts" e depois "ts".
  for (let i = lower.indexOf('.'); i >= 0; i = lower.indexOf('.', i + 1)) {
    const icon = index.fileExtensions[lower.slice(i + 1)]
    if (icon) return icon
  }
  return index.file
}
