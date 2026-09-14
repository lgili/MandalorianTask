<script setup lang="ts">
// Notes: the markdown vault.
//
// The .md files in a folder are the TRUTH; SQLite keeps only a rebuildable
// index (notes + FTS5). Real Obsidian opens the same vault, and the notes stay
// readable the day this app dies. (Decision from v0.3, kept.)
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { useDebounceFn } from '@vueuse/core';
import { FolderOpen, FilePlus, Search, Trash2, X, Link2, FolderPlus } from 'lucide-vue-next';
import NoteTree from '../components/NoteTree.vue';
import ProjectChip from '../components/ProjectChip.vue';
import MarkdownEditor from '../components/MarkdownEditor.vue';
import type { NoteSummary, SearchResult } from '../lib/types';
import * as api from '../lib/db';
import {
  deleteNote, createNote, createDefaultVault, pickVault, readNote, listBacklinks, activeNote, notes, renameNote,
  resolve, saveNote, followLink, syncing, vaultPath,
} from '../lib/notes';
import { noteName } from '../lib/markdown';
import { emitEvent, onEvent } from '../lib/events';
import { toast } from '../lib/toast';
import { fmtRelative } from '../lib/time';

const route = useRoute();
const router = useRouter();

const path = computed(() => (typeof route.query.note === 'string' ? route.query.note : null));
const current = computed<NoteSummary | null>(() => notes.value.find((n) => n.path === path.value) ?? null);
const folder = computed(() => (path.value?.includes('/') ? path.value.slice(0, path.value.lastIndexOf('/')) : ''));

const editor = ref<InstanceType<typeof MarkdownEditor> | null>(null);
const text = ref('');
/**
 * Path whose text is in `text` — a save can never go to the wrong note.
 * It is a ref because it is the editor's `key`: switching notes RECREATES the
 * editor, otherwise Ctrl+Z in one note would undo text from the previous one.
 */
const loadedPath = ref<string | null>(null);
const notesVersion = ref(0);
const dirty = ref(false);
const saving = ref(false);
const incoming = ref<NoteSummary[]>([]);

// ── open and save ─────────────────────────────────────────────────────────

/** True while the save comes FROM THIS screen — its echo is not an "outside write". */
let ownSave = false;

