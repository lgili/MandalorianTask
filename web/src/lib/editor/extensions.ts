// Editor extensions that come from plugins.
//
// The editor reads this list into a Compartment and reconfigures itself when it
// changes — enabling or disabling a plugin changes the open editor right away,
// without reloading the note. It is the equivalent of Obsidian's `registerEditorExtension`.

import { shallowRef } from 'vue';
import type { Extension } from '@codemirror/state';

export const pluginExtensions = shallowRef<Array<{ owner: string; ext: Extension }>>([]);

export function registerExtension(owner: string, ext: Extension): () => void {
  const item = { owner, ext };
  pluginExtensions.value = [...pluginExtensions.value, item];
  return () => { pluginExtensions.value = pluginExtensions.value.filter((x) => x !== item); };
}
