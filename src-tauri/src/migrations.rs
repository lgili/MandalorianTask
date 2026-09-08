//! Migrations do banco.
//!
//! Regra: uma migration NUNCA é editada depois de ter rodado numa máquina — o
//! sqlx guarda o checksum e recusa. Para mudar o schema, acrescente a próxima.
//!
//! O espelho TypeScript destas tabelas está em web/src/lib/types.ts.

use tauri_plugin_sql::{Migration, MigrationKind};

pub fn all() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "core: projects, tasks, sessions, transitions, meta",
        kind: MigrationKind::Up,
        sql: r#"
PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────────────────────────────────────
-- PROJETOS — o agrupador acima da tarefa. É o que responde "quanto tempo o
-- CF03B04 custou".
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE projects (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  code        TEXT,           -- curto, para o card e o gráfico: 'CF03B04', 'NACQ'
  color       TEXT,           -- hex sem '#'; cor estável entre relatórios
  archived_at TEXT,
  created_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_proj_name ON projects(name COLLATE NOCASE);

-- ─────────────────────────────────────────────────────────────────────────
-- TAREFAS — o card. Fluxo estilo Jira:
--
--     backlog  ->  fila  ->  fazendo  ->  feito
--     (captura)   (escolhi   (rodando)   (fim)
--                  pra hoje)
--
-- 'kind' preserva a pergunta original — "quantas horas em reunião?" — agora
-- sem depender de agenda nenhuma: a reunião é uma tarefa que você roda.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE tasks (
  id          INTEGER PRIMARY KEY,
  project_id  INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'trabalho'
                CHECK (kind IN ('trabalho','reuniao','admin')),
  status      TEXT NOT NULL DEFAULT 'backlog'
                CHECK (status IN ('backlog','fila','fazendo','feito')),
  -- Ordem manual dentro da coluna. Float para reordenar sem reescrever a
  -- coluna inteira: o novo valor é a média dos vizinhos.
  pos         REAL NOT NULL DEFAULT 0,
  due_at      TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL,   -- quando foi capturada (na reunião, em geral)
  -- Tarefa que estava RODANDO quando esta foi capturada. Preenchido sozinho.
  -- Três semanas depois você sabe de qual reunião a tarefa nasceu sem nunca
  -- ter digitado isso.
  origem_id   INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  queued_at   TEXT,            -- entrou na fila
  started_at  TEXT,            -- PRIMEIRA vez que entrou em 'fazendo' (lead time)
  done_at     TEXT,
  archived_at TEXT             -- sai do quadro; continua nos relatórios
);
CREATE INDEX idx_task_board ON tasks(status, archived_at, pos);
CREATE INDEX idx_task_due   ON tasks(due_at) WHERE due_at IS NOT NULL;
CREATE INDEX idx_task_proj  ON tasks(project_id);

-- ─────────────────────────────────────────────────────────────────────────
-- SESSÕES — o tempo. NÃO são digitadas: nascem da transição de status.
-- Entrar em 'fazendo' abre uma sessão; sair fecha. Editável depois.
--
-- ended_at NULL = sessão ABERTA, rodando agora. É o único estado em que o
-- app tem um cronômetro correndo, e ele é consequência do quadro, não de um
-- botão que a pessoa precisa lembrar de apertar.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE sessions (
  id         INTEGER PRIMARY KEY,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,   -- UTC ISO
  ended_at   TEXT,            -- NULL enquanto roda
  tz         TEXT NOT NULL,   -- IANA no momento do registro (histórico, não cálculo)
  source     TEXT NOT NULL DEFAULT 'auto'
               CHECK (source IN ('auto','manual')),
  note       TEXT,
  created_at TEXT NOT NULL,
  CHECK (ended_at IS NULL OR ended_at > started_at)
);
CREATE INDEX idx_sess_span ON sessions(started_at);
CREATE INDEX idx_sess_task ON sessions(task_id);

-- Só UMA sessão aberta no app inteiro. A coluna gerada é constante quando a
-- sessão está aberta e NULL quando fechada; como índice único ignora NULL,
-- isto permite infinitas sessões fechadas e no máximo uma aberta.
-- Sem isto, dois cards em 'fazendo' contariam a mesma hora duas vezes.
ALTER TABLE sessions ADD COLUMN aberta INTEGER
  GENERATED ALWAYS AS (CASE WHEN ended_at IS NULL THEN 1 ELSE NULL END) VIRTUAL;
CREATE UNIQUE INDEX idx_uma_sessao_aberta ON sessions(aberta);

-- ─────────────────────────────────────────────────────────────────────────
-- TRANSIÇÕES — histórico de status. Barato de gravar e é o que dá lead time
-- ("quanto tempo entre capturar e terminar") e cycle time ("quanto tempo
-- entre começar e terminar"), que é a informação que o Jira dá e a soma de
-- horas não dá.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE transitions (
  id      INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  de      TEXT,            -- NULL na criação
  para    TEXT NOT NULL,
  at      TEXT NOT NULL
);
CREATE INDEX idx_trans_task ON transitions(task_id, at);

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"#,
    }]
    // Próximas migrations entram AQUI, nunca editando a de cima:
    //   v2 (0.3): notes + notes_fts (FTS5) — índice do vault de markdown.
}
