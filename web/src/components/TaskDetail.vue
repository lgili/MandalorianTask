<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onKeyStroke } from '@vueuse/core';
import { X, Play, Pause, Check, Trash2, Clock } from 'lucide-vue-next';
import ProjectChip from './ProjectChip.vue';
import ProjectPicker from './ProjectPicker.vue';
import type { Outcome, Session, TaskCard, Transition } from '../lib/types';
import { KINDS, OUTCOMES } from '../lib/types';
import * as api from '../lib/db';
import { openTaskDetail, loadBoard, complete, detailTaskId, move, pause, running, tasks } from '../lib/store';
import { toast } from '../lib/toast';
import { openModals } from '../lib/keyboard';
import { durationMin, fmtDur, fmtHM, hhmm, fmtRelative } from '../lib/time';
import { now, fmtElapsed } from '../lib/clock';

const task = computed<TaskCard | null>(() => tasks.value.find((t) => t.id === detailTaskId.value) ?? null);
const sessions = ref<Session[]>([]);
const transitions = ref<Transition[]>([]);
const title = ref('');
const notes = ref('');
const completing = ref(false);
const outcome = ref<Outcome>('delivered');
const outcomeNote = ref('');

const isRunning = computed(() => running.value?.task_id === task.value?.id);
const clock = computed(() => isRunning.value ? fmtElapsed(running.value!.started_at, now.value) : null);

watch(task, async (t) => {
  openModals.value = t ? 1 : 0;
  completing.value = false;
  if (!t) return;
  title.value = t.title; notes.value = t.notes ?? '';
  [sessions.value, transitions.value] = await Promise.all([api.listTaskSessions(t.id), api.listTransitions(t.id)]);
}, { immediate: true });

onKeyStroke('Escape', () => { if (task.value) openTaskDetail(null); });

async function save(patch: Parameters<typeof api.updateTask>[1]): Promise<void> {
  if (!task.value) return;
  try { await api.updateTask(task.value.id, patch); await loadBoard(); }
  catch (e) { toast.error(api.dbError(e)); }
}
async function remove(): Promise<void> {
  if (!task.value) return;
  try { await api.deleteTask(task.value.id); openTaskDetail(null); await loadBoard(); }
  catch (e) { toast.error(api.dbError(e)); }
}
async function confirmComplete(): Promise<void> {
  if (!task.value) return;
  await complete(task.value.id, outcome.value, outcomeNote.value.trim() || null);
  completing.value = false;
}

const STATUS_LABEL = { backlog: 'Backlog', queued: 'Queue', doing: 'Doing', done: 'Done' } as const;
const total = computed(() => sessions.value.reduce((s, x) => s + (x.ended_at ? durationMin(x.started_at, x.ended_at) : 0), 0));
const dueDate = computed({
  get: () => task.value?.due_at ? task.value.due_at.slice(0, 10) : '',
  set: (v: string) => save({ due_at: v ? new Date(`${v}T12:00:00`).toISOString() : null }),
});
</script>

