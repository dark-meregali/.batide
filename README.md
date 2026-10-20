# Batide

IDE leve e rápida, no estilo do VS Code, que roda **no navegador** e **no desktop sem internet**.

## Status

| Fase | O quê | Status |
| --- | --- | --- |
| 1 | Base: explorador, abas, editor Monaco, PL/SQL, PT/EN, PWA offline | ✅ |
| 2 | GitHub: login OAuth, clonar, commit, push, pull, branches, diff | ✅ |
| 3 | App desktop (Tauri) com terminal integrado | ✅ |
| 4 | Pull requests, paleta de comandos, busca nos arquivos | ⏳ |

## Recursos

- **Editor Monaco** (o mesmo do VS Code), com IntelliSense para JS/TS/HTML/CSS/JSON.
- **PL/SQL no padrão da equipe**: minúsculas (ou MAIÚSCULAS, em Configurações → Palavras-chave PL/SQL), 2 espaços, `--` abrindo/fechando blocos e entre comandos.
  O **Enter** monta o bloco (`if (…) then` → `--`, cursor, `--`, `end if;`), separa comandos com `--` e
  reposiciona `begin`/`exception`; **Shift+Enter** é a quebra comum (para agrupar `open`/`fetch`/`close`).
  Snippets (`proc`, `func`, `pkb`, `trg`, `if`, `forc`, `ofc`, `exc`, `merge`…) e formatador (`Shift+Alt+F`) no mesmo padrão.
- **Projetos no navegador**, salvos no IndexedDB, ou **pastas do computador** (Chrome/Edge).
- **Funciona offline**: instale como app pelo navegador (PWA). Nada é carregado de CDN.
- Interface em **português e inglês**.
- **GitHub**: login (OAuth ou token pessoal), lista e clone dos seus repositórios, commit, push, pull,
  troca/criação de branches, diff lado a lado e descarte de alterações (`Ctrl+Shift+G`).

## App desktop

O mesmo código roda como app nativo (Tauri 2), sem internet:

- **Pastas do computador** em qualquer sistema, pelo seletor nativo, com lista de pastas recentes.
- **Terminal integrado** (bash/zsh/PowerShell) na pasta do projeto: `` Ctrl+` `` ou o botão *Terminal* na barra de status.
- Git em pastas do computador pelo terminal (`git status`, `git commit`…).

**Instaladores:** em *Actions → Desktop (instaladores) → Run workflow* (Windows `.msi`/`.exe`, macOS `.dmg`,
Linux `.deb`/`.AppImage`), ou criando uma tag `v*` (vira um rascunho de release com os instaladores).

**Desenvolvimento:** `npm run tauri dev` (precisa de Rust; no Linux também das bibliotecas do WebKitGTK).
Testes do Rust: `cargo test --manifest-path src-tauri/Cargo.toml --lib`.

## Atalhos

| Ação | Atalho |
| --- | --- |
| Salvar | `Ctrl+S` |
| Formatar documento | `Shift+Alt+F` |
| Fechar aba | `Alt+W` |
| Mostrar/ocultar barra lateral | `Ctrl+B` |
| Comandos do editor | `F1` |
| Terminal (desktop) | `` Ctrl+` `` |
| Tab move o foco (sair do editor pelo teclado) | `Ctrl+M` |
| Renomear / excluir no explorador | `F2` / `Del` |

## Desenvolvimento

O projeto é feito com **TDD**: todo comportamento novo começa por um teste que falha.

```bash
npm install
npm run dev        # servidor de desenvolvimento
npm test           # testes unitários (Vitest)
npm run test:e2e   # testes de interface (Playwright) com um servidor git falso local
npm run build      # build de produção em dist/
```

Para testar login/clone de verdade localmente: `GITHUB_CLIENT_SECRET=... node scripts/dev-proxy.mjs`
e configure `http://localhost:8787` em *Configurações → GitHub → Servidor*.

## Servidor de login (Cloudflare Worker)

O navegador precisa de um intermediário para duas coisas: trocar o código do login OAuth por um token
(usando o *client secret*, que não pode ficar no navegador) e falar o protocolo do git com o github.com
(que não permite CORS). O código está em `worker/`.

```bash
cd worker
npx wrangler login
npx wrangler secret put GITHUB_CLIENT_SECRET   # cole o client secret do OAuth App
npx wrangler deploy                            # mostra a URL: https://batide-auth.<você>.workers.dev
```

O Worker oficial já está publicado em `https://batide-auth.nhrk9bmtbk.workers.dev` e é o padrão da IDE.
Para usar outro, troque em *Configurações → GitHub → Servidor* (ou na variável `VITE_PROXY_URL` do build).

Cada push na `main` publica a versão web no GitHub Pages
(ative em *Settings → Pages → Source: GitHub Actions*).

## Arquitetura

- `src/fs/` — sistemas de arquivos com a mesma interface (`FsProvider`): navegador (LightningFS/IndexedDB,
  compartilhado com o git na fase 2) e pasta local (File System Access API). O Tauri entra aqui na fase 3.
- `src/editor/` — configuração do Monaco (workers locais, tema, linguagens) e suporte a PL/SQL.
- `src/git/` — operações git (isomorphic-git) sobre o sistema de arquivos do navegador.
- `src/github/` — login OAuth, API do GitHub.
- `src/store/` — estado global (Zustand): projeto aberto, árvore, abas, git, configurações.
- `worker/` — Cloudflare Worker (login + proxy do git).
- `src-tauri/` — app desktop em Rust: `workspace.rs` (arquivos, sem sair da pasta do projeto), `terminal.rs`
  (pseudoterminal), `lib.rs` (comandos expostos à interface).
- `e2e/` — testes de interface; `e2e/fixtures.ts` simula o GitHub com um repositório git local.
- `src/components/` — interface. O editor é carregado sob demanda para a IDE abrir instantaneamente.
