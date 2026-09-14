<script setup lang="ts">
// The project page. This is where "add a task inside a project" stops being a
// <select> hidden in a drawer and becomes the natural operation: being on the
// project screen ALREADY IS the assignment.
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, Archive, Trash2, Play, FileText, FilePlus } from 'lucide-vue-next';
import CaptureLine from '../components/CaptureLine.vue';
import type { TaskCard, TaskStatus } from '../lib/types';
import { STATUS } from '../lib/types';
import * as api from '../lib/db';
import { openTaskDetail, loadProjects, move, getProject, reloadAll, running } from '../lib/store';
import { toast } from '../lib/toast';
import { fmtHM, fmtRelative } from '../lib/time';
import { createNote, notes, vaultPath } from '../lib/notes';

const route = useRoute();
const router = useRouter();

/** 'inbox' is the route for tasks without a project. */
const isInbox = computed(() => route.params.id === 'inbox');
const id = computed(() => (isInbox.value ? null : Number(route.params.id)));
const project = computed(() => getProject(id.value));

const items = ref<TaskCard[]>([]);
const loading = ref(false);
const editingName = ref(false);
const name = ref('');
const code = ref('');
const confirmingDelete = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  try {
    items.value = await api.listProjectTasks(id.value);
  } catch (e) {
    toast.error(api.dbError(e));
  } finally {
    loading.value = false;
  }
}

watch(() => route.params.id, async () => {
  await loadProjects();
  await load();
  name.value = project.value?.name ?? '';
  code.value = project.value?.code ?? '';
  editingName.value = false;
  confirmingDelete.value = false;
}, { immediate: true });

// ── header numbers ────────────────────────────────────────────────────────
const activeItems = computed(() => items.value.filter((t) => !t.archived_at));
const doneCount = computed(() => items.value.filter((t) => t.status === 'done').length);
const minutes = computed(() => items.value.reduce((s, t) => s + t.minutes, 0));
const progress = computed(() => (items.value.length ? doneCount.value / items.value.length : 0));
const latest = computed(() => {
  const d = items.value.map((t) => t.created_at).sort();
  return d.length ? d[d.length - 1] : null;
});

/** Grouped by status — Things' "headings", for free. */
const groups = computed(() => STATUS
  .map((s) => ({ ...s, items: activeItems.value.filter((t) => t.status === s.id) }))
  .filter((g) => g.items.length));

// ── project editing ───────────────────────────────────────────────────────
async function save(patch: { name?: string; code?: string | null; color?: string }): Promise<void> {
  if (id.value == null) return;
  try {
    await api.updateProject(id.value, patch);
    await loadProjects();
  } catch (e) {
    toast.error(api.dbError(e));
  }
}

function saveName(): void {
  editingName.value = false;
  const n = name.value.trim();
  if (!n || n === project.value?.name) { name.value = project.value?.name ?? ''; return; }
  save({ name: n });
}

async function archive(): Promise<void> {
  if (id.value == null) return;
  try {
    await api.updateProject(id.value, { archived_at: new Date().toISOString() });
    await loadProjects();
    toast.ok(`${project.value?.name ?? 'Project'} archived`);
    router.push('/projects');
  } catch (e) {
    toast.error(api.dbError(e));
  }
}

async function deleteCurrent(): Promise<void> {
  if (id.value == null) return;
  try {
    await api.deleteProject(id.value);
    await reloadAll();
    toast.ok('Project deleted — its tasks moved to the Inbox');
    router.push('/projects');
  } catch (e) {
    toast.error(api.dbError(e));
  }
}

async function moveAndReload(t: TaskCard, to: TaskStatus): Promise<void> {
  await move(t.id, to);
  await load();
}

// ── notes ─────────────────────────────────────────────────────────────────
// A filter over the list that is already loaded: each note's project was
// resolved in SQL (code or name, case-insensitive), so there is no new query here.
const projectNotes = computed(() => (id.value == null ? [] : notes.value.filter((n) => n.project_id === id.value)));

/**
 * New note already linked to the project, inside a folder named after it — the
 * link is the frontmatter (the folder is just tidiness, it can be moved later).
 */
