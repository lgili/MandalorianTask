// Extensões de editor vindas de plugins.
//
// O editor lê esta lista num Compartment e se reconfigura quando ela muda —
// ligar ou desligar um plugin muda o editor aberto na hora, sem recarregar a
// nota. É o equivalente ao `registerEditorExtension` do Obsidian.

import { shallowRef } from 'vue';
import type { Extension } from '@codemirror/state';

export const extensoesDePlugin = shallowRef<Array<{ dono: string; ext: Extension }>>([]);

export function registraExtensao(dono: string, ext: Extension): () => void {
  const item = { dono, ext };
  extensoesDePlugin.value = [...extensoesDePlugin.value, item];
  return () => { extensoesDePlugin.value = extensoesDePlugin.value.filter((x) => x !== item); };
}
