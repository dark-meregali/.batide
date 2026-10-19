import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export interface PickItem {
  id: string
  label: string
  detail?: string
  icon?: ReactNode
  /** Texto à direita, ex.: "privado", "remoto". */
  badge?: string
}

interface Props {
  placeholder: string
  items: PickItem[]
  loading?: boolean
  emptyText?: string
  /** Item extra que aparece no topo usando o texto digitado (ex.: "Criar branch 'x'"). */
  createItem?: (query: string) => PickItem | null
  onPick: (item: PickItem, query: string) => void
  onClose: () => void
  footer?: ReactNode
}

/** Lista com busca no topo da tela, no estilo da paleta do VS Code. */
export function QuickPick({ placeholder, items, loading, emptyText, createItem, onPick, onClose, footer }: Props) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? items.filter((i) => i.label.toLowerCase().includes(q) || i.detail?.toLowerCase().includes(q))
      : items
    const extra = createItem?.(query.trim())
    return extra ? [extra, ...filtered] : filtered
  }, [items, query, createItem])

  useEffect(() => setIndex(0), [query])
  useEffect(() => {
    listRef.current?.children[index]?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') setIndex((i) => Math.min(i + 1, visible.length - 1))
    else if (e.key === 'ArrowUp') setIndex((i) => Math.max(i - 1, 0))
    else if (e.key === 'Enter' && visible[index]) onPick(visible[index], query.trim())
    else if (e.key === 'Escape') onClose()
    else return
    e.preventDefault()
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="quick-pick" onKeyDown={onKeyDown}>
        <input autoFocus placeholder={placeholder} value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="quick-list" ref={listRef}>
          {loading && <div className="quick-empty">…</div>}
          {!loading && visible.length === 0 && <div className="quick-empty">{emptyText}</div>}
          {!loading &&
            visible.map((item, i) => (
              <button
                key={item.id}
                className={'quick-item' + (i === index ? ' active' : '')}
                onMouseMove={() => setIndex(i)}
                onClick={() => onPick(item, query.trim())}
              >
                {item.icon}
                <span className="quick-label">{item.label}</span>
                {item.detail && <span className="quick-detail">{item.detail}</span>}
                {item.badge && <span className="quick-badge">{item.badge}</span>}
              </button>
            ))}
        </div>
        {footer && <div className="quick-footer">{footer}</div>}
      </div>
    </div>
  )
}
