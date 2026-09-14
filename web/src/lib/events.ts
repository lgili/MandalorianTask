// What happens in the app, announced in one place.
//
// It exists because of plugins: this is how third-party code finds out that a
// note was saved or that a work session started, without anyone importing
// store.ts or poking at an internal ref. The app emits; plugins listen.
//
// The TIME events are what only Bancada has — no other notes app knows when
// you started working on a task. It is the most valuable API a plugin here
// can have.

export interface AppEvents {
  'note:opened': { path: string };
  'note:saved': { path: string; text: string };
  'note:created': { path: string };
  'note:deleted': { path: string };
  'note:renamed': { from: string; to: string };
  /** Changed OUTSIDE the app — Obsidian, git, Dropbox. The open editor reloads. */
  'note:external': { path: string };
  'vault:synced': { total: number };
  'task:created': { id: number; title: string; project: number | null };
  'task:moved': { id: number; from: string | null; to: string };
  'session:started': { task: number; title: string };
  'session:stopped': { task: number | null };
}

export type EventName = keyof AppEvents;
type Listener<K extends EventName> = (payload: AppEvents[K]) => void;

const listeners = new Map<EventName, Set<Listener<EventName>>>();

/** Returns the unsubscribe function — a plugin that forgets to call it leaks. */
export function onEvent<K extends EventName>(name: K, fn: Listener<K>): () => void {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name)!.add(fn as Listener<EventName>);
  return () => { listeners.get(name)?.delete(fn as Listener<EventName>); };
}

/**
 * A listener that blows up must not take down the app or silence the others.
 * A buggy third-party plugin is the normal case, not the exception.
 */
export function emitEvent<K extends EventName>(name: K, payload: AppEvents[K]): void {
  for (const fn of listeners.get(name) ?? []) {
    try { fn(payload); } catch (e) { console.error(`[event ${name}]`, e); }
  }
}
