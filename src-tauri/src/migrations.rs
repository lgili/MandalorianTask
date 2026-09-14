//! Database migrations.
//!
//! Rule: a migration is NEVER edited once it has run on some machine — sqlx
//! stores a checksum and refuses to start. To change the schema, append the
//! next one. That is also why v1–v3 below keep their Portuguese comments: the
//! app moved to English in v4, but rewriting their text would brick every
//! existing install.
//!
//! The TypeScript mirror of these tables lives in web/src/lib/types.ts.

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
    },
    Migration {
        version: 2,
        description: "tasks.outcome: how the task ended",
        kind: MigrationKind::Up,
        sql: r#"
-- Concluir não é um estado só. "Entregue" e "descartada" contam horas iguais
-- mas contam histórias diferentes — e o relatório de fim de mês precisa das
-- duas. NULL enquanto a tarefa não estiver em 'feito'.
ALTER TABLE tasks ADD COLUMN outcome TEXT
  CHECK (outcome IS NULL OR outcome IN ('entregue','descartada','repassada','revertida'));
ALTER TABLE tasks ADD COLUMN outcome_note TEXT;
"#,
    },
    Migration {
        version: 3,
        description: "notes: markdown vault index + FTS5 + links",
        kind: MigrationKind::Up,
        sql: r#"
-- ─────────────────────────────────────────────────────────────────────────
-- NOTAS — índice RECONSTRUÍVEL dos .md do vault.
--
-- O ARQUIVO é a verdade. Apagar estas três tabelas e reindexar tem que dar
-- exatamente o mesmo resultado; é por isso que nada aqui é editado pela UI,
-- só pelo indexador. Nota que o Obsidian cria por fora aparece aqui no
-- próximo scan, e nota apagada aqui não apaga arquivo nenhum.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE notes (
  path       TEXT PRIMARY KEY,   -- relativo à raiz do vault, sempre com '/'
  title      TEXT NOT NULL,      -- frontmatter `title` > primeiro `# ` > nome do arquivo
  mtime      INTEGER NOT NULL,   -- ms; o scan só relê o que mudou
  size       INTEGER NOT NULL,
  -- Valor CRU do frontmatter `projeto:` (código ou nome). Resolvido para um
  -- projeto na LEITURA, não aqui: renomear o código de um projeto não pode
  -- exigir reindexar o vault inteiro.
  projeto    TEXT,
  tags       TEXT,               -- JSON array, sem o '#'
  indexed_at TEXT NOT NULL
);
CREATE INDEX idx_notes_projeto ON notes(projeto COLLATE NOCASE);

-- remove_diacritics 2: buscar "reuniao" acha "reunião". Em português, sem
-- isto a busca é inútil.
CREATE VIRTUAL TABLE notes_fts USING fts5(
  path UNINDEXED,
  title,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- LINKS — cada [[alvo]] de cada nota.
--
-- `target` guarda o texto do link normalizado (minúsculo, sem .md, sem
-- #seção, sem |apelido), NÃO o path resolvido. Assim, criar a nota-alvo
-- depois faz o link "acender" sozinho, sem reindexar a nota de origem —
-- é o comportamento do Obsidian, e é o que torna o link barato de escrever.
CREATE TABLE note_links (
  src    TEXT NOT NULL REFERENCES notes(path) ON DELETE CASCADE ON UPDATE CASCADE,
  target TEXT NOT NULL,
  PRIMARY KEY (src, target)
);
CREATE INDEX idx_links_target ON note_links(target);
"#,
    },
    Migration {
        version: 4,
        description: "schema in English: status, kind, outcome values and column names",
        kind: MigrationKind::Up,
        sql: r#"
-- ─────────────────────────────────────────────────────────────────────────
-- v4 — the schema speaks English.
--
-- The app moved from Portuguese to English: status, kind and outcome VALUES
-- and a few column names change. v1–v3 above stay untouched (sqlx checksums
-- them), so their comments remain in Portuguese.
--
-- HOW, and why not the textbook way: SQLite cannot alter a CHECK constraint,
-- and the usual recipe is "create new table, copy, DROP old, rename". Here
-- that would be a disaster — sqlx runs every migration inside a transaction,
-- where `PRAGMA foreign_keys = OFF` is silently ignored, so `DROP TABLE tasks`
-- would CASCADE and wipe every session and transition. Instead each column is
-- swapped in place: ADD a new column with the new CHECK, copy the mapped
-- values, DROP the old column (its column-level CHECK goes with it), RENAME
-- the new one into place. No table is ever dropped.
--
-- CASE without ELSE is deliberate: the old CHECKs make any other value
-- impossible, and if one ever showed up the NOT NULL would fail the whole
-- migration (rolled back) instead of silently inventing data.
-- ─────────────────────────────────────────────────────────────────────────

-- tasks.status: backlog | fila | fazendo | feito  ->  backlog | queued | doing | done
DROP INDEX idx_task_board;
ALTER TABLE tasks ADD COLUMN status_new TEXT NOT NULL DEFAULT 'backlog'
  CHECK (status_new IN ('backlog','queued','doing','done'));
UPDATE tasks SET status_new = CASE status
  WHEN 'backlog' THEN 'backlog'
  WHEN 'fila'    THEN 'queued'
  WHEN 'fazendo' THEN 'doing'
  WHEN 'feito'   THEN 'done'
END;
ALTER TABLE tasks DROP COLUMN status;
ALTER TABLE tasks RENAME COLUMN status_new TO status;
CREATE INDEX idx_task_board ON tasks(status, archived_at, pos);

-- tasks.kind: trabalho | reuniao | admin  ->  work | meeting | admin
ALTER TABLE tasks ADD COLUMN kind_new TEXT NOT NULL DEFAULT 'work'
  CHECK (kind_new IN ('work','meeting','admin'));
UPDATE tasks SET kind_new = CASE kind
  WHEN 'trabalho' THEN 'work'
  WHEN 'reuniao'  THEN 'meeting'
  WHEN 'admin'    THEN 'admin'
END;
ALTER TABLE tasks DROP COLUMN kind;
ALTER TABLE tasks RENAME COLUMN kind_new TO kind;

-- tasks.outcome: entregue | descartada | repassada | revertida  ->  delivered | dropped | handed_off | reverted
ALTER TABLE tasks ADD COLUMN outcome_new TEXT
  CHECK (outcome_new IS NULL OR outcome_new IN ('delivered','dropped','handed_off','reverted'));
UPDATE tasks SET outcome_new = CASE outcome
  WHEN 'entregue'   THEN 'delivered'
  WHEN 'descartada' THEN 'dropped'
  WHEN 'repassada'  THEN 'handed_off'
  WHEN 'revertida'  THEN 'reverted'
END;
ALTER TABLE tasks DROP COLUMN outcome;
ALTER TABLE tasks RENAME COLUMN outcome_new TO outcome;

-- The task that was running when this one was captured.
ALTER TABLE tasks RENAME COLUMN origem_id TO origin_id;

-- transitions: status history. No CHECK on these, so rename + remap in place.
ALTER TABLE transitions RENAME COLUMN de TO from_status;
ALTER TABLE transitions RENAME COLUMN para TO to_status;
UPDATE transitions SET
  from_status = CASE from_status WHEN 'fila' THEN 'queued' WHEN 'fazendo' THEN 'doing' WHEN 'feito' THEN 'done' ELSE from_status END,
  to_status   = CASE to_status   WHEN 'fila' THEN 'queued' WHEN 'fazendo' THEN 'doing' WHEN 'feito' THEN 'done' ELSE to_status END;

-- sessions: the generated column behind "only ONE open session in the whole
-- app". Renamed, and its unique index recreated under an English name.
-- SQLite reports a violation by COLUMN (`UNIQUE constraint failed:
-- sessions.is_open`), and that is what db.sql.ts matches.
DROP INDEX idx_uma_sessao_aberta;
ALTER TABLE sessions RENAME COLUMN aberta TO is_open;
CREATE UNIQUE INDEX idx_one_open_session ON sessions(is_open);

-- notes: raw frontmatter value that links a note to a project.
DROP INDEX idx_notes_projeto;
ALTER TABLE notes RENAME COLUMN projeto TO project_ref;
CREATE INDEX idx_notes_project_ref ON notes(project_ref COLLATE NOCASE);

-- meta: plugin settings. Core plugins switched off by the user…
UPDATE meta SET
  key = 'plugins_core_off',
  value = replace(replace(replace(value,
    '"nota-do-dia"', '"daily-note"'),
    '"tarefas-da-nota"', '"note-tasks"'),
    '"grafo"', '"graph"')
WHERE key = 'plugins_nucleo_off';

-- …and per-vault trust: {"confia": bool, "ativos": [...]} -> {"trusted": bool, "enabled": [...]}
-- The example plugin's folder in the vault is not renamed here (SQL can't
-- reach the vault); plugins/index.ts installs `highlight-todo` next to it.
UPDATE meta SET value = json_object(
    'trusted', json(CASE WHEN json_extract(value, '$.confia') THEN 'true' ELSE 'false' END),
    'enabled', json(replace(coalesce(json_extract(value, '$.ativos'), '[]'), '"destaca-todo"', '"highlight-todo"'))
  )
WHERE key LIKE 'plugins_vault:%' AND json_valid(value);
"#,
    }]
    // Next migrations go HERE — never by editing the ones above.
}

