import type { ChangeStatus } from '../git/git'

/** Cores das letras de status do git (M/A/U/D), dos tokens definidos em styles.css. */
export const GIT_STATUS_COLORS: Record<ChangeStatus, string> = {
  M: 'var(--git-modified)',
  A: 'var(--git-added)',
  U: 'var(--git-untracked)',
  D: 'var(--git-deleted)',
}
