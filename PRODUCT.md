# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Também será empacotada como app desktop com Tauri — mesmo código web, com terminal real e acesso direto a arquivos. Planejado para a fase 3.)

## Users

Desenvolvedores em geral (produto público). O usuário de referência, e primeiro usuário, é o autor: trabalha com PL/SQL/Oracle e com front-end web (JS/TS/React/HTML/CSS) e passa sessões longas, de horas seguidas, programando. A IDE precisa ser autoexplicativa para quem a abre pela primeira vez, sem tutorial.

## Product Purpose

Uma IDE no estilo do VS Code, só que mais leve, mais rápida e mais bonita, que funciona no navegador e no PC sem internet, e puxa repositórios direto do GitHub. Sucesso: abrir na hora, editar com conforto por horas e ir do clone ao push sem sair dela.

## Positioning

- Roda inteira no navegador (PWA instalável e offline) e, com o mesmo código, como app desktop.
- Git e GitHub embutidos no navegador: login OAuth, clone, commit, push, pull, branches e diff, sem instalar git.
- PL/SQL tratado como linguagem de primeira classe: destaque, snippets e um formatador próprio que respeita blocos de package/procedure (formatadores SQL genéricos destroem esse código).
- Zero configuração: tudo vem pronto, sem caçar extensões.

## Operating Context

- Navegador (Chrome/Edge para abrir pastas locais) ou app desktop; uso offline depois do primeiro acesso.
- Projetos ficam no navegador (IndexedDB) ou em pastas do computador.
- Login via GitHub OAuth, intermediado por um Cloudflare Worker (`worker/`), ou por token pessoal.
- Interface em português e inglês.

## Capabilities and Constraints

- Editor Monaco (mesmo motor do VS Code); IntelliSense para JS/TS/HTML/CSS/JSON.
- Explorador de arquivos, abas, barra de status, configurações, controle de versão, seletor rápido (estilo paleta do VS Code).
- Fonte do editor: JetBrains Mono com ligaduras; nomes de função e comentários em itálico cursivo (Victor Mono, mesma largura).
- Ícones de arquivo e pasta do Material Icon Theme.
- Sem conexão com banco Oracle (só edição de arquivos), por decisão do usuário.
- Terminal integrado só no app desktop (fase 3).
- Planejado: pull requests, paleta de comandos, busca nos arquivos (fase 4).
- Desenvolvido com TDD (Vitest + Playwright).

## Brand Commitments

- Nome: **Batide**.
- Visual escuro e minimalista, no espírito de Zed/Linear: pouco ruído, foco no código. (Escolha explícita do usuário.)
- Ícone/logo atual em `public/icon.svg` (símbolo `</>` com gradiente violeta → turquesa).

## Evidence on Hand

Nenhum depoimento, cliente, métrica ou benchmark. Não inventar.

## Product Principles

1. O código é o protagonista: a interface recua e nunca disputa atenção com o editor.
2. Rapidez percebida: abrir na hora, carregar o pesado só quando precisa.
3. Conforto para horas de uso: contraste confortável, sem ruído, sem animação gratuita.
4. Familiar para quem vem do VS Code: atalhos e padrões conhecidos ganham o lugar.
5. Funciona offline e sem instalar nada.

## Accessibility & Inclusion

Sem requisito específico além de boas práticas: contraste WCAG AA, navegação por teclado, foco visível e respeito a "reduzir movimento".
