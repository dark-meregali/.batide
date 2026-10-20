import { useEffect, useRef, useState } from 'react'
import { useDialogs } from '../ui/dialogs'
import { useT } from '../i18n'

/** Mostra o diálogo da frente da fila. Foco preso dentro, Esc cancela, Enter confirma. */
export function DialogHost() {
  const current = useDialogs((s) => s.queue[0])
  if (!current) return null
  return <DialogView key={current.id} />
}

function DialogView() {
  const t = useT()
  const req = useDialogs((s) => s.queue[0])!
  const respond = useDialogs((s) => s.respond)
  const box = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState(req.kind === 'prompt' ? (req.defaultValue ?? '') : '')

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    // Ação perigosa começa no "Cancelar"; o resto, no campo ou no botão principal.
    const target =
      box.current!.querySelector<HTMLElement>('input') ??
      box.current!.querySelector<HTMLElement>(req.kind === 'confirm' && req.danger ? '[data-cancel]' : '[data-primary]')
    target?.focus()
    if (target instanceof HTMLInputElement) target.select()
    // Devolve o foco só depois que a tecla atual terminar: senão o Enter que confirmou
    // "clica" o botão que recebe o foco (e reabriria o diálogo).
    return () => {
      requestAnimationFrame(() => {
        const free = !document.activeElement || document.activeElement === document.body
        if (free && previous?.isConnected) previous.focus()
      })
    }
  }, [req])

  const cancel = () => respond(req.kind === 'confirm' ? false : null)

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    } else if (e.key === 'Tab') {
      // Mantém o foco dentro do diálogo.
      const items = [...box.current!.querySelectorAll<HTMLElement>('input, button')]
      const i = items.indexOf(document.activeElement as HTMLElement)
      const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : i === items.length - 1 ? 0 : i + 1
      e.preventDefault()
      items[next]?.focus()
    }
  }

  return (
    <div className="overlay dialog-overlay" onMouseDown={(e) => e.target === e.currentTarget && cancel()}>
      <div
        ref={box}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onKeyDown={onKeyDown}
      >
        <h2 id="dialog-title" className="dialog-title">{req.title}</h2>
        {req.message && <p className="dialog-message">{req.message}</p>}
        {req.kind === 'prompt' && (
          <input
            className="dialog-input"
            value={value}
            placeholder={req.placeholder}
            spellCheck={false}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              respond(value)
            }}
          />
        )}
        <div className="dialog-actions">
          <button className="btn-secondary small" data-cancel onClick={cancel}>
            {t('dialog.cancel')}
          </button>
          {req.kind === 'confirm' && (
            <button className={'btn-primary small' + (req.danger ? ' danger' : '')} data-primary onClick={() => respond(true)}>
              {req.confirmLabel ?? t('dialog.ok')}
            </button>
          )}
          {req.kind === 'prompt' && (
            <button className="btn-primary small" data-primary disabled={!value.trim()} onClick={() => respond(value)}>
              {req.confirmLabel ?? t('dialog.ok')}
            </button>
          )}
          {req.kind === 'choose' &&
            req.choices.map((c, i) => (
              <button
                key={c.id}
                className={(i === 0 ? 'btn-primary' : 'btn-secondary') + ' small' + (c.danger ? ' danger' : '')}
                data-primary={i === 0 ? '' : undefined}
                onClick={() => respond(c.id)}
              >
                {c.label}
              </button>
            ))
            // A opção principal fica à direita, como nos diálogos do sistema.
            .reverse()}
        </div>
      </div>
    </div>
  )
}
