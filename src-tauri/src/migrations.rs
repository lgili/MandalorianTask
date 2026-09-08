//! Migrations do banco.
//!
//! Regra: uma migration NUNCA é editada depois de ter rodado numa máquina.
//! Para mudar o schema, acrescente a próxima na lista. O plugin guarda quais
//! já rodaram e aplica só o que falta.
//!
//! O espelho TypeScript destas tabelas está em app/web/src/lib/types.ts.

use tauri_plugin_sql::{Migration, MigrationKind};

pub fn all() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "core: projects, activities, time_entries, meta",
        kind: MigrationKind::Up,
        sql: r#"
PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────────────────────────────────────
-- PROJETOS — o agrupador acima da atividade. Relatório por projeto é o
-- que responde "quanto tempo o CF03B04 custou".
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE projects (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  code        TEXT,           -- curto, para card e gráfico: 'CF03B04', 'NACQ'
  color       TEXT,           -- hex sem '#'; cor estável entre relatórios
  archived_at TEXT,
  created_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_proj_name ON projects(name COLLATE NOCASE);

-- ─────────────────────────────────────────────────────────────────────────
-- ATIVIDADES — a unidade de trabalho; o card do quadro.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE activities (
  id          INTEGER PRIMARY KEY,
  project_id  INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'backlog'
                CHECK (status IN ('backlog','semana','fazendo','feito')),
  due_at      TEXT,           -- prazo, UTC ISO
  gcal_due_id TEXT,           -- id do evento de prazo que NÓS criamos (v0.4)
  note_path   TEXT,           -- caminho relativo no vault (v0.3)
  archived_at TEXT,           -- sai do quadro; continua nos relatórios
  created_at  TEXT NOT NULL,
  done_at     TEXT
);
CREATE INDEX idx_act_board ON activities(status, archived_at);
CREATE INDEX idx_act_due   ON activities(due_at) WHERE due_at IS NOT NULL;
CREATE INDEX idx_act_proj  ON activities(project_id);

-- ─────────────────────────────────────────────────────────────────────────
-- ENTRADAS DE TEMPO — os blocos da timeline; a fonte de todo relatório.
--
-- Duas colunas carregam as regras que impedem o app de mentir:
--   gcal_event_id UNIQUE  -> um evento vira no máximo uma linha. Sem isto,
--                            reunião semanal vira 52 entradas no primeiro sync.
--   confirmed_at NULL     -> candidato. Aparece na timeline, NÃO entra em
--                            relatório enquanto você não confirmar.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE time_entries (
  id            INTEGER PRIMARY KEY,
  activity_id   INTEGER REFERENCES activities(id) ON DELETE SET NULL,
  started_at    TEXT NOT NULL,   -- UTC ISO
  ended_at      TEXT NOT NULL,   -- UTC ISO
  tz            TEXT NOT NULL,   -- IANA no momento do registro (histórico, não cálculo)
  kind          TEXT NOT NULL CHECK (kind IN ('foco','reuniao','admin','pausa')),
  source        TEXT NOT NULL CHECK (source IN ('manual','timer','calendar')),
  gcal_event_id TEXT UNIQUE,     -- id da INSTÂNCIA, não da série recorrente
  confirmed_at  TEXT,
  note          TEXT,
  created_at    TEXT NOT NULL,
  CHECK (ended_at > started_at)
);
CREATE INDEX idx_te_span    ON time_entries(started_at, ended_at);
CREATE INDEX idx_te_act     ON time_entries(activity_id);
CREATE INDEX idx_te_pending ON time_entries(confirmed_at) WHERE confirmed_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- META — schema_version, nextSyncToken do Google, caminho do vault.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"#,
    }]
    // Próximas migrations entram AQUI, nunca editando a de cima:
    //
    //   v2 (0.2): calendar_events — espelho bruto dos eventos, para poder
    //             reclassificar sem re-sincronizar tudo.
    //   v3 (0.3): notes + notes_fts (FTS5) — índice do vault. Cache: a verdade
    //             são os arquivos .md no disco.
}
