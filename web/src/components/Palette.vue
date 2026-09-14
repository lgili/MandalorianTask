<script setup lang="ts">
// The palette: one field, everything there is.
//
// Ctrl+K searches notes, projects and tasks AT THE SAME TIME — the question
// "where did I write down that snubber thing?" shouldn't require knowing first
// whether "that thing" became a note, a task or a project. Ctrl+P (or `>` at the
// start) switches to commands: what the app and the plugins know how to do.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useDebounceFn } from '@vueuse/core';
import { FileText, FolderKanban, CheckSquare, Terminal, Search } from 'lucide-vue-next';
import ProjectChip from './ProjectChip.vue';
import type { SearchResult } from '../lib/types';
import * as api from '../lib/db';
import { openTaskDetail, palette, projects, tasks } from '../lib/store';
import { notes } from '../lib/notes';
import { rankProjects } from '../lib/projects';
import { commands, runCommand } from '../lib/commands';
import { openModals } from '../lib/keyboard';
import { toast } from '../lib/toast';

const router = useRouter();
const inputEl = ref<HTMLInputElement | null>(null);
const q = ref(palette.value === 'commands' ? '> ' : '');
const activeIndex = ref(0);
const noteHits = ref<SearchResult[]>([]);

const inCommands = computed(() => q.value.trimStart().startsWith('>'));
const term = computed(() => (inCommands.value ? q.value.trimStart().slice(1) : q.value).trim());

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
/** Every word of the search appears in the text, in any order. */
const matchesAll = (text: string, t: string) => norm(t).split(/\s+/).filter(Boolean).every((w) => norm(text).includes(w));

const debouncedNoteSearch = useDebounceFn(async (t: string) => {
  noteHits.value = t ? await api.searchNotes(t, 8) : [];
}, 90);
watch(term, (t) => { if (!inCommands.value) void debouncedNoteSearch(t); }, { immediate: true });

type Item =
  | { kind: 'note'; key: string; title: string; detail: string; color: string | null; snippet?: string; path: string }
  | { kind: 'project'; key: string; title: string; detail: string; color: string | null; id: number }
  | { kind: 'task'; key: string; title: string; detail: string; color: string | null; id: number }
  | { kind: 'command'; key: string; title: string; detail: string; color: null; id: string };

const items = computed<Item[]>(() => {
  if (inCommands.value) {
    // A name that contains the search as typed ranks first: "today's note"
    // should put "Open today's note" above "Insert today's work into the open
    // note", which matches the same words scattered. Then alphabetical.
    const phrase = norm(term.value).replace(/\s+/g, ' ');
    const scattered = (name: string) => (norm(name).includes(phrase) ? 0 : 1);
    return commands.value
      .filter((c) => !term.value || matchesAll(c.name, term.value))
      .sort((a, b) => scattered(a.name) - scattered(b.name) || a.name.localeCompare(b.name, 'en'))
      .map((c) => ({ kind: 'command', key: `c:${c.id}`, title: c.name,
        detail: c.owner === 'bancada' ? (c.shortcut ?? '') : c.owner, color: null, id: c.id }));
  }

  const t = term.value;
  const out: Item[] = [];

  // notes: with a term, the FTS; without one, the most recently edited
  const noteSource = t
    ? noteHits.value.map((r) => ({ r, n: notes.value.find((n) => n.path === r.path) }))
    : notes.value.slice(0, 5).map((n) => ({ r: null, n }));
  for (const { r, n } of noteSource) {
    const path = r?.path ?? n!.path;
    out.push({ kind: 'note', key: `n:${path}`, title: r?.title ?? n!.title,
      detail: path.split('/').slice(0, -1).join('/'), color: n?.project_color ?? null,
      snippet: r?.snippet, path });
  }

  for (const p of (t ? rankProjects(t, projects.value) : projects.value).slice(0, t ? 5 : 3)) {
    out.push({ kind: 'project', key: `p:${p.id}`, title: p.name,
      detail: `${p.open_count} open`, color: p.color, id: p.id });
  }

  const live = tasks.value.filter((x) => x.status !== 'done');
  const taskSource = t ? tasks.value.filter((x) => matchesAll(x.title, t)) : live.filter((x) => x.status !== 'backlog');
  for (const x of taskSource.slice(0, t ? 6 : 4)) {
    out.push({ kind: 'task', key: `t:${x.id}`, title: x.title,
      detail: ({ backlog: 'capture', queued: 'queued', doing: 'doing', done: 'done' } as const)[x.status],
      color: x.project_color, id: x.id });
  }
  return out;
});

watch(items, () => { activeIndex.value = 0; });

const GROUP = { note: 'Notes', project: 'Projects', task: 'Tasks', command: 'Commands' } as const;
const ICON = { note: FileText, project: FolderKanban, task: CheckSquare, command: Terminal } as const;

function closePalette(): void { palette.value = null; }

