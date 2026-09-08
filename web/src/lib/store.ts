// Estado compartilhado. Refs de módulo + funções exportadas, sem Pinia.
// O dado real mora no SQLite; isto aqui é só o que a UI precisa lembrar
// entre telas (dia selecionado, projetos carregados).

import { ref, computed } from 'vue';
import type { BoardCard, DayEntry, DayTotals, Project } from './types';
import * as api from './db';
import { dayKey, type DayKey } from './tempo';
import { toast } from './toast';

export const diaAtual = ref<DayKey>(dayKey());
export const projetos = ref<Project[]>([]);
export const entradas = ref<DayEntry[]>([]);
export const totais = ref<DayTotals>({ total: 0, foco: 0, reuniao: 0, admin: 0, pendente: 0 });
export const cards = ref<BoardCard[]>([]);
export const carregando = ref(false);

export const pendentes = computed(() => entradas.value.filter((e) => !e.confirmed_at));

export async function carregaProjetos(): Promise<void> {
  projetos.value = await api.listProjects();
}

/** Sequência da última carga pedida. Resposta atrasada de um dia antigo é descartada. */
let seqDia = 0;

export async function carregaDia(key: DayKey = diaAtual.value): Promise<void> {
  const meu = ++seqDia;
  diaAtual.value = key;
  carregando.value = true;
  try {
    // Uma ida só, e as duas leituras do MESMO instante — antes eram dois awaits
    // independentes, então clicar rápido em '<' deixava entradas de um dia e
    // totais de outro.
    const [e, t] = await Promise.all([api.entriesForDay(key), api.dayTotals(key)]);
    if (meu !== seqDia) return;
    entradas.value = e;
    totais.value = t;
  } catch (err) {
    if (meu === seqDia) toast.erro(api.dbErro(err));
  } finally {
    if (meu === seqDia) carregando.value = false;
  }
}

export async function carregaQuadro(): Promise<void> {
  carregando.value = true;
  try {
    cards.value = await api.boardCards();
  } catch (e) {
    toast.erro(api.dbErro(e));
  } finally {
    carregando.value = false;
  }
}

export function projetoDe(id: number | null): Project | undefined {
  return id == null ? undefined : projetos.value.find((p) => p.id === id);
}
