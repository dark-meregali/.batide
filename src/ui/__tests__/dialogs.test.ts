import { beforeEach, describe, expect, it } from 'vitest'
import { dialogs, useDialogs } from '../dialogs'

const head = () => useDialogs.getState().queue[0]
const respond = (v: unknown) => useDialogs.getState().respond(v)

beforeEach(() => useDialogs.setState({ queue: [] }))

describe('dialogs', () => {
  it('confirm resolve true ao confirmar e false ao cancelar', async () => {
    const yes = dialogs.confirm({ title: 'Apagar?', danger: true })
    expect(head()).toMatchObject({ kind: 'confirm', title: 'Apagar?', danger: true })
    respond(true)
    expect(await yes).toBe(true)

    const no = dialogs.confirm({ title: 'Apagar?' })
    respond(false)
    expect(await no).toBe(false)
    expect(useDialogs.getState().queue).toEqual([])
  })

  it('prompt devolve o texto digitado, sem espaços nas pontas, ou null', async () => {
    const p = dialogs.prompt({ title: 'Nome', defaultValue: 'x' })
    expect(head()).toMatchObject({ kind: 'prompt', defaultValue: 'x' })
    respond('  meu-projeto  ')
    expect(await p).toBe('meu-projeto')

    const empty = dialogs.prompt({ title: 'Nome' })
    respond('   ')
    expect(await empty).toBeNull()

    const cancelled = dialogs.prompt({ title: 'Nome' })
    respond(null)
    expect(await cancelled).toBeNull()
  })

  it('choose devolve o id da opção escolhida, ou null ao cancelar', async () => {
    const c = dialogs.choose({
      title: 'Salvar?',
      choices: [
        { id: 'save', label: 'Salvar' },
        { id: 'discard', label: 'Descartar', danger: true },
      ],
    })
    expect(head()).toMatchObject({ kind: 'choose', choices: [{ id: 'save' }, { id: 'discard', danger: true }] })
    respond('discard')
    expect(await c).toBe('discard')

    const cancel = dialogs.choose({ title: 'x', choices: [{ id: 'a', label: 'A' }] })
    respond(null)
    expect(await cancel).toBeNull()
  })

  it('enfileira: o segundo diálogo só aparece depois do primeiro ser respondido', async () => {
    const first = dialogs.confirm({ title: 'Primeiro' })
    const second = dialogs.confirm({ title: 'Segundo' })
    expect(head().title).toBe('Primeiro')
    respond(true)
    expect(head().title).toBe('Segundo')
    respond(false)
    expect([await first, await second]).toEqual([true, false])
  })
})