// ─────────────────────────────────────────────────────────────────────────
// Tests run the REAL sqlx migrator over these exact migrations — same crate
// version, same bundled SQLite, one transaction per migration, foreign keys
// ON. Those are precisely the conditions under which a careless v4 would
// cascade-delete every session, so that is what they check.
// ─────────────────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::all;
    use sqlx::migrate::{Migration as SqlxMigration, MigrationType, Migrator};
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
    use sqlx::Row;
    use std::borrow::Cow;
    use std::str::FromStr;

    /// Migrator with every migration up to `up_to`, built the way
    /// tauri-plugin-sql builds it (ReversibleUp, no_tx = false).
    fn migrator(up_to: i64) -> Migrator {
        let migrations: Vec<SqlxMigration> = all()
            .into_iter()
            .filter(|m| m.version <= up_to)
            .map(|m| SqlxMigration::new(m.version, m.description.into(), MigrationType::ReversibleUp, m.sql.into(), false))
            .collect();
        Migrator { migrations: Cow::Owned(migrations), ..Migrator::DEFAULT }
    }

    async fn pool() -> SqlitePool {
        // One connection: an in-memory database is per-connection.
        let opts = SqliteConnectOptions::from_str("sqlite::memory:").unwrap(); // foreign_keys = ON by default
        SqlitePoolOptions::new().max_connections(1).connect_with(opts).await.unwrap()
    }

    async fn count(p: &SqlitePool, sql: &str) -> i64 {
        sqlx::query(sql).fetch_one(p).await.unwrap().get::<i64, _>(0)
    }

    async fn exec(p: &SqlitePool, sql: &str) -> Result<(), sqlx::Error> {
        sqlx::query(sql).execute(p).await.map(|_| ())
    }

    /// A database shaped like a real one before v4: Portuguese values everywhere.
    async fn seed_v3(p: &SqlitePool) {
        for sql in [
            "INSERT INTO projects (id,name,code,color,created_at) VALUES (1,'Flyback rev C','CF03B04','p1','x'),(2,'NACQ','NACQ','p2','x')",
            "INSERT INTO tasks (id,project_id,kind,status,outcome,origem_id,title,created_at) VALUES
               (1,1,'reuniao','feito','entregue',NULL,'t1','x'),
               (2,1,'trabalho','backlog',NULL,1,'t2','x'),
               (3,1,'trabalho','fila',NULL,1,'t3','x'),
               (4,2,'trabalho','fazendo',NULL,NULL,'t4','x'),
               (5,2,'admin','feito','descartada',NULL,'t5','x'),
               (6,NULL,'trabalho','feito','repassada',4,'t6','x'),
               (7,NULL,'reuniao','feito','revertida',NULL,'t7','x')",
            "INSERT INTO transitions (task_id,de,para,at) VALUES (1,NULL,'backlog','x'),(1,'backlog','fila','x'),(1,'fila','fazendo','x'),(1,'fazendo','feito','x')",
            "INSERT INTO notes VALUES ('a.md','A',1,1,'CF03B04','[]','x')",
            "INSERT INTO notes_fts (path,title,body) VALUES ('a.md','A','ata da reuniao do snubber')",
            r#"INSERT INTO meta VALUES ('plugins_nucleo_off','["grafo","nota-do-dia"]'),('plugins_vault:C:/v','{"confia":true,"ativos":["destaca-todo"]}')"#,
        ] {
            exec(p, sql).await.unwrap();
        }
        for i in 1..=20 {
            exec(p, &format!(
                "INSERT INTO sessions (task_id,started_at,ended_at,tz,created_at) VALUES ({},'2026-09-{:02}T10:00:00Z','2026-09-{:02}T11:00:00Z','x','x')",
                1 + i % 7, i, i)).await.unwrap();
        }
        exec(p, "INSERT INTO sessions (task_id,started_at,tz,created_at) VALUES (4,'2026-09-21T09:00:00Z','x','x')").await.unwrap();
    }

    #[tokio::test]
    async fn v4_keeps_every_row_and_speaks_english() {
        let p = pool().await;
        migrator(3).run(&p).await.unwrap();
        seed_v3(&p).await;

        migrator(i64::MAX).run(&p).await.expect("v4 must apply");

        // Nothing lost — the whole point of not rebuilding the table.
        assert_eq!(count(&p, "SELECT COUNT(*) FROM tasks").await, 7);
        assert_eq!(count(&p, "SELECT COUNT(*) FROM sessions").await, 21, "sessions survived");
        assert_eq!(count(&p, "SELECT COUNT(*) FROM transitions").await, 4);
        assert_eq!(count(&p, "SELECT COUNT(*) FROM notes").await, 1);

        let rows = sqlx::query("SELECT id, status, kind, outcome, origin_id FROM tasks ORDER BY id")
            .fetch_all(&p).await.unwrap();
        let got: Vec<(i64, String, String, Option<String>, Option<i64>)> = rows.iter()
            .map(|r| (r.get(0), r.get(1), r.get(2), r.get(3), r.get(4))).collect();
        let s = |x: &str| x.to_string();
        assert_eq!(got, vec![
            (1, s("done"), s("meeting"), Some(s("delivered")), None),
            (2, s("backlog"), s("work"), None, Some(1)),
            (3, s("queued"), s("work"), None, Some(1)),
            (4, s("doing"), s("work"), None, None),
            (5, s("done"), s("admin"), Some(s("dropped")), None),
            (6, s("done"), s("work"), Some(s("handed_off")), Some(4)),
            (7, s("done"), s("meeting"), Some(s("reverted")), None),
        ]);

        let tr = sqlx::query("SELECT from_status, to_status FROM transitions ORDER BY id").fetch_all(&p).await.unwrap();
        let tr: Vec<(Option<String>, String)> = tr.iter().map(|r| (r.get(0), r.get(1))).collect();
        assert_eq!(tr, vec![(None, s("backlog")), (Some(s("backlog")), s("queued")), (Some(s("queued")), s("doing")), (Some(s("doing")), s("done"))]);

        // New CHECKs: old values rejected, new ones accepted.
        assert!(exec(&p, "UPDATE tasks SET status = 'fila' WHERE id = 2").await.is_err());
        assert!(exec(&p, "UPDATE tasks SET kind = 'reuniao' WHERE id = 2").await.is_err());
        assert!(exec(&p, "UPDATE tasks SET outcome = 'entregue' WHERE id = 1").await.is_err());
        assert!(exec(&p, "UPDATE tasks SET status = 'queued' WHERE id = 2").await.is_ok());

        // Still exactly one open session, still enforced — and the message the
        // frontend matches to show "a task is already running".
        assert_eq!(count(&p, "SELECT COUNT(*) FROM sessions WHERE is_open = 1").await, 1);
        let dup = exec(&p, "INSERT INTO sessions (task_id,started_at,tz,created_at) VALUES (3,'2026-09-21T10:00:00Z','x','x')").await;
        let msg = dup.expect_err("second open session must fail").to_string();
        assert!(msg.contains("sessions.is_open"), "unexpected message: {msg}");

        assert_eq!(count(&p, "SELECT COUNT(*) FROM notes WHERE project_ref = 'CF03B04'").await, 1);
        assert_eq!(count(&p, "SELECT COUNT(*) FROM notes_fts WHERE notes_fts MATCH 'reuniao'").await, 1);

        let meta: Vec<(String, String)> = sqlx::query("SELECT key, value FROM meta ORDER BY key").fetch_all(&p).await.unwrap()
            .iter().map(|r| (r.get(0), r.get(1))).collect();
        assert_eq!(meta, vec![
            (s("plugins_core_off"), s(r#"["graph","daily-note"]"#)),
            (s("plugins_vault:C:/v"), s(r#"{"trusted":true,"enabled":["highlight-todo"]}"#)),
        ]);

        assert_eq!(count(&p, "SELECT COUNT(*) FROM pragma_foreign_key_check").await, 0);

        // Foreign-key actions still behave.
        exec(&p, "DELETE FROM tasks WHERE id = 4").await.unwrap();
        assert_eq!(count(&p, "SELECT COUNT(*) FROM sessions WHERE task_id = 4").await, 0, "CASCADE kept");
        assert_eq!(count(&p, "SELECT COUNT(*) FROM tasks WHERE id = 6 AND origin_id IS NULL").await, 1, "SET NULL kept");
    }

    #[tokio::test]
    async fn fresh_install_applies_everything() {
        let p = pool().await;
        migrator(i64::MAX).run(&p).await.expect("all migrations on an empty database");
        exec(&p, "INSERT INTO tasks (title, created_at) VALUES ('first', 'x')").await.unwrap();
        let (status, kind): (String, String) = sqlx::query_as("SELECT status, kind FROM tasks").fetch_one(&p).await.unwrap();
        assert_eq!((status.as_str(), kind.as_str()), ("backlog", "work"), "English defaults");
    }

    /// SHA-384 of each migration's SQL, as sqlx computes it. sqlx stores this
    /// checksum when a migration first runs and refuses to start if it ever
    /// differs — so these values must NEVER change once a build has shipped.
    /// A new migration gets a new line here; an old line is never edited.
    ///
    /// Line endings do not matter: rustc normalizes CRLF to LF in source before
    /// building string literals, so a Windows checkout and a macOS checkout
    /// compile the same bytes and record the same checksum.
    const FROZEN: [(i64, &str); 4] = [
        (1, "bfcdd57df4da733749f272200ec76369473e9ffe94807806e53d63230edc76ae7dd60983f4df3f1f2f8dd411a81ea9ee"),
        (2, "4fdedc836382d4d56474b238c427350408bcab76cb6e7f7ebc4c4f7ed4cba3d5c2b03ddb132d569d488f4478749539ab"),
        (3, "19894f2394493a0ffec394b77c602339702f8eebadb6eadb936272ed8b36fc672f979015c328080f92cc7690cd7bf198"),
        (4, "890a2c1249029cf344ab39782ecb15d4b06f33a2e10a332cc8d64d8da91d5775fe078318d0fbf1ab9fd646508c3665d9"),
    ];

    /// Guards the one way an installer bricks every existing install with
    /// "migration N was previously applied but has been modified": someone
    /// edits an applied migration — even a comment inside its SQL.
    #[test]
    fn applied_migrations_are_frozen() {
        use sha2::{Digest, Sha384};
        let migrations = all();
        assert_eq!(migrations.len(), FROZEN.len(), "new migration? add its checksum to FROZEN");
        for (m, (version, want)) in migrations.iter().zip(FROZEN.iter()) {
            assert_eq!(m.version, *version);
            let got: String = Sha384::digest(m.sql.as_bytes()).iter().map(|b| format!("{b:02x}")).collect();
            assert_eq!(&got, want, "migration v{version} was edited after shipping — append a new migration instead");
        }
    }
}
