#!/usr/bin/env node
// Popula o banco com dados de exemplo para avaliar o app com conteúdo real.
// Ferramenta de desenvolvimento — não vai junto no bundle.
//
//   pnpm seed            # recusa se já houver dados
//   pnpm seed --force    # apaga tudo e refaz
//
// Sem dependências: node:sqlite é embutido no Node 22+.

import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const ID = 'com.lgili.bancada';

function caminhoBanco() {
  if (platform() === 'darwin') return join(homedir(), 'Library', 'Application Support', ID, 'bancada.db');
  if (platform() === 'win32') return join(process.env.APPDATA ?? '', ID, 'bancada.db');
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), ID, 'bancada.db');
}

const FORCE = process.argv.includes('--force');
const arquivo = caminhoBanco();

if (!existsSync(arquivo)) {
  console.error(`Banco não encontrado em:\n  ${arquivo}\n\n` +
    'Rode o app uma vez (pnpm dev) para as migrations criarem o schema, depois rode o seed.');
  process.exit(1);
}

const db = new DatabaseSync(arquivo);
db.exec('PRAGMA foreign_keys = ON');

const conta = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
const jaTem = conta('tasks') + conta('projects');

if (jaTem > 0 && !FORCE) {
  console.error(`O banco já tem ${conta('projects')} projeto(s) e ${conta('tasks')} tarefa(s).\n` +
    'Use --force para apagar e refazer, ou apague o arquivo manualmente.');
  process.exit(1);
}
if (FORCE) {
  db.exec('DELETE FROM sessions; DELETE FROM transitions; DELETE FROM tasks; DELETE FROM projects;');
}

// ── tempo ──────────────────────────────────────────────────────────────────
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const AGORA = new Date();
const iso = (d) => d.toISOString();
/** Data local a N dias atrás, na hora/minuto pedidos. */
function em(diasAtras, hora, min = 0) {
  const d = new Date(AGORA);
  d.setDate(d.getDate() - diasAtras);
  d.setHours(hora, min, 0, 0);
  return d;
}
const ehFimDeSemana = (d) => d.getDay() === 0 || d.getDay() === 6;

