#!/usr/bin/env node
// Fills the database with sample data so the app can be judged with real content.
// Development tool — it does not ship in the bundle.
//
//   pnpm seed            # refuses if there is already data
//   pnpm seed --force    # deletes everything and rebuilds
//
// No dependencies: node:sqlite is built into Node 22+.

import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const ID = 'com.lgili.bancada';

function dbPath() {
  if (platform() === 'darwin') return join(homedir(), 'Library', 'Application Support', ID, 'bancada.db');
  if (platform() === 'win32') return join(process.env.APPDATA ?? '', ID, 'bancada.db');
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), ID, 'bancada.db');
}

const FORCE = process.argv.includes('--force');
const dbFile = dbPath();

if (!existsSync(dbFile)) {
  console.error(`Database not found at:\n  ${dbFile}\n\n` +
    'Run the app once (pnpm dev) so the migrations create the schema, then run the seed.');
  process.exit(1);
}

const db = new DatabaseSync(dbFile);
db.exec('PRAGMA foreign_keys = ON');

// The seed writes the v4 schema (English values and column names). A database
// the app created before v4 would take the projects and then fail on the first
// task, leaving it half-seeded — so check first.
let schemaVersion = 0;
try {
  schemaVersion = db.prepare('SELECT MAX(version) AS v FROM _sqlx_migrations').get().v ?? 0;
} catch { /* no migrations table yet */ }
if (schemaVersion < 4) {
  console.error(`The database schema is at migration v${schemaVersion}; the seed needs v4.\n` +
    'Run the app once (pnpm dev) so the migrations upgrade it, then run the seed.');
  process.exit(1);
}

const count = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
const existing = count('tasks') + count('projects');

if (existing > 0 && !FORCE) {
  console.error(`The database already has ${count('projects')} project(s) and ${count('tasks')} task(s).\n` +
    'Use --force to delete and rebuild, or delete the file manually.');
  process.exit(1);
}
if (FORCE) {
  db.exec('DELETE FROM sessions; DELETE FROM transitions; DELETE FROM tasks; DELETE FROM projects;');
}

// ── time ───────────────────────────────────────────────────────────────────
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const NOW = new Date();
const iso = (d) => d.toISOString();
/** Local date N days ago, at the given hour/minute. */
function at(daysAgo, hour, min = 0) {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, min, 0, 0);
  return d;
}
const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;

// deterministic generator: running it twice gives the same database
let seed = 20260909;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = (a) => a[Math.floor(rnd() * a.length)];

// ── projects ───────────────────────────────────────────────────────────────
const insProject = db.prepare(
  `INSERT INTO projects (name, code, color, created_at) VALUES (?,?,?,?)`);
const PROJ = {};
for (const [name, code, color] of [
  ['Flyback rev C', 'CF03B04', null],
  ['NACQ 2026', 'NACQ', null],
  ['Lab bench and infra', 'INFRA', null],
]) PROJ[code] = Number(insProject.run(name, code, color, iso(at(60, 9))).lastInsertRowid);

