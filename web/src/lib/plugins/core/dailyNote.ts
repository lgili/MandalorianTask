// Plugin de núcleo: Nota do dia.
//
// A nota diária do Obsidian, com o que só o Bancada sabe: o trabalho que o
// quadro MEDIU hoje entra na nota sozinho. Escrito só com a API pública —
// nada de import de dentro do app. É a prova de que a API basta.

import type { Bancada, DefinicaoPlugin, Manifesto, ProjetoInfo, SessaoInfo } from '../types';

export const manifesto: Manifesto = {
  id: 'nota-do-dia',
  nome: 'Nota do dia',
  versao: '1.0.0',
  descricao: 'Uma nota por dia em Diário/, já com as sessões de trabalho que o quadro mediu.',
  autor: 'Bancada',
};

const p2 = (n: number) => String(n).padStart(2, '0');
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const hhmm = (iso: string) => { const d = new Date(iso); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
function duracao(ini: string, fim: string): string {
  const m = Math.max(0, Math.round((new Date(fim).getTime() - new Date(ini).getTime()) / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${p2(m % 60)}`;
}

/** Uma linha por sessão: horário, tarefa, projeto e duração. */
export function blocoDoTrabalho(sessoes: SessaoInfo[], projetos: ProjetoInfo[], agora = new Date()): string {
  if (!sessoes.length) return '_Nenhuma sessão medida ainda hoje._';
  return sessoes.map((s) => {
    const p = projetos.find((x) => x.id === s.projeto);
    const fim = s.fim ?? agora.toISOString();
    const proj = p ? ` · ${p.codigo ?? p.nome}` : '';
    return `- ${hhmm(s.inicio)}–${s.fim ? hhmm(s.fim) : 'agora'} · ${s.titulo}${proj} (${duracao(s.inicio, fim)})`;
  }).join('\n');
}

export const definicao: DefinicaoPlugin = {
  aoLigar(b: Bancada) {
    b.comandos.adiciona({
      id: 'abrir',
      nome: 'Abrir a nota de hoje',
      async executa() {
        const path = `Diário/${hoje()}.md`;
        if (!(await b.notas.existe(path))) {
          const sessoes = await b.tarefas.sessoesDoDia();
          await b.notas.escreve(path, `## Trabalho de hoje\n${blocoDoTrabalho(sessoes, b.projetos.lista())}\n\n## Notas\n\n`);
        }
        b.notas.abre(path);
      },
    });

    b.comandos.adiciona({
      id: 'inserir-trabalho',
      nome: 'Inserir o trabalho de hoje na nota aberta',
      async executa() {
        const path = b.notas.aberta();
        if (!path) { b.ui.toast('Abra uma nota primeiro.', 'aviso'); return; }
        const texto = await b.notas.le(path);
        const sessoes = await b.tarefas.sessoesDoDia();
        const bloco = blocoDoTrabalho(sessoes, b.projetos.lista());
        await b.notas.escreve(path, `${texto.replace(/\s*$/, '')}\n\n## Trabalho de hoje\n${bloco}\n`);
        b.ui.toast(`${sessoes.length} ${sessoes.length === 1 ? 'sessão inserida' : 'sessões inseridas'}`);
      },
    });
  },
};
