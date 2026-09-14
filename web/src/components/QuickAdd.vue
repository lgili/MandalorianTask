<script setup lang="ts">
// Capture on top of any screen, on the `n` key.
//
// It's what the topbar's "New task" button should have been from the start:
// it navigated to the capture screen, which loses your place — and, if you were already
// typing something, loses the text too.
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onKeyStroke } from '@vueuse/core';
import CaptureLine from './CaptureLine.vue';
import ProjectChip from './ProjectChip.vue';
import { closeQuickAdd, getProject, quickAdd } from '../lib/store';
import { openModals } from '../lib/keyboard';
import { toast } from '../lib/toast';

const captureLine = ref<InstanceType<typeof CaptureLine> | null>(null);

onMounted(() => { openModals.value++; });
onBeforeUnmount(() => { openModals.value = Math.max(0, openModals.value - 1); });

watch(quickAdd, async () => { await nextTick(); captureLine.value?.focus(); }, { immediate: true });

onKeyStroke('Escape', (e) => { e.preventDefault(); closeQuickAdd(); });

/** Stays open after saving: seven tasks in a row without touching the mouse. */
function onCreated(): void {
  toast.ok('Task added');
}
</script>

<template>
  <div v-if="quickAdd" class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[18vh]"
       @click.self="closeQuickAdd()">
    <div class="panel w-[620px] max-w-[92vw] p-4 shadow-pop">
      <div class="mb-2.5 flex items-center gap-2">
        <span class="label">New task</span>
        <ProjectChip v-if="quickAdd.projectId" variant="line"
          :name="getProject(quickAdd.projectId)?.name" :color="getProject(quickAdd.projectId)?.color"
          class="text-[11px]" />
        <span class="mono ml-auto text-[11px] text-fg-subtle">esc closes</span>
      </div>

      <CaptureLine ref="captureLine" :fixed-project-id="quickAdd.projectId"
        :initial-status="quickAdd.status" autofocus @created="onCreated" />

      <p class="mt-2.5 text-[12px] text-fg-subtle">
        Stays open after enter — add several in a row.
      </p>
    </div>
  </div>
</template>
