// A reactive clock for the whole app.
//
// It exists because `new Date()` inside a computed is not reactive: the computed
// never gets dirty and the value freezes on the first render. That was exactly
// the bug in the timeline's "now" line.

import { useNow } from '@vueuse/core';

/** 1s tick: the duration of the session running right now. */
export const now = useNow({ interval: 1000 });

/** hh:mm:ss elapsed since an instant. */
export function fmtElapsed(sinceIso: string, until: Date): string {
  const s = Math.max(0, Math.floor((until.getTime() - new Date(sinceIso).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Elapsed minutes, to add to the live day total. */
export function elapsedMinutes(sinceIso: string, until: Date): number {
  return Math.max(0, Math.round((until.getTime() - new Date(sinceIso).getTime()) / 60000));
}
