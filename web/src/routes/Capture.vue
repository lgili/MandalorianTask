<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Trash2, ArrowRight } from 'lucide-vue-next';
import CaptureLine from '../components/CaptureLine.vue';
import ProjectChip from '../components/ProjectChip.vue';
import type { TaskCard } from '../lib/types';
import * as api from '../lib/db';
import { openTaskDetail, backlog, loadBoard, tasks } from '../lib/store';
import { toast } from '../lib/toast';
import { dayKey, fmtDay } from '../lib/time';

const captureLine = ref<InstanceType<typeof CaptureLine> | null>(null);
/** Ids sent to the queue during this visit to the screen: they stay visible, stamped. */
const queuedIds = ref<Set<number>>(new Set());

/**
 * Groups by CAPTURE CONTEXT, not by time.
 * Everything born during the same in-progress task becomes one block — in practice,
 * "the 7 things that came out of the review meeting". Nobody typed that.
 */
interface CaptureGroup { key: string; label: string; context: string | null; items: TaskCard[] }

const groups = computed<CaptureGroup[]>(() => {
  const out = new Map<string, CaptureGroup>();
  for (const t of backlog.value) {
    // The day boundary is LOCAL: comparing the UTC slice of the ISO string gets it wrong at night.
    const d = dayKey(new Date(t.created_at));
    const key = `${t.origin_id ?? 'solo'}|${d}`;
    if (!out.has(key)) {
      out.set(key, {
        key,
        label: d === dayKey() ? 'Today' : fmtDay(d),
        context: t.origin_title,
        items: [],
      });
    }
    out.get(key)!.items.push(t);
  }
  return [...out.values()];
});

async function sendToQueue(t: TaskCard): Promise<void> {
  try {
    await api.moveTask(t.id, 'queued');
    queuedIds.value.add(t.id);
    await loadBoard();
  } catch (e) { toast.error(api.dbError(e)); }
}

async function remove(t: TaskCard): Promise<void> {
  try {
    await api.deleteTask(t.id);
    await loadBoard();
  } catch (e) { toast.error(api.dbError(e)); }
}

const capturedToday = computed(() => tasks.value
  .filter((t) => dayKey(new Date(t.created_at)) === dayKey()).length);

const shortDue = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });

onMounted(() => captureLine.value?.focus());
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <!-- ── capture field: pinned to the top, the list grows DOWNWARD ──
         A chat-style field at the bottom would make the list scroll on every item,
         and scrolling during a meeting kills capture. -->
    <div class="flex-none border-b border-rule bg-surface px-6 pb-2.5 pt-3">
      <div class="mx-auto max-w-[880px]">
        <CaptureLine ref="captureLine" autofocus />
      </div>
    </div>

    <!-- ── list ── -->
    <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4">
      <div class="mx-auto max-w-[880px]">
      <p v-if="!groups.length" class="mt-16 text-center text-[14px] text-fg-subtle">
        Nothing captured.<br>
        <span class="text-[12px]">Type above and press enter — during the meeting, without looking away.</span>
      </p>

      <div v-for="g in groups" :key="g.key" class="mb-5">
        <div class="mb-1.5 flex items-baseline gap-2 border-b border-rule pb-1">
          <span class="label">{{ g.label }}</span>
          <span v-if="g.context" class="flex items-center gap-1.5 text-[11px] text-fg-subtle">
            <span class="text-fg-subtle/50">·</span> during
            <span class="chip bg-meeting/15 text-meeting">{{ g.context }}</span>
          </span>
          <span class="mono ml-auto text-[11px] text-fg-subtle">{{ g.items.length }}</span>
        </div>

        <div v-for="t in g.items" :key="t.id"
          class="group grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg px-2.5 py-2
                 transition-colors hover:bg-surface"
          :class="queuedIds.has(t.id) && 'opacity-55'">
          <div class="flex min-w-0 items-baseline gap-2">
            <button class="truncate text-left text-[14px] leading-snug hover:text-accent-ink"
              @click="openTaskDetail(t.id)">{{ t.title }}</button>
            <span v-if="queuedIds.has(t.id)" class="mono flex-none text-[11px] text-ok">→ queue</span>
          </div>

          <div class="flex flex-none items-center gap-2.5">
            <ProjectChip v-if="t.project_id" :code="t.project_code" :name="t.project_name"
              :color="t.project_color" />
            <span v-if="t.kind === 'meeting'" class="chip bg-meeting/15 text-meeting">meeting</span>
            <span v-if="t.due_at" class="mono text-[11px] text-warn">{{ shortDue(t.due_at) }}</span>

            <div class="flex items-center gap-0.5 opacity-0 transition-opacity
                        group-hover:opacity-100 group-focus-within:opacity-100">
              <button class="rounded-[3px] p-1 text-fg-subtle hover:bg-surface-3 hover:text-fg"
                title="Send to queue" @click="sendToQueue(t)">
                <ArrowRight class="h-3.5 w-3.5" />
              </button>
              <button class="rounded-[3px] p-1 text-fg-subtle hover:bg-surface-3 hover:text-danger"
                title="Delete" @click="remove(t)">
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>

    <div class="flex flex-none items-center gap-3 border-t border-rule bg-surface px-6 py-1.5
                font-mono text-[11px] text-fg-subtle">
      <span>{{ backlog.length }} in capture</span>
      <span>·</span>
      <span>{{ capturedToday }} captured today</span>
    </div>
  </div>
</template>