// ── tasks ──────────────────────────────────────────────────────────────────
const insTask = db.prepare(
  `INSERT INTO tasks (project_id, title, kind, status, pos, due_at, created_at,
                      origin_id, queued_at, started_at, done_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
const insTrans = db.prepare(`INSERT INTO transitions (task_id, from_status, to_status, at) VALUES (?,?,?,?)`);
const insSess = db.prepare(
  `INSERT INTO sessions (task_id, started_at, ended_at, tz, source, note, created_at)
   VALUES (?,?,?,?,?,?,?)`);

let pos = 0;
function task({ proj = null, title, kind = 'work', status = 'backlog',
                due = null, created, origin = null, queued = null, started = null, done = null }) {
  const id = Number(insTask.run(
    proj ? PROJ[proj] : null, title, kind, status, pos++,
    due ? iso(due) : null, iso(created), origin,
    queued ? iso(queued) : null, started ? iso(started) : null, done ? iso(done) : null,
  ).lastInsertRowid);
  insTrans.run(id, null, 'backlog', iso(created));
  if (queued) insTrans.run(id, 'backlog', 'queued', iso(queued));
  if (started) insTrans.run(id, 'queued', 'doing', iso(started));
  if (done) insTrans.run(id, 'doing', 'done', iso(done));
  return id;
}

function session(taskId, start, minutes, source = 'auto') {
  const end = new Date(start.getTime() + minutes * 60000);
  insSess.run(taskId, iso(start), iso(end), TZ, source, null, iso(start));
}

// ── recurring meetings: they are the capture context for the backlog ───────
const dfmea = task({
  proj: 'CF03B04', title: 'DFMEA review — Flyback rev C', kind: 'meeting',
  status: 'done', created: at(9, 8, 30), queued: at(9, 8, 30),
  started: at(9, 14), done: at(9, 15),
});
session(dfmea, at(9, 14), 60);

const purchasing = task({
  proj: 'NACQ', title: 'Weekly sync with purchasing', kind: 'meeting',
  status: 'done', created: at(2, 9), queued: at(2, 9),
  started: at(2, 11), done: at(2, 11, 40),
});
session(purchasing, at(2, 11), 40);

// ── backlog: what came out of those meetings, with the context preserved ───
for (const t of [
  'measure ripple on the 400 V bus with a differential probe',
  'check output capacitor derating at 85 °C',
  'add a snubber continuity test to the ATE',
]) task({ proj: 'CF03B04', title: t, created: at(9, 14, 20 + Math.floor(rnd() * 30)), origin: dfmea });

for (const t of [
  'request a sample of the UCC21540 isolated driver',
  'quote an alternative 47 µH inductor',
]) task({ proj: 'NACQ', title: t, created: at(2, 11, 10 + Math.floor(rnd() * 25)), origin: purchasing });

task({ title: 'study LLC topology for the next generation', created: at(6, 17, 40) });
task({ proj: 'INFRA', title: 'migrate the loss spreadsheet to a script', created: at(4, 18) });
task({ proj: 'INFRA', title: 'recalibrate the differential probe (expired in May)', created: at(1, 9, 15) });

// ── queued ─────────────────────────────────────────────────────────────────
task({ proj: 'CF03B04', title: 'Close eBOM CF03B04 rev C', status: 'queued',
  created: at(7, 10), queued: at(1, 9), due: at(-2, 12) });
task({ proj: 'NACQ', title: 'Redo the current-loop DFMEA', status: 'queued',
  created: at(5, 15), queued: at(1, 9), due: at(-9, 12) });
task({ proj: 'INFRA', title: 'Replace the electronic load fan', status: 'queued',
  created: at(3, 16), queued: at(1, 9) });

// ── doing: TWO cards, and only one of them will be running ─────────────────
// This is the distinction the app makes: "being in Doing" != "running right now".
const thermal = task({
  proj: 'CF03B04', title: 'Thermal test — 3 load points', status: 'doing',
  created: at(8, 16), queued: at(3, 9), started: at(3, 10, 30),
});
session(thermal, at(3, 10, 30), 135);
session(thermal, at(1, 14), 95);

const snubber = task({
  proj: 'CF03B04', title: 'Review RCD snubber layout', status: 'doing',
  created: at(10, 11), queued: at(4, 9), started: at(4, 13),
});
session(snubber, at(4, 13), 110);
session(snubber, at(2, 15, 30), 75);

// ── done ───────────────────────────────────────────────────────────────────
const doneTasks = [
  ['CF03B04', 'EMC pre-compliance test', 'work', 12, 6, [[12, 9, 165], [11, 14, 240]]],
  ['NACQ', 'AC connector quote', 'work', 8, 5, [[6, 16, 90]]],
  ['CF03B04', 'Snubber simulation in LTspice', 'work', 14, 10, [[11, 9, 145], [10, 15, 80]]],
  ['INFRA', 'Organize bench 2 datasheets', 'admin', 7, 5, [[5, 17, 55]]],
  ['NACQ', 'Review auxiliary supply BOM', 'work', 9, 7, [[7, 10, 120]]],
  ['CF03B04', 'Measure rev B efficiency curve', 'work', 16, 13, [[14, 9, 200], [13, 14, 130]]],
];
for (const [p, title, kind, createdD, doneD, sess] of doneTasks) {
  const id = task({
    proj: p, title, kind, status: 'done',
    created: at(createdD, 9), queued: at(createdD - 1, 9),
    started: at(sess[0][0], sess[0][1]), done: at(doneD, 17),
  });
  for (const [d, h, m] of sess) session(id, at(d, h), m);
}

// ── meetings and admin over the last 15 working days ───────────────────────
// The ratio matters: a real engineer spends 20-30% of their time in meetings, and
// that is exactly the number the app exists to show. At 3% the report
// would say nothing.
const ROUTINE = [
  ['Hardware team daily', 'meeting', null, 20, 1.0],
  ['Design review — CF03B04', 'meeting', 'CF03B04', 75, 0.55],
  ['Sync with production', 'meeting', 'NACQ', 45, 0.5],
  ['Engineering change committee', 'meeting', null, 60, 0.3],
  ['Emails and approvals', 'admin', 'INFRA', 35, 0.7],
  ['Production support — line 3', 'admin', 'NACQ', 40, 0.3],
];
for (let d = 15; d >= 1; d--) {
  if (isWeekend(at(d, 9))) continue;
  let hour = 8;
  for (const [title, kind, p, dur, chance] of ROUTINE) {
    if (rnd() > chance) continue;
    const min = Math.round(dur * (0.7 + rnd() * 0.6));
    const id = task({
      proj: p, title, kind, status: 'done',
      created: at(d, 8, 15), queued: at(d, 8, 15), started: at(d, hour), done: at(d, hour, min),
    });
    session(id, at(d, hour, Math.floor(rnd() * 15)), min);
    hour += Math.max(1, Math.ceil(min / 60));
    if (hour > 16) break;
  }
}

// ── focus blocks on the in-progress tasks, so the week has real volume ─────
// An engineering day has 5-7 h measured, not 45 min.
for (let d = 14; d >= 1; d--) {
  const day = at(d, 9);
  if (isWeekend(day)) continue;
  const target = pick([thermal, snubber, dfmea === undefined ? thermal : snubber]);
  session(target, at(d, 10, 30 + Math.floor(rnd() * 25)), 70 + Math.floor(rnd() * 55));
  session(target, at(d, 14, 30 + Math.floor(rnd() * 30)), 80 + Math.floor(rnd() * 60));
}

// ── the session that is RUNNING right now ──────────────────────────────────
// Exactly one: the database's unique index would not allow more.
const openStart = new Date(NOW.getTime() - 47 * 60000);
insSess.run(thermal, iso(openStart), null, TZ, 'auto', null, iso(openStart));
db.prepare(`UPDATE tasks SET status = 'doing' WHERE id = ?`).run(thermal);

// ── sanity check ───────────────────────────────────────────────────────────
const openCount = db.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE ended_at IS NULL`).get().n;
const hours = db.prepare(
  `SELECT ROUND(SUM((julianday(ended_at)-julianday(started_at))*24), 1) AS h
     FROM sessions WHERE ended_at IS NOT NULL`).get().h;
const byStatus = db.prepare(
  `SELECT status, COUNT(*) AS n FROM tasks GROUP BY status ORDER BY status`).all();

console.log(`\n  ${dbFile}\n`);
console.log(`  projects ......... ${count('projects')}`);
for (const s of byStatus) console.log(`  ${s.status.padEnd(16, '.')} ${s.n}`);
console.log(`  sessions ......... ${count('sessions')}  (${hours} h logged)`);
const mix = db.prepare(
  `SELECT t.kind, ROUND(100.0*SUM(julianday(s.ended_at)-julianday(s.started_at)) /
          (SELECT SUM(julianday(ended_at)-julianday(started_at)) FROM sessions WHERE ended_at IS NOT NULL)) AS pct
     FROM sessions s JOIN tasks t ON t.id=s.task_id
    WHERE s.ended_at IS NOT NULL GROUP BY t.kind ORDER BY pct DESC`).all();
console.log(`  mix .............. ${mix.map((m) => `${m.kind} ${m.pct}%`).join('  ')}`);
console.log(`  running now ...... ${openCount}`);
if (openCount !== 1) { console.error('\n  ERROR: there should be exactly 1 open session.'); process.exit(1); }
console.log('\n  done — open the app.\n');
db.close();
