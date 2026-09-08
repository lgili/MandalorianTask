// Um relógio reativo para o app inteiro.
//
// Existe porque `new Date()` dentro de um computed não é reativo: o computed
// nunca fica sujo e o valor congela na primeira renderização. Foi exatamente
// esse bug na linha do "agora" da timeline.

import { useNow } from '@vueuse/core';

/** Tick de 1s: a duração da sessão que roda agora. */
export const agora = useNow({ interval: 1000 });

/** hh:mm:ss decorrido desde um instante. */
export function decorrido(desdeIso: string, ate: Date): string {
  const s = Math.max(0, Math.floor((ate.getTime() - new Date(desdeIso).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Minutos decorridos, para somar ao total do dia ao vivo. */
export function minutosDecorridos(desdeIso: string, ate: Date): number {
  return Math.max(0, Math.round((ate.getTime() - new Date(desdeIso).getTime()) / 60000));
}
