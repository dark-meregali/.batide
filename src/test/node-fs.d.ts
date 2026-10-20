// Só o que os testes usam do Node (o projeto não inclui @types/node no app).
declare module 'node:fs' {
  export function readFileSync(path: URL | string, encoding: 'utf8'): string
}