<template>
  <Transition name="drawer">
    <div v-if="task" class="fixed inset-0 z-40 flex justify-end bg-black/50" @click.self="openTaskDetail(null)">
      <aside class="flex h-full w-[560px] max-w-[92vw] flex-col border-l border-rule bg-surface-2 shadow-pop">
        <!-- header -->
        <div class="flex items-start gap-3 border-b border-rule px-6 pb-4 pt-5">
          <div class="min-w-0 flex-1">
            <div class="mb-2 flex items-center gap-2">
              <span class="chip bg-surface-3 text-fg-muted">{{ STATUS_LABEL[task.status] }}</span>
              <ProjectChip v-if="task.project_id" :code="task.project_code"
                :name="task.project_name" :color="task.project_color" />
              <span v-if="isRunning" class="chip bg-live/15 text-live-ink">● running {{ clock }}</span>
            </div>
            <input v-model="title" @change="save({ title: title.trim() || task.title })"
              class="display w-full bg-transparent text-[24px] leading-tight text-fg outline-none focus:text-fg" />
            <div v-if="task.origin_title" class="mt-1 text-[12px] text-fg-subtle">
              captured during <span class="text-meeting">{{ task.origin_title }}</span>
            </div>
          </div>
          <button class="btn btn-ghost btn-icon" @click="openTaskDetail(null)"><X class="h-4 w-4" /></button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <!-- actions -->
          <div class="mb-5 flex flex-wrap items-center gap-2">
            <button v-if="isRunning" class="btn" @click="pause()"><Pause class="h-3.5 w-3.5" />Pause</button>
            <button v-else-if="task.status !== 'done'" class="btn btn-accent" @click="move(task.id, 'doing')">
              <Play class="h-3.5 w-3.5" />Start now</button>
            <button v-if="task.status === 'backlog'" class="btn" @click="move(task.id, 'queued')">→ Queue</button>
            <!-- Complete is ONE click and assumes "delivered", which is the common case.
                 The outcome form becomes a faint link next to it: the rare data point
                 can still be captured without turning into a toll on the hot path. -->
            <button v-if="task.status !== 'done'" class="btn"
              @click="complete(task.id, 'delivered', null)">
              <Check class="h-3.5 w-3.5" />Complete</button>
            <button v-if="task.status !== 'done'"
              class="text-[12px] text-fg-subtle underline decoration-dotted underline-offset-2 hover:text-fg"
              @click="completing = !completing">didn't go as planned…</button>
            <button v-else class="btn" @click="move(task.id, 'queued')">Reopen</button>
            <span class="mono ml-auto text-[14px] font-semibold text-fg-muted">{{ fmtHM(total) }} total</span>
          </div>

          <!-- complete with an outcome -->
          <div v-if="completing" class="panel mb-5 p-4">
            <div class="label mb-2">How did it end?</div>
            <div class="mb-3 grid grid-cols-2 gap-2">
              <button v-for="o in OUTCOMES" :key="o.id" @click="outcome = o.id"
                class="rounded-lg border px-3 py-2 text-left transition"
                :class="outcome === o.id ? 'border-accent bg-accent/10' : 'border-rule hover:border-rule-strong'">
                <div class="text-[14px] font-medium">{{ o.label }}</div>
                <div class="text-[11px] text-fg-subtle">{{ o.desc }}</div>
              </button>
            </div>
            <input v-model="outcomeNote" class="inp mb-3" placeholder="one line on why (optional)"
                   @keydown.enter="confirmComplete">
            <div class="flex gap-2">
              <button class="btn btn-accent" @click="confirmComplete">Complete</button>
              <button class="btn" @click="completing = false">Cancel</button>
            </div>
          </div>
          <div v-else-if="task.outcome" class="mb-5 rounded-lg border border-rule bg-surface px-3 py-2 text-[12px]">
            <span class="chip bg-ok/15 text-ok mr-2">{{ OUTCOMES.find((o) => o.id === task!.outcome)?.label }}</span>
            <span class="text-fg-muted">{{ task.outcome_note }}</span>
          </div>

          <!-- fields -->
          <div class="mb-5 grid grid-cols-2 gap-3">
            <div><span class="label mb-1 block">Project</span>
              <ProjectPicker :model-value="task.project_id"
                @update:model-value="save({ project_id: $event })" /></div>
            <label><span class="label mb-1 block">Type</span>
              <select class="inp" :value="task.kind" @change="save({ kind: ($event.target as HTMLSelectElement).value as any })">
                <option v-for="k in KINDS" :key="k.id" :value="k.id">{{ k.label }}</option>
              </select></label>
            <label><span class="label mb-1 block">Due date</span>
              <input type="date" class="inp mono" v-model="dueDate"></label>
            <div><span class="label mb-1 block">Captured</span>
              <div class="mono px-1 py-2 text-[12px] text-fg-muted">{{ fmtRelative(task.created_at) }}</div></div>
          </div>
          <label class="mb-5 block"><span class="label mb-1 block">Notes</span>
            <textarea v-model="notes" rows="3" class="inp resize-y" placeholder="context, links, decisions…"
              @change="save({ notes: notes.trim() || null })"></textarea></label>

          <!-- sessions -->
          <div class="label mb-2">Sessions · {{ sessions.length }}</div>
          <div class="panel mb-5">
            <p v-if="!sessions.length" class="px-3 py-3 text-[12px] text-fg-subtle">None yet.</p>
            <div v-for="s in sessions" :key="s.id" class="row grid-cols-[auto_1fr_auto] !py-2">
              <span class="mono text-[11px] text-fg-subtle">{{ s.started_at.slice(5, 10).split('-').reverse().join('/') }}</span>
              <span class="mono text-[12px] text-fg-muted">{{ hhmm(s.started_at) }}–{{ s.ended_at ? hhmm(s.ended_at) : '…' }}
                <span v-if="s.source === 'manual'" class="label ml-2 !text-[11px]">manual</span></span>
              <span class="mono text-[12px] font-semibold" :class="s.ended_at ? 'text-fg' : 'text-live-ink'">
                {{ s.ended_at ? fmtDur(durationMin(s.started_at, s.ended_at)) : fmtElapsed(s.started_at, now) }}</span>
            </div>
          </div>

          <!-- timeline -->
          <div class="label mb-2">Timeline</div>
          <ol class="relative ml-1.5 border-l border-rule pl-4">
            <li v-for="t in transitions" :key="t.id" class="relative mb-3 text-[12px]">
              <span class="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full"
                :class="t.to_status === 'done' ? 'bg-accent' : t.to_status === 'doing' ? 'bg-work' : 'bg-surface-3'" />
              <span class="text-fg">{{ t.from_status ? `${STATUS_LABEL[t.from_status]} → ` : '' }}{{ STATUS_LABEL[t.to_status] }}</span>
              <span class="mono ml-2 text-[11px] text-fg-subtle">{{ fmtRelative(t.at) }}</span>
            </li>
          </ol>
        </div>

        <div class="flex items-center border-t border-rule px-6 py-3">
          <button class="btn btn-ghost btn-danger" @click="remove"><Trash2 class="h-3.5 w-3.5" />Delete</button>
          <span class="mono ml-auto text-[11px] text-fg-subtle"><Clock class="mr-1 inline h-3 w-3" />esc closes</span>
        </div>
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
.drawer-enter-active, .drawer-leave-active { transition: opacity .15s ease; }
.drawer-enter-active aside, .drawer-leave-active aside { transition: transform .18s ease; }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from aside, .drawer-leave-to aside { transform: translateX(24px); }
</style>
