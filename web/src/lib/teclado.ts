// Guardas de atalho, num lugar só.
//
// O problema que isto resolve: o Backlog mantém o cursor no campo de captura
// o tempo todo (é o ponto da tela). Se atalho de tecla única fosse bloqueado
// dentro de campo de texto — e precisa ser, senão digitar "1" navegaria —,
// a tela principal viraria um beco sem saída de teclado.
//
// Solução: DOIS níveis.
//   Alt+1..4  navega SEMPRE, inclusive digitando. É o caminho de fuga.
//   1..4      navega só fora de campo. É o caminho confortável.
//   Esc       sai do campo, e aí as teclas nuas voltam a valer.

import { ref } from 'vue';

/** Modais abertos agora. Enquanto > 0, atalho global não dispara. */
export const modaisAbertos = ref(0);

export function ehCampoDeTexto(el: Element | null = document.activeElement): boolean {
  if (!el) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      || el instanceof HTMLSelectElement) return true;
  return el instanceof HTMLElement && el.isContentEditable;
}

/** Atalho de tecla única não pode competir com Cmd+A, Ctrl+1 do navegador etc. */
export function comModificador(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey || e.altKey;
}

/** Tecla nua (sem modificador), fora de campo e sem modal. */
export function podeAtalho(e: KeyboardEvent): boolean {
  return !comModificador(e) && !ehCampoDeTexto() && modaisAbertos.value === 0;
}

/** Alt+tecla: funciona mesmo com o cursor num campo. O caminho de fuga. */
export function ehAtalhoDeFuga(e: KeyboardEvent, tecla: string): boolean {
  return e.altKey && !e.ctrlKey && !e.metaKey && e.key === tecla && modaisAbertos.value === 0;
}
