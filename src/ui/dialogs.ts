import { create } from 'zustand'

/**
 * Diálogos da Batide (no lugar de prompt/confirm do navegador): uma fila de pedidos,
 * mostrada pelo componente <DialogHost />. Cada chamada devolve uma Promise.
 */

export interface Choice {
  id: string
  label: string
  danger?: boolean
}

interface Base {
  title: string
  message?: string
}

export interface ConfirmOptions extends Base {
  confirmLabel?: string
  danger?: boolean
}

export interface PromptOptions extends Base {
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
}

export interface ChooseOptions extends Base {
  choices: Choice[]
}

export type DialogRequest =
  | ({ kind: 'confirm' } & ConfirmOptions)
  | ({ kind: 'prompt' } & PromptOptions)
  | ({ kind: 'choose' } & ChooseOptions)

type Queued = DialogRequest & { id: number; resolve: (value: unknown) => void }

interface DialogState {
  queue: Queued[]
  /** Responde o diálogo da frente da fila (null/false = cancelar). */
  respond: (value: unknown) => void
}

export const useDialogs = create<DialogState>()((set, get) => ({
  queue: [],
  respond(value) {
    const [current, ...rest] = get().queue
    if (!current) return
    set({ queue: rest })
    current.resolve(value)
  },
}))

let nextId = 1
function enqueue<T>(req: DialogRequest, normalize: (v: unknown) => T): Promise<T> {
  return new Promise((resolve) => {
    const item = { ...req, id: nextId++, resolve: (v: unknown) => resolve(normalize(v)) } as Queued
    useDialogs.setState((s) => ({ queue: [...s.queue, item] }))
  })
}

export const dialogs = {
  confirm: (opts: ConfirmOptions) => enqueue({ kind: 'confirm', ...opts }, (v) => v === true),
  prompt: (opts: PromptOptions) =>
    enqueue({ kind: 'prompt', ...opts }, (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)),
  choose: <T extends string>(opts: ChooseOptions & { choices: (Choice & { id: T })[] }) =>
    enqueue({ kind: 'choose', ...opts }, (v) => (typeof v === 'string' ? (v as T) : null)),
}
