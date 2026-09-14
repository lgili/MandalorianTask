<script setup lang="ts">
// Button + popover with search. Replaces the system's native <select>, which has
// no search, no color and no way to create a project without leaving the screen.
import { computed, nextTick, ref } from 'vue';
import { onClickOutside } from '@vueuse/core';
import { ChevronDown } from 'lucide-vue-next';
import ProjectChip from './ProjectChip.vue';
import ProjectList from './ProjectList.vue';
import type { Project } from '../lib/types';
import { createProject, getProject } from '../lib/store';
import { openModals } from '../lib/keyboard';

const props = defineProps<{ modelValue: number | null }>();
const emit = defineEmits<{ 'update:modelValue': [number | null] }>();

const isOpen = ref(false);
const query = ref('');
const root = ref<HTMLElement | null>(null);
const inputEl = ref<HTMLInputElement | null>(null);
const list = ref<InstanceType<typeof ProjectList> | null>(null);

const current = computed(() => getProject(props.modelValue));

async function openPopover(): Promise<void> {
  isOpen.value = true;
  query.value = '';
  // While the popover is open, a "3" typed in the search must not navigate.
  openModals.value++;
  await nextTick();
  inputEl.value?.focus();
}

function closePopover(): void {
  if (!isOpen.value) return;
  isOpen.value = false;
  openModals.value = Math.max(0, openModals.value - 1);
}

onClickOutside(root, closePopover);

function pick(p: Project | null): void {
  emit('update:modelValue', p?.id ?? null);
  closePopover();
}

async function create(name: string): Promise<void> {
  const p = await createProject(name);
  if (p) pick(p);
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'ArrowDown') { e.preventDefault(); list.value?.move(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); list.value?.move(-1); }
  else if (e.key === 'Enter') { e.preventDefault(); list.value?.accept(); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePopover(); }
}
</script>

<template>
  <div ref="root" class="relative">
    <button type="button" class="btn w-full justify-start !py-1.5" @click="isOpen ? closePopover() : openPopover()">
      <ProjectChip variant="dot" :color="current?.color ?? null" />
      <span class="min-w-0 flex-1 truncate text-left" :class="current ? 'text-fg' : 'text-fg-subtle'">
        {{ current?.name ?? 'Inbox — no project' }}
      </span>
      <ChevronDown class="h-3.5 w-3.5 flex-none opacity-60" />
    </button>

    <div v-if="isOpen" class="absolute left-0 top-[calc(100%+6px)] z-50 w-[300px]">
      <div class="panel overflow-hidden shadow-pop">
        <input ref="inputEl" v-model="query" spellcheck="false" autocomplete="off"
          class="w-full border-b border-rule bg-transparent px-3 py-2 text-[14px] text-fg
                 outline-none placeholder:text-fg-subtle"
          placeholder="search or create project…" @keydown="onKeydown">
      </div>
      <ProjectList ref="list" class="mt-1" :query="query" include-inbox
        @pick="pick" @create="create" />
    </div>
  </div>
</template>
