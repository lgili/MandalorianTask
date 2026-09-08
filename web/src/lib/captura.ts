// Gramática da linha de captura.
//
// EXATAMENTE dois tokens. Mais que dois e ninguém lembra no meio de uma
// reunião — que é o único momento em que esta tela é usada.
//
//   #cf03    projeto, casando por prefixo em código ou nome
//   !qui     prazo: hoje | amanha | seg..dom | 12/09 | +3d
//
// Regra inegociável: NUNCA existe erro de validação aqui. Token que não casa
// vira texto comum e a tarefa é criada assim mesmo. Interromper alguém com
// uma mensagem de erro durante uma reunião é pior que perder o metadado.

import type { Project } from './types';
import { dayKey, parseDayKey } from './tempo';

export interface Analise {
  titulo: string;
  projeto: Project | null;
  /** UTC ISO no meio-dia local — prazo é dia, não instante. */
  prazo: string | null;
  /** Tokens escritos que não casaram com nada. Só para feedback sutil. */
  ignorados: string[];
}

const DIAS: Record<string, number> = {
  dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6, 'sáb': 6,
};

/** Prazo é um DIA. Guardamos meio-dia local para não escorregar de fuso. */
function meioDia(d: Date): string {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  return x.toISOString();
}

export function analisaPrazo(token: string, hoje = new Date()): string | null {
  const t = token.toLowerCase();

  if (t === 'hoje') return meioDia(hoje);
  if (t === 'amanha' || t === 'amanhã') {
    const d = new Date(hoje); d.setDate(d.getDate() + 1); return meioDia(d);
  }

  // +3d — daqui a N dias
  const rel = t.match(/^\+(\d+)d?$/);
  if (rel) {
    const d = new Date(hoje); d.setDate(d.getDate() + Number(rel[1])); return meioDia(d);
  }

  // seg..dom — o PRÓXIMO desse dia da semana (hoje não conta: "sex" na sexta
  // quer dizer a sexta que vem, não agora)
  if (t in DIAS) {
    const alvo = DIAS[t];
    const d = new Date(hoje);
    const delta = ((alvo - d.getDay() + 7) % 7) || 7;
    d.setDate(d.getDate() + delta);
    return meioDia(d);
  }

  // 12/09 ou 12/09/2026
  const br = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (br) {
    const dia = Number(br[1]), mes = Number(br[2]);
    if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
    let ano = br[3] ? Number(br[3]) : hoje.getFullYear();
    if (ano < 100) ano += 2000;
    const d = parseDayKey(`${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`);
    // dia inválido tipo 31/02 rola para março — recusa em vez de aceitar errado
    if (d.getMonth() + 1 !== mes || d.getDate() !== dia) return null;
    // sem ano explícito e a data já passou: é do ano que vem
    if (!br[3] && dayKey(d) < dayKey(hoje)) d.setFullYear(d.getFullYear() + 1);
    return meioDia(d);
  }

  return null;
}

/** Casa por prefixo em código, depois em nome. Ambíguo => não casa. */
export function achaProjeto(token: string, projetos: Project[]): Project | null {
  const t = token.toLowerCase();
  if (!t) return null;
  const porCodigo = projetos.filter((p) => p.code?.toLowerCase().startsWith(t));
  if (porCodigo.length === 1) return porCodigo[0];
  const porNome = projetos.filter((p) => p.name.toLowerCase().startsWith(t));
  if (porNome.length === 1) return porNome[0];
  // prefixo ambíguo: preferir errar por não marcar do que por marcar errado
  return null;
}

export function analisa(linha: string, projetos: Project[], hoje = new Date()): Analise {
  const ignorados: string[] = [];
  let projeto: Project | null = null;
  let prazo: string | null = null;

  const palavras = linha.trim().split(/\s+/);
  const restantes: string[] = [];

  for (const w of palavras) {
    if (w.startsWith('#') && w.length > 1 && !projeto) {
      const p = achaProjeto(w.slice(1), projetos);
      if (p) { projeto = p; continue; }
      ignorados.push(w);
      restantes.push(w);            // não casou: vira texto, não some
      continue;
    }
    if (w.startsWith('!') && w.length > 1 && !prazo) {
      const d = analisaPrazo(w.slice(1), hoje);
      if (d) { prazo = d; continue; }
      ignorados.push(w);
      restantes.push(w);
      continue;
    }
    restantes.push(w);
  }

  return { titulo: restantes.join(' ').trim(), projeto, prazo, ignorados };
}