// gerador determinístico: rodar duas vezes dá o mesmo banco
let semente = 20260909;
const rnd = () => (semente = (semente * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const escolhe = (a) => a[Math.floor(rnd() * a.length)];

// ── projetos ───────────────────────────────────────────────────────────────
const projeto = db.prepare(
  `INSERT INTO projects (name, code, color, created_at) VALUES (?,?,?,?)`);
const PROJ = {};
for (const [nome, cod, cor] of [
  ['Flyback rev C', 'CF03B04', null],
  ['NACQ 2026', 'NACQ', null],
  ['Bancada e infra', 'INFRA', null],
]) PROJ[cod] = Number(projeto.run(nome, cod, cor, iso(em(60, 9))).lastInsertRowid);

// ── tarefas ────────────────────────────────────────────────────────────────
const insTask = db.prepare(
  `INSERT INTO tasks (project_id, title, kind, status, pos, due_at, created_at,
                      origem_id, queued_at, started_at, done_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
const insTrans = db.prepare(`INSERT INTO transitions (task_id, de, para, at) VALUES (?,?,?,?)`);
const insSess = db.prepare(
  `INSERT INTO sessions (task_id, started_at, ended_at, tz, source, note, created_at)
   VALUES (?,?,?,?,?,?,?)`);

let pos = 0;
function tarefa({ proj = null, titulo, kind = 'trabalho', status = 'backlog',
                  prazo = null, criada, origem = null, fila = null, inicio = null, fim = null }) {
  const id = Number(insTask.run(
    proj ? PROJ[proj] : null, titulo, kind, status, pos++,
    prazo ? iso(prazo) : null, iso(criada), origem,
    fila ? iso(fila) : null, inicio ? iso(inicio) : null, fim ? iso(fim) : null,
  ).lastInsertRowid);
  insTrans.run(id, null, 'backlog', iso(criada));
  if (fila) insTrans.run(id, 'backlog', 'fila', iso(fila));
  if (inicio) insTrans.run(id, 'fila', 'fazendo', iso(inicio));
  if (fim) insTrans.run(id, 'fazendo', 'feito', iso(fim));
  return id;
}

function sessao(taskId, inicio, minutos, source = 'auto') {
  const fim = new Date(inicio.getTime() + minutos * 60000);
  insSess.run(taskId, iso(inicio), iso(fim), TZ, source, null, iso(inicio));
}

// ── reuniões recorrentes: são o contexto de captura do backlog ──────────────
const dfmea = tarefa({
  proj: 'CF03B04', titulo: 'Revisão DFMEA — Flyback rev C', kind: 'reuniao',
  status: 'feito', criada: em(9, 8, 30), fila: em(9, 8, 30),
  inicio: em(9, 14), fim: em(9, 15),
});
sessao(dfmea, em(9, 14), 60);

const compras = tarefa({
  proj: 'NACQ', titulo: 'Alinhamento semanal com compras', kind: 'reuniao',
  status: 'feito', criada: em(2, 9), fila: em(2, 9),
  inicio: em(2, 11), fim: em(2, 11, 40),
});
sessao(compras, em(2, 11), 40);

// ── backlog: o que saiu daquelas reuniões, com o contexto preservado ────────
for (const t of [
  'medir ripple no barramento 400 V com ponteira diferencial',
  'conferir derating do capacitor de saída a 85 °C',
  'adicionar teste de continuidade do snubber no ATE',
]) tarefa({ proj: 'CF03B04', titulo: t, criada: em(9, 14, 20 + Math.floor(rnd() * 30)), origem: dfmea });

for (const t of [
  'pedir amostra do driver isolado UCC21540',
  'cotar indutor alternativo de 47 µH',
]) tarefa({ proj: 'NACQ', titulo: t, criada: em(2, 11, 10 + Math.floor(rnd() * 25)), origem: compras });

tarefa({ titulo: 'estudar topologia LLC para a próxima geração', criada: em(6, 17, 40) });
tarefa({ proj: 'INFRA', titulo: 'migrar planilha de perdas para script', criada: em(4, 18) });
tarefa({ proj: 'INFRA', titulo: 'recalibrar a ponteira diferencial (venceu em maio)', criada: em(1, 9, 15) });

// ── fila ───────────────────────────────────────────────────────────────────
tarefa({ proj: 'CF03B04', titulo: 'Fechar eBOM CF03B04 rev C', status: 'fila',
  criada: em(7, 10), fila: em(1, 9), prazo: em(-2, 12) });
tarefa({ proj: 'NACQ', titulo: 'Refazer DFMEA da malha de corrente', status: 'fila',
  criada: em(5, 15), fila: em(1, 9), prazo: em(-9, 12) });
tarefa({ proj: 'INFRA', titulo: 'Trocar o ventilador da carga eletrônica', status: 'fila',
  criada: em(3, 16), fila: em(1, 9) });

// ── fazendo: DOIS cards, e só um vai estar rodando ─────────────────────────
// É a distinção que o app faz: "estar em Fazendo" != "estar rodando agora".
const termico = tarefa({
  proj: 'CF03B04', titulo: 'Ensaio térmico — 3 pontos de carga', status: 'fazendo',
  criada: em(8, 16), fila: em(3, 9), inicio: em(3, 10, 30),
});
sessao(termico, em(3, 10, 30), 135);
sessao(termico, em(1, 14), 95);

const snubber = tarefa({
  proj: 'CF03B04', titulo: 'Revisar layout do snubber RCD', status: 'fazendo',
  criada: em(10, 11), fila: em(4, 9), inicio: em(4, 13),
});
sessao(snubber, em(4, 13), 110);
sessao(snubber, em(2, 15, 30), 75);

// ── feito ──────────────────────────────────────────────────────────────────
const feitos = [
  ['CF03B04', 'Ensaio EMC pré-compliance', 'trabalho', 12, 6, [[12, 9, 165], [11, 14, 240]]],
  ['NACQ', 'Cotação de conectores AC', 'trabalho', 8, 5, [[6, 16, 90]]],
  ['CF03B04', 'Simulação do snubber no LTspice', 'trabalho', 14, 10, [[11, 9, 145], [10, 15, 80]]],
  ['INFRA', 'Organizar datasheets da bancada 2', 'admin', 7, 5, [[5, 17, 55]]],
  ['NACQ', 'Revisar BOM da fonte auxiliar', 'trabalho', 9, 7, [[7, 10, 120]]],
  ['CF03B04', 'Levantar curva de eficiência rev B', 'trabalho', 16, 13, [[14, 9, 200], [13, 14, 130]]],
];
for (const [p, titulo, kind, criadaD, fimD, sess] of feitos) {
  const id = tarefa({
    proj: p, titulo, kind, status: 'feito',
    criada: em(criadaD, 9), fila: em(criadaD - 1, 9),
    inicio: em(sess[0][0], sess[0][1]), fim: em(fimD, 17),
  });
  for (const [d, h, m] of sess) sessao(id, em(d, h), m);
}

// ── reuniões e admin dos últimos 15 dias úteis ─────────────────────────────
// A proporção importa: um engenheiro real passa 20-30% do tempo em reunião, e
// é exatamente esse número que o app existe para mostrar. Com 3% o relatório
// não diria nada.
const ROTINA = [
  ['Daily do time de hardware', 'reuniao', null, 20, 1.0],
  ['Revisão de projeto — CF03B04', 'reuniao', 'CF03B04', 75, 0.55],
  ['Alinhamento com produção', 'reuniao', 'NACQ', 45, 0.5],
  ['Comitê de mudança de engenharia', 'reuniao', null, 60, 0.3],
  ['E-mails e aprovações', 'admin', 'INFRA', 35, 0.7],
  ['Suporte à produção — linha 3', 'admin', 'NACQ', 40, 0.3],
];
for (let d = 15; d >= 1; d--) {
  if (ehFimDeSemana(em(d, 9))) continue;
  let hora = 8;
  for (const [titulo, kind, p, dur, chance] of ROTINA) {
    if (rnd() > chance) continue;
    const min = Math.round(dur * (0.7 + rnd() * 0.6));
    const id = tarefa({
      proj: p, titulo, kind, status: 'feito',
      criada: em(d, 8, 15), fila: em(d, 8, 15), inicio: em(d, hora), fim: em(d, hora, min),
    });
    sessao(id, em(d, hora, Math.floor(rnd() * 15)), min);
    hora += Math.max(1, Math.ceil(min / 60));
    if (hora > 16) break;
  }
}

// ── blocos de foco nas tarefas em curso, para a semana ter volume real ─────
// Um dia de engenharia tem 5-7 h medidas, não 45 min.
for (let d = 14; d >= 1; d--) {
  const dia = em(d, 9);
  if (ehFimDeSemana(dia)) continue;
  const alvo = escolhe([termico, snubber, dfmea === undefined ? termico : snubber]);
  sessao(alvo, em(d, 10, 30 + Math.floor(rnd() * 25)), 70 + Math.floor(rnd() * 55));
  sessao(alvo, em(d, 14, 30 + Math.floor(rnd() * 30)), 80 + Math.floor(rnd() * 60));
}

// ── a sessão que está RODANDO agora ────────────────────────────────────────
// Exatamente uma: o índice único do banco não permitiria mais.
const inicioAberta = new Date(AGORA.getTime() - 47 * 60000);
insSess.run(termico, iso(inicioAberta), null, TZ, 'auto', null, iso(inicioAberta));
db.prepare(`UPDATE tasks SET status = 'fazendo' WHERE id = ?`).run(termico);

// ── conferência ────────────────────────────────────────────────────────────
const abertas = db.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE ended_at IS NULL`).get().n;
const horas = db.prepare(
  `SELECT ROUND(SUM((julianday(ended_at)-julianday(started_at))*24), 1) AS h
     FROM sessions WHERE ended_at IS NOT NULL`).get().h;
const porStatus = db.prepare(
  `SELECT status, COUNT(*) AS n FROM tasks GROUP BY status ORDER BY status`).all();

console.log(`\n  ${arquivo}\n`);
console.log(`  projetos ......... ${conta('projects')}`);
for (const s of porStatus) console.log(`  ${s.status.padEnd(16, '.')} ${s.n}`);
console.log(`  sessões .......... ${conta('sessions')}  (${horas} h registradas)`);
const mix = db.prepare(
  `SELECT t.kind, ROUND(100.0*SUM(julianday(s.ended_at)-julianday(s.started_at)) /
          (SELECT SUM(julianday(ended_at)-julianday(started_at)) FROM sessions WHERE ended_at IS NOT NULL)) AS pct
     FROM sessions s JOIN tasks t ON t.id=s.task_id
    WHERE s.ended_at IS NOT NULL GROUP BY t.kind ORDER BY pct DESC`).all();
console.log(`  mistura .......... ${mix.map((m) => `${m.kind} ${m.pct}%`).join('  ')}`);
console.log(`  rodando agora .... ${abertas}`);
if (abertas !== 1) { console.error('\n  ERRO: deveria haver exatamente 1 sessão aberta.'); process.exit(1); }
console.log('\n  pronto — abra o app.\n');
db.close();
