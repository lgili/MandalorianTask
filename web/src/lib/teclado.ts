// Guardas de atalho, num lugar só.
//
// Existem porque atalho de uma tecla ("a", "1".."5") é ótimo até disparar
// enquanto a pessoa digita, ou enquanto um modal está aberto.

import { ref } from 'vue';

/** Modais abertos agora. Enquanto > 0, atalho global não dispara. */
export const modaisAbertos = ref(0);

/**
 * O elemento focado aceita digitação?
 * Inclui <select> — seta e letra navegam as opções — e contenteditable.
 */
export function ehCampoDeTexto(el: Element | null = document.activeElement): boolean {
  if (!el) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      || el instanceof HTMLSelectElement) return true;
  return el instanceof HTMLElement && el.isContentEditable;
}

/** Atalho de tecla única não deve competir com Cmd+A, Ctrl+1 etc. */
export function comModificador(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey || e.altKey;
}

/** Pode disparar um atalho de tecla única agora? */
export function podeAtalho(e: KeyboardEvent): boolean {
  return !comModificador(e) && !ehCampoDeTexto() && modaisAbertos.value === 0;
}
