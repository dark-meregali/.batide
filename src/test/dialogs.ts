import { useDialogs, type DialogRequest } from '../ui/dialogs'

/**
 * Responde os diálogos da Batide na ordem dada (true/false, texto, id da opção, ou null
 * para cancelar). Sem respostas sobrando, cancela. Guarda os pedidos em `asked`.
 */
export function answerDialogs(...answers: unknown[]) {
  const asked: DialogRequest[] = []
  const handle = () => {
    const head = useDialogs.getState().queue[0]
    if (!head) return
    asked.push(head)
    queueMicrotask(() => useDialogs.getState().respond(answers.length ? answers.shift() : null))
  }
  const unsubscribe = useDialogs.subscribe((s, prev) => {
    if (s.queue[0] && s.queue[0] !== prev.queue[0]) handle()
  })
  handle()
  return { asked, unsubscribe }
}
