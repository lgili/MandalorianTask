// Toast: singleton with a module ref. Same pattern as the eBOM generator —
// simple, no global store, and ToastHost only renders.

import { ref } from 'vue';

export type Tone = 'ok' | 'error' | 'warning';
export interface Toast { id: number; msg: string; tone: Tone }

export const toasts = ref<Toast[]>([]);
let seq = 0;

function push(msg: string, tone: Tone, ms: number): void {
  const id = ++seq;
  toasts.value.push({ id, msg, tone });
  if (toasts.value.length > 4) toasts.value.shift();
  setTimeout(() => { toasts.value = toasts.value.filter((t) => t.id !== id); }, ms);
}

export const toast = {
  ok:      (m: string) => push(m, 'ok', 3000),
  // Errors stay longer: they are what the person needs to read.
  error:   (m: string) => push(m, 'error', 6000),
  warning: (m: string) => push(m, 'warning', 4500),
};
