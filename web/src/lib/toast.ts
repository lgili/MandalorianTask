// Toast: singleton com ref de módulo. Mesmo padrão do eBOM generator —
// simples, sem store global, e o ToastHost só renderiza.

import { ref } from 'vue';

export type Tom = 'ok' | 'erro' | 'aviso';
export interface Toast { id: number; msg: string; tom: Tom }

export const toasts = ref<Toast[]>([]);
let seq = 0;

function push(msg: string, tom: Tom, ms: number): void {
  const id = ++seq;
  toasts.value.push({ id, msg, tom });
  if (toasts.value.length > 4) toasts.value.shift();
  setTimeout(() => { toasts.value = toasts.value.filter((t) => t.id !== id); }, ms);
}

export const toast = {
  ok:    (m: string) => push(m, 'ok', 3000),
  // Erro fica mais tempo: é o que a pessoa precisa ler.
  erro:  (m: string) => push(m, 'erro', 6000),
  aviso: (m: string) => push(m, 'aviso', 4500),
};
