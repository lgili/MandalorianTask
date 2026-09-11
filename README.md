# Bancada

Registro de trabalho local-first: onde as horas foram, quais reuniões vieram da agenda,
e as notas de trabalho num vault markdown.

**Não é um app de produtividade — é um instrumento de medição.** Você não rastreia o tempo,
você confirma o dia que o app já montou.

## Estado

`v0.3` — Projetos, captura unificada, Quadro (kanban), Hoje (timeline), relatório da semana,
e **Notas**: um vault de markdown compatível com o Obsidian, com `[[links]]`, backlinks e busca.
Google Agenda segue para a v0.2.

## Como se registra

Uma superfície de criação só, chamável de qualquer tela com **`n`**. Na linha:

| token | faz |
|---|---|
| `#` | abre a lista de projetos — e a última linha dela **cria** o projeto que você digitou |
| `!` | prazo: `hoje` · `qui` · `12/09` · `+3d` |
| `@` | tipo: `reuniao` · `admin` |

`enter` grava · `ctrl+enter` grava e manda pra fila. Dentro de um projeto, estar na tela
**já é** a atribuição — a linha de captura nasce vinculada a ele.

Projeto novo pede só o nome. A cor sai sozinha da paleta (a menos usada entre os ativos),
porque perguntar cor no meio de uma reunião é a fricção que deixa o campo vazio para sempre.

## Rodar

Pré-requisitos: Node 20+, pnpm 9+, Rust estável (`rustup`), e as dependências nativas do Tauri 2
(Windows: WebView2 + Build Tools do VS; macOS: Xcode CLT).

```bash
pnpm install
pnpm dev            # vite + tauri dev
```

Windows (PowerShell):

```powershell
pnpm install
.\scripts\dev.ps1
```

## Build nativo

```bash
pnpm tauri icon app-icon.png   # uma vez, gera src-tauri/icons/
pnpm build                     # macOS: .app + .dmg   |   Windows: -setup.exe (NSIS)
```

CI: uma tag `v*` dispara `.github/workflows/build.yml`, que monta macOS e Windows e anexa
os instaladores ao Release.

## Notas

Um vault é uma pasta de arquivos `.md` — a mesma que o Obsidian abre. **O arquivo é a verdade**:
o SQLite guarda só um índice (tabelas `notes`, `notes_fts`, `note_links`) que dá para apagar e
refazer. Nada do que o app mostra sobre uma nota vem de outro lugar que não o próprio arquivo.

| no editor | faz |
|---|---|
| `[[` | lista as notas; o link pode apontar para nota que ainda não existe — clicar cria |
| `#tag` | vira pílula; clicar busca a tag |
| `- [ ]` | vira caixa clicável |
| `projeto: CÓDIGO` no frontmatter | liga a nota ao projeto — ela aparece na tela dele |

**Ctrl+K** busca em notas, projetos e tarefas ao mesmo tempo. **Ctrl+P** lista os comandos.

O editor é CodeMirror 6 em modo *live preview*: a sintaxe some fora da linha do cursor, mas o
texto no disco nunca é reescrito para exibir. Renomear uma nota reescreve os `[[links]]` que
apontavam para ela. Apagar move para `.trash/` dentro do vault, como o Obsidian.

## Onde os dados moram

| O quê | Onde |
|---|---|
| Banco | `%APPDATA%\com.lgili.bancada\bancada.db` · `~/Library/Application Support/com.lgili.bancada/bancada.db` |
| Notas | a pasta que você escolher — pode ser o vault do Obsidian. O caminho fica em `meta.vault_path` |
| Token do Google (v0.2) | arquivo `0600` no mesmo appdata — nunca em `localStorage` |

O banco é um arquivo. Backup é copiar o arquivo.

## Convenções

- **Nenhum componente escreve SQL.** Tudo passa por `src/lib/db.ts`, que é a única camada
  que fala com o banco — o mesmo papel que `lib/api.ts` tem no eBOM generator.
- **Nenhum componente toca arquivo.** Tudo passa por `src/lib/vault.ts`; e quem escreve nota
  passa por `src/lib/notas.ts`, que mantém disco, índice e evento andando juntos. Em
  `dev:mock` os dois (`db` e `vault`) viram versões em memória pelo mesmo alias do Vite.
- **Nenhum componente faz regex sobre markdown.** Frontmatter, título, links e tags saem de
  `src/lib/markdown.ts`, que é testado — inclusive contra link dentro de bloco de código.
- **Nenhum componente faz aritmética de data.** Tudo passa por `src/lib/tempo.ts`, que é
  testado. Fuso, virada de dia e sobreposição são onde os bugs mentem em silêncio.
- Timestamps gravados em **UTC ISO-8601**; a fronteira do dia é calculada no fuso local.
- Rotas em `routes/`, tudo o mais em `components/`. Um arquivo de rota que passa de ~300
  linhas quer dizer que faltou extrair componente.
- **Nenhuma tela cria tarefa por conta própria.** Tudo passa por `components/CapturaLinha.vue`.
  Existiam quatro superfícies de criação com gramáticas diferentes — o botão mais destacado
  do app não criava nada, e o campo do Quadro fabricava tarefa órfã.
- **Tamanho de fonte vem da escala**, os oito degraus em `style.css` (`--t-micro` a `--t-tela`).
  Havia 22 tamanhos, doze deles entre 9 e 15px: passo de 0,5px não é visível nem renderizável.
- **`projects.color` guarda o token `p1`..`p6`**, não hex — a cor tem que virar com o tema.
  (O comentário da migration v1 diz "hex sem '#'"; está errado desde o primeiro dia e a
  migration não pode ser editada.)
- **Só existe barra de progresso se der para dizer o denominador em voz alta.** Se não der,
  é número, não gráfico.
