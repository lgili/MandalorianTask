<script setup lang="ts">
import { ref, watch } from 'vue';
import { Trash2 } from 'lucide-vue-next';
import { onKeyStroke } from '@vueuse/core';
import type { SessionCard } from '../lib/types';
import { openModals } from '../lib/keyboard';
import { minutesOfDay, toUtc, fmtDur, GRAIN_MIN } from '../lib/time';

const props = defineProps<{ session: SessionCard | null; day: string }>();
const emit = defineEmits<{
  save: [id: number, patch: { started_at: string; ended_at: string }];
  delete: [id: number];
  close: [];
}>();

const startMin = ref(540);
const endMin = ref(600);

watch(() => props.session, (s) => {
  openModals.value = s ? 1 : 0;
  if (!s) return;
  startMin.value = minutesOfDay(s.started_at);
  endMin.value = s.ended_at ? minutesOfDay(s.ended_at) : startMin.value + 60;
}, { immediate: true });

onKeyStroke('Escape', () => { if (props.session) emit('close'); });

const hm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * MEASURED time is never rounded; time adjusted by hand is. That's why the input
 * uses a 15-min step, while an automatic session keeps the whole minute it
 * measured — fixing a time must not rewrite what was observed.
 */
function adjust(target: EventTarget | null, set: (m: number) => void, read: () => number): void {
  const el = target as HTMLInputElement | null;
  if (!el) return;
  const [h, m] = el.value.split(':').map(Number);
  set(Math.round((h * 60 + m) / GRAIN_MIN) * GRAIN_MIN);
  el.value = hm(read());   // if the snap lands on the same value, the DOM wouldn't repaint on its own
}
</script>

<template>
  <div v-if="session" class="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4"
       @click.self="emit('close')">
    <div class="panel w-full max-w-[400px] shadow-pop">
      <div class="border-b border-rule px-4 py-2.5">
        <div class="label mb-0.5">fix session</div>
        <div class="truncate text-[14px] font-semibold">{{ session.title }}</div>
      </div>

      <div class="flex items-end gap-3 p-4">
        <label class="flex-1">
          <span class="label mb-1 block">Start</span>
          <input class="inp mono" type="time" :step="GRAIN_MIN * 60" :value="hm(startMin)"
                 @change="adjust($event.target, (m) => (startMin = m), () => startMin)">
        </label>
        <label class="flex-1">
          <span class="label mb-1 block">End</span>
          <input class="inp mono" type="time" :step="GRAIN_MIN * 60" :value="hm(endMin)"
                 @change="adjust($event.target, (m) => (endMin = m), () => endMin)">
        </label>
        <div class="mono pb-2 text-[14px] font-semibold"
             :class="endMin > startMin ? 'text-fg-muted' : 'text-danger'">
          {{ endMin > startMin ? fmtDur(endMin - startMin) : 'invalid' }}
        </div>
      </div>

      <div class="flex items-center gap-2 border-t border-rule px-4 py-2.5">
        <button class="btn btn-danger" @click="emit('delete', session.id)">
          <Trash2 class="h-3.5 w-3.5" />Delete
        </button>
        <div class="flex-1" />
        <button class="btn" @click="emit('close')">Cancel</button>
        <button class="btn btn-accent" :disabled="endMin <= startMin"
          @click="emit('save', session.id, { started_at: toUtc(day, startMin), ended_at: toUtc(day, endMin) })">
          Save
        </button>
      </div>
    </div>
  </div>
</template>
