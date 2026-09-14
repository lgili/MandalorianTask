<script setup lang="ts">
// The ONLY way to create a task in the app.
//
// There used to be four: the topbar button (which only navigated), the line on
// the Backlog screen (the only one with tokens), the Board field (no tokens, it
// created orphans) and a dead wrapper in the store. Same look, different grammars.
//
// Here `#` stops being guesswork: it opens the list, and the project becomes a pill
// inside the field. Enter with the list open PICKS; Enter with it closed
// SAVES. One Enter doing two jobs is the classic bug of this screen.
import { computed, nextTick, ref, watch } from 'vue';
import { CornerDownLeft, X } from 'lucide-vue-next';
import ProjectChip from './ProjectChip.vue';
import ProjectList from './ProjectList.vue';
import type { Project, TaskStatus } from '../lib/types';
import { parseCapture } from '../lib/capture';
import * as api from '../lib/db';
import { createProject, getProject, projects, reloadAll } from '../lib/store';
import { toast } from '../lib/toast';
import { emitEvent } from '../lib/events';

const props = withDefaults(defineProps<{
  /** Being on the project's screen ALREADY is the assignment — nobody types `#` there. */
  fixedProjectId?: number | null;
  /** Where the task is born. The Board creates straight into the queue; everything else, in the backlog. */
  initialStatus?: TaskStatus;
  autofocus?: boolean;
  placeholder?: string;
  /** Token hints under the field. Hidden in quick-add, which is leaner. */
  hints?: boolean;
}>(), {
  fixedProjectId: null, initialStatus: 'backlog', autofocus: false, hints: true,
  placeholder: 'what needs doing…',
});

const emit = defineEmits<{ created: [number] }>();

const inputEl = ref<HTMLInputElement | null>(null);
const list = ref<InstanceType<typeof ProjectList> | null>(null);
const text = ref('');
const picked = ref<Project | null>(null);
/** Position of the `#` that opened the list. null = list closed. */
const tokenStart = ref<number | null>(null);
const query = ref('');

const fixedProject = computed(() => getProject(props.fixedProjectId ?? null) ?? null);
/** What counts on save: picked > typed > the screen's. */
const preview = computed(() => parseCapture(text.value, projects.value));
const finalProject = computed(() => picked.value ?? preview.value.project ?? fixedProject.value);
const listOpen = computed(() => tokenStart.value !== null);

/** Finds the `#` the caret is editing. Only opens at the start of a word. */
function detectToken(): void {
  const el = inputEl.value;
  if (!el) return;
  const caret = el.selectionStart ?? 0;
  const before = text.value.slice(0, caret);
  const h = before.lastIndexOf('#');
  if (h < 0 || (h > 0 && !/\s/.test(before[h - 1]))) { tokenStart.value = null; return; }
  const q = before.slice(h + 1);
  // two words without picking anything: this person is typing text, not searching
  if (q.length > 40 || /\s\s/.test(q)) { tokenStart.value = null; return; }
  tokenStart.value = h;
  query.value = q;
}

watch(text, () => nextTick(detectToken));

/** Picking removes the `#text` from the field: the link now lives in the pill. */
function pinProject(p: Project | null): void {
  picked.value = p;
  const start = tokenStart.value;
  tokenStart.value = null;
  if (start == null || !inputEl.value) return;
  const el = inputEl.value;
  const caret = el.selectionStart ?? 0;
  text.value = (text.value.slice(0, start) + text.value.slice(caret)).replace(/\s{2,}/g, ' ');
  nextTick(() => { el.focus(); el.setSelectionRange(start, start); });
}

async function createAndPin(name: string): Promise<void> {
  const p = await createProject(name);
  if (p) { pinProject(p); toast.ok(`Project ${p.name} created`); }
}

async function submit(toQueue: boolean): Promise<void> {
  const a = parseCapture(text.value, projects.value);
  if (!a.title) { text.value = ''; return; }   // an empty line isn't an error, it's nothing
  const target: TaskStatus = toQueue ? 'queued' : props.initialStatus;
  try {
    const id = await api.captureTask(a.title, finalProject.value?.id ?? null, a.kind, a.due);
    if (target !== 'backlog') await api.moveTask(id, target);
    emitEvent('task:created', { id, title: a.title, project: finalProject.value?.id ?? null });
    text.value = '';
    tokenStart.value = null;
    // The project is NOT reset: dumping eight tasks into the same project used to
    // mean typing `#proj` eight times. To switch, use the pill's ✕.
    await reloadAll();
    emit('created', id);
    // The cursor must not move: the next task comes right behind.
    await nextTick();
    inputEl.value?.focus();
  } catch (e) {
    toast.error(api.dbError(e));
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (listOpen.value) {
    if (e.key === 'ArrowDown') { e.preventDefault(); list.value?.move(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); list.value?.move(-1); return; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); list.value?.accept(); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); tokenStart.value = null; return; }
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    submit(e.ctrlKey || e.metaKey);
  }
}

defineExpose({ focus: () => inputEl.value?.focus() });
</script>

<template>
  <div class="relative">
    <div class="inp flex items-center gap-2 !py-1.5 focus-within:border-accent/70 focus-within:ring-2
                focus-within:ring-accent/20">
      <CornerDownLeft class="h-3.5 w-3.5 flex-none text-fg-subtle" />

      <!-- the screen's project: context, not a choice -->
      <ProjectChip v-if="fixedProject && !picked" :code="fixedProject.code" :name="fixedProject.name" :color="fixedProject.color" />

      <!-- project picked on this line: removable -->
      <span v-else-if="picked" class="inline-flex flex-none items-center gap-1">
        <ProjectChip :code="picked.code" :name="picked.name" :color="picked.color" />
        <button type="button" class="text-fg-subtle hover:text-fg" title="Remove project"
          @click="picked = null; inputEl?.focus()"><X class="h-3 w-3" /></button>
      </span>

      <input ref="inputEl" v-model="text" :autofocus="autofocus" spellcheck="false" autocomplete="off"
        class="min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-subtle"
        :placeholder="placeholder"
        @keydown="onKeydown" @click="detectToken" @keyup="detectToken"
        @blur="tokenStart = null">

      <span v-if="preview.due" class="chip flex-none bg-warn/15 text-warn">
        {{ new Date(preview.due).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) }}
      </span>
      <span v-if="preview.kind !== 'work'" class="chip flex-none"
        :class="preview.kind === 'meeting' ? 'bg-meeting/15 text-meeting' : 'bg-surface-3 text-fg-muted'">
        {{ preview.kind === 'meeting' ? 'meeting' : 'admin' }}
      </span>
    </div>

    <!-- the `#` list: anchored to the field, not to the caret -->
    <div v-if="listOpen" class="absolute left-0 top-[calc(100%+6px)] z-50 w-[320px]"
         @mousedown.prevent>
      <ProjectList ref="list" :query="query" @pick="pinProject" @create="createAndPin" />
    </div>

    <div v-if="hints" class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-fg-subtle">
      <span><b class="font-semibold text-fg-muted">enter</b> adds</span>
      <span><b class="font-semibold text-fg-muted">ctrl+enter</b> sends to queue</span>
      <span><b class="font-semibold text-fg-muted">#</b> project</span>
      <span><b class="font-semibold text-fg-muted">!</b> due</span>
      <span><b class="font-semibold text-fg-muted">@</b> meeting · admin</span>
    </div>
  </div>
</template>