async function saveNow(): Promise<void> {
  if (!dirty.value || !loadedPath.value) return;
  const p = loadedPath.value;
  const t = text.value;
  dirty.value = false;
  saving.value = true;
  ownSave = true;
  try {
    await saveNote(p, t);
  } catch (e) {
    dirty.value = true;
    toast.error(`Not saved: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    saving.value = false;
    ownSave = false;
  }
}
/** 600 ms after the last keystroke: fast enough not to lose anything. */
const saveSoon = useDebounceFn(saveNow, 600);

function onEdit(t: string): void {
  text.value = t;
  dirty.value = true;
  void saveSoon();
}

async function openNote(p: string | null): Promise<void> {
  await saveNow();   // the previous note always leaves saved
  loadedPath.value = null;
  activeNote.value = null;
  incoming.value = [];
  if (!p) { text.value = ''; return; }
  try {
    text.value = await readNote(p);
    loadedPath.value = p;
    activeNote.value = p;
    dirty.value = false;
    incoming.value = await listBacklinks(p);
    emitEvent('note:opened', { path: p });
  } catch {
    toast.error('That note no longer exists.');
    router.replace({ query: {} });
  }
}

watch(path, (p) => { void openNote(p); }, { immediate: true });

// Reload the "links to this note" whenever any note changes.
watch(notes, async () => {
  notesVersion.value++;
  if (loadedPath.value) incoming.value = await listBacklinks(loadedPath.value);
});

// Changed on disk from outside (Obsidian, git): reload if there is no pending edit.
const stopExternal = onEvent('note:external', async ({ path: p }) => {
  if (p !== loadedPath.value || dirty.value) return;
  text.value = await readNote(p);
});
// A PLUGIN wrote to the open note: the editor adopts the new text. Without this
// the next autosave from this screen would write the old text over the plugin's.
const stopSaved = onEvent('note:saved', ({ path: p, text: t }) => {
  if (ownSave || p !== loadedPath.value || t === text.value) return;
  text.value = t;
  dirty.value = false;
});
const stopListening = () => { stopExternal(); stopSaved(); };

onBeforeRouteLeave(async () => { await saveNow(); });
onBeforeUnmount(() => { stopListening(); activeNote.value = null; void saveNow(); });

// ── links ─────────────────────────────────────────────────────────────────

const linkOptions = () => notes.value.map((n) => ({
  target: noteName(n.path),
  folder: n.path.includes('/') ? n.path.slice(0, n.path.lastIndexOf('/')) : '',
}));
const noteExists = (target: string) => !!resolve(target);

async function openLink(target: string): Promise<void> {
  await saveNow();
  const countBefore = notes.value.length;
  const p = await followLink(target, folder.value);
  if (notes.value.length > countBefore) toast.ok(`Note ${noteName(p)} created`);
  router.push({ query: { note: p } });
}

function openTag(tag: string): void {
  search.value = tag;
  searchInput.value?.focus();
}

// ── title = file name ─────────────────────────────────────────────────────

const title = ref('');
const titleInput = ref<HTMLInputElement | null>(null);
watch(path, (p) => { title.value = p ? noteName(p) : ''; }, { immediate: true });

async function renameCurrent(): Promise<void> {
  if (!loadedPath.value) return;
  const newName = title.value.trim();
  if (!newName || newName === noteName(loadedPath.value)) { title.value = noteName(loadedPath.value); return; }
  await saveNow();
  try {
    const linkCount = incoming.value.length;
    const newPath = await renameNote(loadedPath.value, newName);
    if (linkCount) toast.ok(`Renamed — ${linkCount} ${linkCount === 1 ? 'link updated' : 'links updated'}`);
    router.replace({ query: { note: newPath } });
  } catch (e) {
    toast.error(e instanceof Error ? e.message : String(e));
    title.value = noteName(loadedPath.value);
  }
}

function onTitleEnter(): void {
  titleInput.value?.blur();   // the blur calls renameCurrent
  editor.value?.focus();
}

// ── create and delete ─────────────────────────────────────────────────────

async function newNote(inFolder = folder.value): Promise<void> {
  await saveNow();
  const p = await createNote('Untitled', { folder: inFolder });
  await router.push({ query: { note: p } });
  await nextTick();
  titleInput.value?.focus();
  titleInput.value?.select();
}

const confirmingDelete = ref(false);
async function deleteCurrent(): Promise<void> {
  if (!loadedPath.value) return;
  const p = loadedPath.value;
  dirty.value = false;
  loadedPath.value = null;
  confirmingDelete.value = false;
  await deleteNote(p);
  toast.ok(`${noteName(p)} moved to the vault trash (.trash)`);
  router.replace({ query: {} });
}
watch(path, () => { confirmingDelete.value = false; });

// ── search ────────────────────────────────────────────────────────────────

const search = ref('');
const searchInput = ref<HTMLInputElement | null>(null);
const results = ref<SearchResult[]>([]);
const runSearch = useDebounceFn(async (q: string) => {
  results.value = q.trim() ? await api.searchNotes(q) : [];
}, 120);
watch(search, (q) => { void runSearch(q); });

/** The FTS5 snippet marks the matched terms with control characters 2 and 3. */
const MARK_START = String.fromCharCode(2);
const MARK_END = String.fromCharCode(3);

/** The FTS snippet split into pieces, so the matched terms can be highlighted. */
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

// ── empty ─────────────────────────────────────────────────────────────────

const recent = computed(() => notes.value.slice(0, 8));

async function openFolder(): Promise<void> {
  if (await pickVault()) toast.ok(`Vault opened: ${notes.value.length} notes`);
}
async function createDefault(): Promise<void> {
  if (await createDefaultVault()) {
    toast.ok('Vault created in Documents/Bancada');
    const welcome = notes.value[0];
    if (welcome) router.push({ query: { note: welcome.path } });
  }
}

onMounted(() => { if (!path.value) searchInput.value?.focus(); });
</script>

<template>
  <!-- ── no vault ── -->
  <div v-if="!vaultPath" class="grid min-h-0 flex-1 place-items-center p-8">
    <div class="max-w-[460px] text-center">
      <h1 class="display m-0 text-[32px] leading-none">Notes</h1>
      <p class="mt-3 text-[14px] leading-relaxed text-fg-muted">
        Each note is a <code class="mono rounded bg-surface-2 px-1 py-0.5 text-[12px]">.md</code>
        file in a folder of yours. If you use Obsidian, point it at the same vault — both apps
        read and write the same files.
      </p>
      <div class="mt-6 flex flex-col items-center gap-2">
        <button class="btn btn-accent" @click="openFolder"><FolderOpen class="h-4 w-4" />Open an existing folder</button>
        <button class="btn btn-ghost" @click="createDefault"><FolderPlus class="h-4 w-4" />Create a new vault in Documents</button>
      </div>
    </div>
  </div>

  <div v-else class="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)] max-[900px]:grid-cols-[200px_minmax(0,1fr)]">
    <!-- ── left column: search + tree ── -->
    <aside class="flex min-h-0 flex-col border-r border-rule bg-surface-2/40">
      <div class="flex-none space-y-2 p-3">
        <div class="relative">
          <Search class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
          <input ref="searchInput" v-model="search" class="inp !py-1.5 !pl-8 !text-[12px]"
            placeholder="search notes…" spellcheck="false" @keydown.esc="search = ''">
          <button v-if="search" class="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
            @click="search = ''"><X class="h-3.5 w-3.5" /></button>
        </div>
        <button class="btn w-full justify-center !py-1.5" @click="newNote()">
          <FilePlus class="h-3.5 w-3.5" />New note
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <!-- search results -->
        <template v-if="search.trim()">
          <p v-if="!results.length" class="px-2 py-4 text-[12px] text-fg-subtle">Nothing for “{{ search }}”.</p>
          <button v-for="r in results" :key="r.path" type="button"
            class="block w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-3/50"
            :class="r.path === path && 'bg-surface-3/80'"
            @click="router.push({ query: { note: r.path } })">
            <div class="truncate text-[12px] font-medium text-fg">{{ r.title }}</div>
            <div class="mt-0.5 line-clamp-2 text-[11px] leading-snug text-fg-subtle">
              <template v-for="(p, i) in snippetParts(r.snippet)" :key="i">
                <mark v-if="p.highlight" class="rounded-sm bg-accent/25 px-0.5 text-fg">{{ p.s }}</mark>
                <template v-else>{{ p.s }}</template>
              </template>
            </div>
          </button>
        </template>

        <NoteTree v-else :notes="notes" :current="path" @open="(p) => router.push({ query: { note: p } })" />
      </div>

      <div class="flex-none truncate border-t border-rule px-3 py-1.5 font-mono text-[11px] text-fg-subtle"
        :title="vaultPath">
        {{ syncing ? 'indexing…' : `${notes.length} notes` }} · {{ vaultPath.split(/[\\/]/).pop() }}
      </div>
    </aside>

    <!-- ── open note ── -->
    <section class="min-h-0 overflow-y-auto">
      <div v-if="path" class="mx-auto max-w-[760px] px-10 pb-[35vh] pt-8">
        <div class="mb-1 flex items-center gap-2 font-mono text-[11px] text-fg-subtle">
          <span class="truncate">{{ folder || 'root' }}</span>
          <span class="ml-auto">{{ saving ? 'saving…' : dirty ? 'editing' : 'saved' }}</span>
          <button class="rounded p-1 hover:bg-surface-3 hover:text-danger" title="Delete note"
            @click="confirmingDelete = true"><Trash2 class="h-3.5 w-3.5" /></button>
        </div>

        <!-- title = file name (Obsidian's inline title) -->
        <input ref="titleInput" v-model="title" spellcheck="false"
          class="w-full bg-transparent text-[32px] font-semibold leading-tight tracking-[-0.02em] text-fg outline-none
                 placeholder:text-fg-subtle"
          placeholder="Untitled"
          @blur="renameCurrent" @keydown.enter.prevent="onTitleEnter" @keydown.esc="title = noteName(path!)">

        <div class="mb-6 mt-2 flex flex-wrap items-center gap-2 text-[12px] text-fg-subtle">
          <button v-if="current?.project_id" class="hover:underline" @click="router.push(`/project/${current.project_id}`)">
            <ProjectChip variant="line" :name="current.project_name" :color="current.project_color" />
          </button>
          <span v-for="t in current?.tags ?? []" :key="t"
            class="cursor-pointer rounded-full bg-accent/10 px-2 py-px text-[11px] text-accent-ink hover:bg-accent/20"
            @click="openTag(t)">#{{ t }}</span>
          <span v-if="current" class="ml-auto font-mono text-[11px]">edited {{ fmtRelative(new Date(current.mtime).toISOString()) }}</span>
        </div>

        <div v-if="confirmingDelete" class="panel mb-5 flex flex-wrap items-center gap-3 !border-danger/40 p-3 text-[12px]">
          <span>Move <b>{{ noteName(path) }}</b> to the vault trash?
            <span v-if="incoming.length" class="text-warn">{{ incoming.length }} {{ incoming.length === 1 ? 'note links' : 'notes link' }} to it.</span>
          </span>
          <button class="btn btn-danger ml-auto" @click="deleteCurrent">Delete</button>
          <button class="btn" @click="confirmingDelete = false">Cancel</button>
        </div>

        <MarkdownEditor ref="editor" :key="loadedPath ?? 'empty'" :model-value="text"
          :link-options="linkOptions" :note-exists="noteExists" :notes-version="notesVersion"
          placeholder="Start writing. [[ to link another note, # for a tag."
          @update:model-value="onEdit" @open-link="openLink" @open-tag="openTag" />

        <!-- who links to this note -->
        <div v-if="incoming.length" class="mt-10 border-t border-rule pt-4">
          <div class="label mb-2 flex items-center gap-1.5"><Link2 class="h-3.5 w-3.5" />
            Links to this note · {{ incoming.length }}</div>
          <button v-for="n in incoming" :key="n.path" type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[14px] transition-colors hover:bg-surface"
            @click="router.push({ query: { note: n.path } })">
            <ProjectChip variant="dot" :color="n.project_color" />
            <span class="truncate">{{ n.title }}</span>
            <span class="ml-auto truncate font-mono text-[11px] text-fg-subtle">{{ n.path.split('/').slice(0, -1).join('/') }}</span>
          </button>
        </div>
      </div>

      <!-- no note open: recent ones -->
      <div v-else class="mx-auto max-w-[560px] px-10 pt-16">
        <h1 class="display m-0 text-[32px] leading-none">Notes</h1>
        <p class="mt-2 text-[14px] text-fg-muted">
          {{ notes.length }} {{ notes.length === 1 ? 'note' : 'notes' }} in the vault.
          Ctrl+K searches everything.
        </p>
        <div class="label mb-2 mt-8">Recently edited</div>
        <div class="panel">
          <button v-for="n in recent" :key="n.path" class="row w-full grid-cols-[12px_minmax(0,1fr)_auto] text-left"
            @click="router.push({ query: { note: n.path } })">
            <ProjectChip variant="dot" :color="n.project_color" />
            <span class="truncate text-[14px]">{{ n.title }}</span>
            <span class="font-mono text-[11px] text-fg-subtle">{{ fmtRelative(new Date(n.mtime).toISOString()) }}</span>
          </button>
          <p v-if="!recent.length" class="px-4 py-6 text-center text-[12px] text-fg-subtle">Empty vault.</p>
        </div>
        <button class="btn btn-accent mt-4" @click="newNote('')"><FilePlus class="h-3.5 w-3.5" />New note</button>
      </div>
    </section>
  </div>
</template>
