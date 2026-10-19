/** Aceita "owner/repo" e URLs https do GitHub (com ou sem .git) e devolve a URL de clone. */
export function normalizeRepoUrl(input: string): string | null {
  const s = input.trim()
  if (/^[\w.-]+\/[\w.-]+$/.test(s)) return `https://github.com/${s}.git`
  const m = /^(?:https?:\/\/)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(s)
  return m ? `https://github.com/${m[1]}/${m[2]}.git` : null
}
