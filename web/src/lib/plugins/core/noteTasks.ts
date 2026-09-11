// Plugin de núcleo: Tarefas da nota.
//
// A ata da reunião tem cinco `- [ ]` de ação. Um comando e elas viram
// tarefas no Bancada, já no projeto da nota. É a ponte entre as duas metades
// do app: o que se ANOTA vira o que se FAZ, sem redigitar.

import type { Bancada, DefinicaoPlugin, Manifesto } from '../types';

export const manifesto: Manifesto = {
  id: 'tarefas-da-nota',
  nome: 'Tarefas da nota',
  versao: '1.0.0',
  descricao: 'Transforma as caixas "- [ ]" da nota aberta em tarefas, no projeto da nota.',
  autor: 'Bancada',
};

const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** `[[alvo|apelido]]` -> apelido; `[[alvo]]` -> alvo. Título de tarefa não tem colchete. */
const semLinks = (s: string) => s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a: string, b?: string) => b ?? a);

/** Caixas ABERTAS da nota, fora de bloco de código. */
export function caixasAbertas(md: string): string[] {
  const out: string[] = [];
  let emCodigo = false;
  for (const linha of md.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(linha)) { emCodigo = !emCodigo; continue; }
    if (emCodigo) continue;
    const m = linha.match(/^\s*[-*+] \[ \] (.+)$/);
    if (m) {
      const t = semLinks(m[1]).trim();
      if (t) out.push(t);
    }
  }
  return out;
}

export const definicao: DefinicaoPlugin = {
  aoLigar(b: Bancada) {
    b.comandos.adiciona({
      id: 'criar',
      nome: 'Criar tarefas a partir das caixas desta nota',
      async executa() {
        const path = b.notas.aberta();
        if (!path) { b.ui.toast('Abra uma nota primeiro.', 'aviso'); return; }
        const caixas = caixasAbertas(await b.notas.le(path));
        if (!caixas.length) { b.ui.toast('Esta nota não tem caixas abertas.', 'aviso'); return; }

        const projeto = b.notas.lista().find((n) => n.path === path)?.projeto ?? null;
        // Rodar o comando duas vezes não pode duplicar: compara com o que já existe.
        const existentes = new Set(b.tarefas.lista().map((t) => semAcento(t.titulo)));
        const novas = caixas.filter((c) => !existentes.has(semAcento(c)));
        for (const titulo of novas) await b.tarefas.cria({ titulo, projeto });

        const repetidas = caixas.length - novas.length;
        if (!novas.length) b.ui.toast('Todas as caixas já viraram tarefa.');
        else b.ui.toast(`${novas.length} ${novas.length === 1 ? 'tarefa criada' : 'tarefas criadas'}`
          + (repetidas ? ` · ${repetidas} já existia${repetidas === 1 ? '' : 'm'}` : ''));
      },
    });
  },
};
