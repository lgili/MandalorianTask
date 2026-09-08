# Bancada

Registro de trabalho local-first: onde as horas foram, quais reuniões vieram da agenda,
e as notas de trabalho num vault markdown.

**Não é um app de produtividade — é um instrumento de medição.** Você não rastreia o tempo,
você confirma o dia que o app já montou.

## Estado

`v0.1` — Hoje (timeline), Quadro (kanban), Projetos, SQLite local, relatório da semana.
Google Agenda entra na v0.2; vault de notas na v0.3. As tabelas e os seams já existem.

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

## Onde os dados moram

| O quê | Onde |
|---|---|
| Banco | `%APPDATA%\com.lgili.bancada\bancada.db` · `~/Library/Application Support/com.lgili.bancada/bancada.db` |
| Notas (v0.3) | pasta do seu vault Obsidian, configurável |
| Token do Google (v0.2) | arquivo `0600` no mesmo appdata — nunca em `localStorage` |

O banco é um arquivo. Backup é copiar o arquivo.

## Convenções

- **Nenhum componente escreve SQL.** Tudo passa por `src/lib/db.ts`, que é a única camada
  que fala com o banco — o mesmo papel que `lib/api.ts` tem no eBOM generator.
- **Nenhum componente faz aritmética de data.** Tudo passa por `src/lib/tempo.ts`, que é
  testado. Fuso, virada de dia e sobreposição são onde os bugs mentem em silêncio.
- Timestamps gravados em **UTC ISO-8601**; a fronteira do dia é calculada no fuso local.
- Rotas em `routes/`, tudo o mais em `components/`. Um arquivo de rota que passa de ~300
  linhas quer dizer que faltou extrair componente.