async function newProjectNote(): Promise<void> {
  if (!vaultPath.value) { router.push('/notes'); return; }
  const p = project.value;
  if (!p) return;
  const path = await createNote('Untitled', { folder: `Projects/${p.name}`, project: p.code ?? p.name });
  router.push({ name: 'notes', query: { note: path } });
}

const shortDue = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto max-w-[880px] px-6 pb-14 pt-6">
      <button class="mb-4 flex items-center gap-1.5 text-[12px] text-fg-subtle hover:text-fg"
        @click="router.push('/projects')">
        <ArrowLeft class="h-3.5 w-3.5" />Projects
      </button>

      <!-- ── header ── -->
      <div class="flex items-start gap-4">
        <!-- progress ring: a graphic element, no number, no invented denominator -->
        <svg class="mt-1 h-9 w-9 flex-none -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
          <circle cx="18" cy="18" r="15" fill="none" stroke="rgb(var(--surface-3))" stroke-width="4" />
          <circle v-if="progress > 0" cx="18" cy="18" r="15" fill="none" stroke-width="4"
            stroke-linecap="round"
            :stroke="project?.color ? `rgb(var(--${project.color}))` : 'rgb(var(--fg-subtle))'"
            :stroke-dasharray="`${progress * 94.2} 94.2`" />
        </svg>

        <div class="min-w-0 flex-1">
          <input v-if="editingName && !isInbox" v-model="name"
            class="display w-full bg-transparent text-[32px] leading-none text-fg outline-none"
            @blur="saveName" @keydown.enter="saveName" @keydown.esc="editingName = false">
          <h1 v-else class="display m-0 text-[32px] leading-none"
            :class="!isInbox && 'cursor-text'"
            @click="isInbox || (editingName = true)">
            {{ isInbox ? 'Inbox' : project?.name ?? '…' }}
          </h1>

          <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-fg-subtle">
            <span>{{ items.length }} {{ items.length === 1 ? 'task' : 'tasks' }}</span>
            <span>·</span><span>{{ doneCount }} done</span>
            <span>·</span><span class="text-fg-muted">{{ fmtHM(minutes) }} measured</span>
            <template v-if="latest"><span>·</span><span>last {{ fmtRelative(latest) }}</span></template>
          </div>
        </div>

        <div v-if="!isInbox" class="flex flex-none items-center gap-1.5">
          <!-- color: six dots, not a color picker with hex -->
          <div class="mr-1 flex items-center gap-1">
            <button v-for="c in api.PROJECT_COLORS" :key="c" class="h-4 w-4 rounded-full transition"
              :style="{ background: `rgb(var(--${c}))` }"
              :class="project?.color === c
                ? 'ring-2 ring-fg/50 ring-offset-2 ring-offset-surface-1'
                : 'opacity-40 hover:opacity-100'"
              :aria-label="`Color ${c}`" @click="save({ color: c })" />
          </div>
          <input v-model="code" class="inp mono !w-[92px] !py-1 !text-[11px]" placeholder="code"
            @change="save({ code: code.trim() || null })">
          <button class="btn btn-ghost btn-icon" title="Archive" @click="archive">
            <Archive class="h-3.5 w-3.5" /></button>
          <button class="btn btn-ghost btn-icon btn-danger" title="Delete"
            @click="confirmingDelete = true"><Trash2 class="h-3.5 w-3.5" /></button>
        </div>
      </div>

      <div v-if="confirmingDelete"
        class="panel mt-4 flex flex-wrap items-center gap-3 !border-danger/40 p-3">
        <span class="text-[12px]">
          Delete <b>{{ project?.name }}</b>? Its {{ items.length }} tasks move to the Inbox —
          no measured hours are lost.
        </span>
        <button class="btn btn-danger ml-auto" @click="deleteCurrent">Delete</button>
        <button class="btn" @click="confirmingDelete = false">Cancel</button>
      </div>

      <!-- ── capture: the project comes pre-filled ── -->
      <div class="mt-6">
        <CaptureLine :fixed-project-id="id"
          :placeholder="`new task in ${isInbox ? 'Inbox' : project?.name ?? ''}…`"
          @created="load" />
      </div>

      <!-- ── tasks, grouped by status ── -->
      <div class="mt-6 space-y-6">
        <div v-for="g in groups" :key="g.id">
          <div class="mb-1 flex items-baseline gap-2 border-b border-rule pb-1">
            <span class="label">{{ g.label }}</span>
            <span class="mono ml-auto text-[11px] text-fg-subtle">{{ g.items.length }}</span>
          </div>

          <div v-for="t in g.items" :key="t.id"
            class="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-2
                   transition-colors hover:bg-surface">
            <button class="flex min-w-0 items-baseline gap-2 text-left" @click="openTaskDetail(t.id)">
              <span class="truncate text-[14px] leading-snug hover:text-accent-ink">{{ t.title }}</span>
              <span v-if="t.origin_title"
                class="max-w-[180px] flex-none truncate text-[11px] text-fg-subtle/70">
                from {{ t.origin_title }}</span>
            </button>
            <div class="flex flex-none items-center gap-2.5">
              <span v-if="t.kind === 'meeting'" class="chip bg-meeting/15 text-meeting">meeting</span>
              <span v-if="t.due_at" class="mono text-[11px] text-warn">{{ shortDue(t.due_at) }}</span>
              <span class="mono w-12 text-right text-[12px]"
                :class="t.minutes ? 'text-fg-muted' : 'text-fg-subtle/50'">
                {{ t.minutes ? fmtHM(t.minutes) : '—' }}</span>
              <span v-if="running?.task_id === t.id" class="chip bg-live/15 text-live-ink">running</span>
              <button v-else-if="t.status !== 'done'"
                class="rounded p-1 text-fg-subtle opacity-0 transition-opacity hover:bg-surface-3
                       hover:text-fg group-hover:opacity-100 group-focus-within:opacity-100"
                title="Start now" @click="moveAndReload(t, 'doing')">
                <Play class="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </div>

        <p v-if="!loading && !items.length" class="py-10 text-center text-[14px] text-fg-subtle">
          Nothing here yet.<br>
          <span class="text-[12px]">Type above and press enter.</span>
        </p>
      </div>

      <!-- ── project notes: what you KNOW about it, next to what you DO ── -->
      <div v-if="!isInbox" class="mt-10">
        <div class="mb-1 flex items-center gap-2 border-b border-rule pb-1">
          <span class="label flex items-center gap-1.5"><FileText class="h-3.5 w-3.5" />Notes</span>
          <span class="mono text-[11px] text-fg-subtle">{{ projectNotes.length }}</span>
          <button class="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] text-fg-subtle
                         transition-colors hover:bg-surface-3 hover:text-fg"
            @click="newProjectNote"><FilePlus class="h-3.5 w-3.5" />new note</button>
        </div>
        <button v-for="n in projectNotes" :key="n.path" type="button"
          class="flex w-full items-baseline gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface"
          @click="router.push({ name: 'notes', query: { note: n.path } })">
          <span class="truncate text-[14px] hover:text-accent-ink">{{ n.title }}</span>
          <span v-for="t in n.tags.slice(0, 3)" :key="t" class="flex-none text-[11px] text-accent-ink">#{{ t }}</span>
          <span class="mono ml-auto flex-none text-[11px] text-fg-subtle">{{ fmtRelative(new Date(n.mtime).toISOString()) }}</span>
        </button>
        <p v-if="!projectNotes.length" class="px-2 py-3 text-[12px] text-fg-subtle">
          <template v-if="vaultPath">
            No notes linked to this project. Any note with
            <code class="mono rounded bg-surface-2 px-1">project: {{ project?.code ?? project?.name }}</code>
            at the top shows up here.
          </template>
          <template v-else>
            Open a vault in <RouterLink to="/notes" class="text-accent-ink hover:underline">Notes</RouterLink>
            to write meeting minutes, decisions and project knowledge.
          </template>
        </p>
      </div>
    </div>
  </div>
</template>
