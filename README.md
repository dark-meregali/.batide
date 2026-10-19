# Batide

IDE leve e rápida, no estilo do VS Code, que roda **no navegador** e **no desktop sem internet**.

## Status

| Fase | O quê | Status |
| --- | --- | --- |
| 1 | Base: explorador, abas, editor Monaco, PL/SQL, PT/EN, PWA offline | ✅ |
| 2 | GitHub: login OAuth, clonar, commit, push, branches, diff | ⏳ |
| 3 | App desktop (Tauri) com terminal integrado | ⏳ |
| 4 | Pull requests, paleta de comandos, busca nos arquivos | ⏳ |

## Recursos

- **Editor Monaco** (o mesmo do VS Code), com IntelliSense para JS/TS/HTML/CSS/JSON.
- **PL/SQL**: destaque de sintaxe, autocompletar, snippets (`proc`, `func`, `pkb`, `trg`, `forc`, `exc`, `merge`…)
  e formatador próprio (`Shift+Alt+F`) que reindenta blocos e põe palavras-chave em maiúsculas.
- **Projetos no navegador**, salvos no IndexedDB, ou **pastas do computador** (Chrome/Edge).
- **Funciona offline**: instale como app pelo navegador (PWA). Nada é carregado de CDN.
- Interface em **português e inglês**.

## Atalhos

| Ação | Atalho |
| --- | --- |
| Salvar | `Ctrl+S` |
| Formatar documento | `Shift+Alt+F` |
| Fechar aba | `Alt+W` |
| Mostrar/ocultar barra lateral | `Ctrl+B` |
| Comandos do editor | `F1` |
| Renomear / excluir no explorador | `F2` / `Del` |

## Desenvolvimento

```bash
npm install
npm run dev      # servidor de desenvolvimento
npm test         # testes
npm run build    # build de produção em dist/
```

Cada push na `main` publica a versão web no GitHub Pages
(ative em *Settings → Pages → Source: GitHub Actions*).

## Arquitetura

- `src/fs/` — sistemas de arquivos com a mesma interface (`FsProvider`): navegador (LightningFS/IndexedDB,
  compartilhado com o git na fase 2) e pasta local (File System Access API). O Tauri entra aqui na fase 3.
- `src/editor/` — configuração do Monaco (workers locais, tema, linguagens) e suporte a PL/SQL.
- `src/store/` — estado global (Zustand): projeto aberto, árvore, abas, configurações.
- `src/components/` — interface. O editor é carregado sob demanda para a IDE abrir instantaneamente.
