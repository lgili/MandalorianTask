// Command registry: everything the app knows how to do, with a name, in one place.
//
// The palette (Ctrl+P) lists these. The app registers its own at startup; plugins
// register theirs through the API. It is Obsidian's `addCommand` — the simplest
// way in for a plugin: a function and a name.

import { shallowRef } from 'vue';

export interface Command {
  id: string;
  name: string;
  /** 'bancada' for the app's own; the plugin id for third-party ones. */
  owner: string;
  /** Display only — the real shortcut is registered elsewhere. */
  shortcut?: string;
  run: () => void | Promise<void>;
}

export const commands = shallowRef<Command[]>([]);

/** Returns the function that removes it. A repeated id replaces the previous one. */
export function registerCommand(c: Command): () => void {
  commands.value = [...commands.value.filter((x) => x.id !== c.id), c];
  return () => { commands.value = commands.value.filter((x) => x !== c); };
}

export async function runCommand(id: string): Promise<void> {
  const c = commands.value.find((x) => x.id === id);
  if (!c) return;
  try {
    await c.run();
  } catch (e) {
    // A buggy plugin command does not take down the app.
    console.error(`[command ${id}]`, e);
    throw e;
  }
}
