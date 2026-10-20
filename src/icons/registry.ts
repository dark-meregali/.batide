// Carregado sob demanda: o mapeamento (~350 kB) e as URLs dos ícones não pesam na abertura da IDE.
import { file, folder, folderExpanded, fileExtensions, fileNames, folderNames, folderNamesExpanded } from 'material-icon-theme/dist/material-icons.json'
import { buildIconIndex, iconName } from './fileIcons'

const urls = import.meta.glob<string>('/node_modules/material-icon-theme/icons/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
})
const urlByName = new Map(Object.entries(urls).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url]))

const index = buildIconIndex({ file, folder, folderExpanded, fileExtensions, fileNames, folderNames, folderNamesExpanded })

export function resolveIcon(name: string, kind: 'file' | 'dir', open = false) {
  const icon = iconName(index, name, kind, open)
  return { icon, url: urlByName.get(icon) ?? urlByName.get(kind === 'dir' ? folder : file)! }
}
