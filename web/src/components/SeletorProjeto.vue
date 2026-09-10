<script setup lang="ts">
// Botão + popover com busca. Substitui o <select> nativo do sistema, que não
// tem busca, não tem cor e não deixa criar projeto sem sair da tela.
import { computed, nextTick, ref } from 'vue';
import { onClickOutside } from '@vueuse/core';
import { ChevronDown } from 'lucide-vue-next';
import ChipProjeto from './ChipProjeto.vue';
import ListaProjetos from './ListaProjetos.vue';
import type { Project } from '../lib/types';
import { criaProjeto, projetoDe } from '../lib/store';
import { modaisAbertos } from '../lib/teclado';

const props = defineProps<{ modelValue: number | null }>();
const emit = defineEmits<{ 'update:modelValue': [number | null] }>();

const aberto = ref(false);
const consulta = ref('');
const raiz = ref<HTMLElement | null>(null);
const campo = ref<HTMLInputElement | null>(null);
const lista = ref<InstanceType<typeof ListaProjetos> | null>(null);

const atual = computed(() => projetoDe(props.modelValue));

async function abre(): Promise<void> {
  aberto.value = true;
  consulta.value = '';
  // Enquanto o popover está aberto, "3" digitado na busca não pode navegar.
  modaisAbertos.value++;
  await nextTick();
  campo.value?.focus();
}

function fecha(): void {
  if (!aberto.value) return;
  aberto.value = false;
  modaisAbertos.value = Math.max(0, modaisAbertos.value - 1);
}

onClickOutside(raiz, fecha);

function escolhe(p: Project | null): void {
  emit('update:modelValue', p?.id ?? null);
  fecha();
}

async function cria(nome: string): Promise<void> {
  const p = await criaProjeto(nome);
  if (p) escolhe(p);
}

function tecla(e: KeyboardEvent): void {
  if (e.key === 'ArrowDown') { e.preventDefault(); lista.value?.mover(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); lista.value?.mover(-1); }
  else if (e.key === 'Enter') { e.preventDefault(); lista.value?.confirma(); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fecha(); }
}
</script>

<template>
  <div ref="raiz" class="relative">
    <button type="button" class="btn w-full justify-start !py-1.5" @click="aberto ? fecha() : abre()">
      <ChipProjeto variante="ponto" :cor="atual?.color ?? null" />
      <span class="min-w-0 flex-1 truncate text-left" :class="atual ? 'text-fg' : 'text-fg-subtle'">
        {{ atual?.name ?? 'Caixa — sem projeto' }}
      </span>
      <ChevronDown class="h-3.5 w-3.5 flex-none opacity-60" />
    </button>

    <div v-if="aberto" class="absolute left-0 top-[calc(100%+6px)] z-50 w-[300px]">
      <div class="painel overflow-hidden shadow-pop">
        <input ref="campo" v-model="consulta" spellcheck="false" autocomplete="off"
          class="w-full border-b border-rule bg-transparent px-3 py-2 text-[14px] text-fg
                 outline-none placeholder:text-fg-subtle"
          placeholder="buscar ou criar projeto…" @keydown="tecla">
      </div>
      <ListaProjetos ref="lista" class="mt-1" :consulta="consulta" incluir-caixa
        @escolhe="escolhe" @cria="cria" />
    </div>
  </div>
</template>
