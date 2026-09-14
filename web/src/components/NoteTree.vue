<script setup lang="ts">
// The vault's folder tree, built from the index — not from disk. Reading the
// index is one query; reading the disk would be hundreds of calls.
import { computed, ref } from 'vue';
import { ChevronRight, FileText } from 'lucide-vue-next';
import ProjectChip from './ProjectChip.vue';
import type { NoteSummary } from '../lib/types';
import { noteName } from '../lib/markdown';

const props = defineProps<{ notes: NoteSummary[]; current: string | null }>();
const emit = defineEmits<{ open: [path: string] }>();

interface Folder { name: string; path: string; folders: Folder[]; notes: NoteSummary[] }

const tree = computed<Folder>(() => {
  const root: Folder = { name: '', path: '', folders: [], notes: [] };
  for (const n of props.notes) {
    const parts = n.path.split('/');
    let node = root;
    for (const seg of parts.slice(0, -1)) {
      const path = node.path ? `${node.path}/${seg}` : seg;
      let f = node.folders.find((x) => x.name === seg);
      if (!f) { f = { name: seg, path, folders: [], notes: [] }; node.folders.push(f); }
      node = f;
    }
    node.notes.push(n);
  }
  const sortFolder = (f: Folder) => {
    f.folders.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    f.notes.sort((a, b) => noteName(a.path).localeCompare(noteName(b.path), 'en'));
    f.folders.forEach(sortFolder);
  };
  sortFolder(root);
  return root;
});

const COLLAPSED_KEY = 'bancada-collapsed-folders';
/** Key used before the English rename. Read once and moved, so collapsed folders survive the upgrade. */
const OLD_COLLAPSED_KEY = 'bancada-pastas-fechadas';

/** Remembers COLLAPSED folders (not expanded ones): a new folder shows up expanded by default. */
function rememberedCollapsed(): string[] {
  try {
    let raw = localStorage.getItem(COLLAPSED_KEY);
    if (raw === null) {
      raw = localStorage.getItem(OLD_COLLAPSED_KEY);
      if (raw !== null) { localStorage.setItem(COLLAPSED_KEY, raw); localStorage.removeItem(OLD_COLLAPSED_KEY); }
    }
    return JSON.parse(raw ?? '[]');
  } catch { return []; }
}
const collapsed = ref<Set<string>>(new Set(rememberedCollapsed()));
function toggle(path: string): void {
  const s = new Set(collapsed.value);
  if (s.has(path)) s.delete(path); else s.add(path);
  collapsed.value = s;
  try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...s])); } catch { /* no storage, no memory */ }
}

/** The open note's folder is never hidden. */
const currentAncestors = computed(() => {
  const s = new Set<string>();
  if (!props.current) return s;
  const parts = props.current.split('/').slice(0, -1);
  parts.forEach((_, i) => s.add(parts.slice(0, i + 1).join('/')));
  return s;
});
const isOpen = (path: string) => currentAncestors.value.has(path) || !collapsed.value.has(path);

/** Flat list with depth: rendering recursively in Vue costs one component per level. */
const rows = computed(() => {
  const out: Array<{ kind: 'folder'; folder: Folder; depth: number } | { kind: 'note'; note: NoteSummary; depth: number }> = [];
  const walk = (parent: Folder, depth: number) => {
    for (const f of parent.folders) {
      out.push({ kind: 'folder', folder: f, depth });
      if (isOpen(f.path)) walk(f, depth + 1);
    }
    for (const note of parent.notes) out.push({ kind: 'note', note, depth });
  };
  walk(tree.value, 0);
  return out;
});
</script>

<template>
  <div class="py-1">
    <template v-for="row in rows" :key="row.kind === 'folder' ? `f:${row.folder.path}` : row.note.path">
      <button v-if="row.kind === 'folder'" type="button"
        class="flex w-full items-center gap-1 rounded-md py-[3px] pr-2 text-left text-[12px] font-medium text-fg-muted
               transition-colors hover:bg-surface-3/50 hover:text-fg"
        :style="{ paddingLeft: `${8 + row.depth * 12}px` }"
        @click="toggle(row.folder.path)">
        <ChevronRight class="h-3 w-3 flex-none transition-transform" :class="isOpen(row.folder.path) && 'rotate-90'" />
        <span class="truncate">{{ row.folder.name }}</span>
      </button>

      <button v-else type="button"
        class="flex w-full items-center gap-1.5 rounded-md py-[3px] pr-2 text-left text-[12px] transition-colors"
        :class="row.note.path === current ? 'bg-surface-3/80 text-fg' : 'text-fg-muted hover:bg-surface-3/40 hover:text-fg'"
        :style="{ paddingLeft: `${20 + row.depth * 12}px` }"
        :title="row.note.path"
        @click="emit('open', row.note.path)">
        <ProjectChip v-if="row.note.project_id" variant="dot" :color="row.note.project_color" />
        <FileText v-else class="h-3 w-3 flex-none opacity-50" />
        <span class="truncate">{{ noteName(row.note.path) }}</span>
      </button>
    </template>
  </div>
</template>
