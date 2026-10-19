import { useEffect, useState } from 'react'

type Registry = typeof import('../icons/registry')
let registry: Registry | null = null
let loading: Promise<Registry> | null = null
const load = () => (loading ??= import('../icons/registry').then((m) => (registry = m)))

/** Ícone do arquivo/pasta (Material Icon Theme). Mostra um espaço vazio até o registro carregar. */
export function FileIcon({ name, kind, open = false }: { name: string; kind: 'file' | 'dir'; open?: boolean }) {
  const [, setReady] = useState(!!registry)
  useEffect(() => {
    if (!registry) load().then(() => setReady(true))
  }, [])
  if (!registry) return <span className="file-icon" />
  const { icon, url } = registry.resolveIcon(name, kind, open)
  return <img className="file-icon" data-icon={icon} src={url} alt="" draggable={false} />
}
