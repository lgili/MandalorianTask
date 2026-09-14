// Shortcut guards, in one place.
//
// The problem this solves: the Capture screen keeps the cursor in the capture field
// all the time (that is the point of the screen). If single-key shortcuts were blocked
// inside text fields — and they have to be, or typing "1" would navigate —,
// the main screen would become a keyboard dead end.
//
// Solution: TWO levels.
//   Alt+1..4  ALWAYS navigates, even while typing. It is the escape hatch.
//   1..4      navigates only outside a field. It is the comfortable path.
//   Esc       leaves the field, and then the bare keys work again.

import { ref } from 'vue';

/** Modals open right now. While > 0, global shortcuts don't fire. */
export const openModals = ref(0);

export function isTextField(el: Element | null = document.activeElement): boolean {
  if (!el) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      || el instanceof HTMLSelectElement) return true;
  return el instanceof HTMLElement && el.isContentEditable;
}

/** A single-key shortcut must not compete with Cmd+A, the browser's Ctrl+1, etc. */
export function hasModifier(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey || e.altKey;
}

/** Bare key (no modifier), outside a field and with no modal. */
export function canUseBareShortcut(e: KeyboardEvent): boolean {
  return !hasModifier(e) && !isTextField() && openModals.value === 0;
}

/** Alt+key: works even with the cursor in a field. The escape hatch. */
export function isEscapeHatch(e: KeyboardEvent, key: string): boolean {
  return e.altKey && !e.ctrlKey && !e.metaKey && e.key === key && openModals.value === 0;
}