async function pick(it: Item | undefined): Promise<void> {
  if (!it) return;
  closePalette();
  if (it.kind === 'note') router.push({ name: 'notes', query: { note: it.path } });
  else if (it.kind === 'project') router.push(`/project/${it.id}`);
  else if (it.kind === 'task') openTaskDetail(it.id);
  else {
    try { await runCommand(it.id); } catch (e) { toast.error(`The command failed: ${e instanceof Error ? e.message : String(e)}`); }
  }
}

function onKeydown(e: KeyboardEvent): void {
  const n = items.value.length;
  if (e.key === 'ArrowDown') { e.preventDefault(); if (n) activeIndex.value = (activeIndex.value + 1) % n; }
  else if (e.key === 'ArrowUp') { e.preventDefault(); if (n) activeIndex.value = (activeIndex.value - 1 + n) % n; }
  else if (e.key === 'Enter') { e.preventDefault(); void pick(items.value[activeIndex.value]); }
  else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
}

/** FTS snippet: the matched terms come between control characters 2 and 3. */
const MARK_START = String.fromCharCode(2);
const MARK_END = String.fromCharCode(3);
function snippetParts(t: string): Array<{ s: string; highlight: boolean }> {
  const out: Array<{ s: string; highlight: boolean }> = [];
  let i = 0;
  while (i < t.length) {
    const a = t.indexOf(MARK_START, i);
    if (a < 0) { out.push({ s: t.slice(i), highlight: false }); break; }
    if (a > i) out.push({ s: t.slice(i, a), highlight: false });
    const b = t.indexOf(MARK_END, a + 1);
    if (b < 0) { out.push({ s: t.slice(a + 1), highlight: false }); break; }
    out.push({ s: t.slice(a + 1, b), highlight: true });
    i = b + 1;
  }
  return out;
}

onMounted(async () => {
  openModals.value++;
  await nextTick();
  inputEl.value?.focus();
  if (inCommands.value) inputEl.value?.setSelectionRange(q.value.length, q.value.length);
});
onBeforeUnmount(() => { openModals.value = Math.max(0, openModals.value - 1); });
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[14vh]" @click.self="closePalette">
    <div class="panel w-[640px] max-w-[92vw] overflow-hidden shadow-pop">
      <div class="flex items-center gap-2.5 border-b border-rule px-4">
        <Terminal v-if="inCommands" class="h-4 w-4 flex-none text-accent-ink" />
        <Search v-else class="h-4 w-4 flex-none text-fg-subtle" />
        <input ref="inputEl" v-model="q" spellcheck="false" autocomplete="off"
          class="h-12 min-w-0 flex-1 bg-transparent text-[16px] text-fg outline-none placeholder:text-fg-subtle focus-visible:ring-0"
          :placeholder="inCommands ? 'what to do…' : 'search notes, projects and tasks…'"
          @keydown="onKeydown">
        <span class="mono flex-none text-[11px] text-fg-subtle">{{ inCommands ? 'commands' : '> for commands' }}</span>
      </div>

      <div class="max-h-[52vh] overflow-y-auto py-1">
        <p v-if="!items.length" class="px-4 py-6 text-center text-[14px] text-fg-subtle">
          {{ inCommands ? 'No command by that name.' : `Nothing for “${term}”.` }}
        </p>

        <template v-for="(it, i) in items" :key="it.key">
          <div v-if="i === 0 || items[i - 1].kind !== it.kind"
            class="label px-4 pb-1 pt-3 !text-[11px]">{{ GROUP[it.kind] }}</div>
          <button type="button"
            class="flex w-full items-start gap-3 px-4 py-2 text-left transition-colors"
            :class="i === activeIndex ? 'bg-surface-3' : 'hover:bg-surface-3/50'"
            @mouseenter="activeIndex = i" @click="pick(it)">
            <span class="mt-[3px] flex h-4 w-4 flex-none items-center justify-center">
              <ProjectChip v-if="it.color" variant="dot" :color="it.color" />
              <component :is="ICON[it.kind]" v-else class="h-3.5 w-3.5 text-fg-subtle" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[14px] text-fg">{{ it.title }}</span>
              <span v-if="it.kind === 'note' && it.snippet" class="mt-0.5 block truncate text-[12px] text-fg-subtle">
                <template v-for="(p, k) in snippetParts(it.snippet)" :key="k">
                  <mark v-if="p.highlight" class="rounded-sm bg-accent/25 px-0.5 text-fg">{{ p.s }}</mark>
                  <template v-else>{{ p.s }}</template>
                </template>
              </span>
            </span>
            <span class="mono mt-[3px] flex-none truncate text-[11px] text-fg-subtle">{{ it.detail }}</span>
          </button>
        </template>
      </div>

      <div class="flex items-center gap-3 border-t border-rule bg-surface-2/60 px-4 py-1.5 font-mono text-[11px] text-fg-subtle">
        <span>↑↓ navigate</span><span>⏎ open</span><span>esc close</span>
        <span class="ml-auto">ctrl+k search · ctrl+p commands</span>
      </div>
    </div>
  </div>
</template>
