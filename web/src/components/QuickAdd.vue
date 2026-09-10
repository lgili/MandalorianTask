<script setup lang="ts">
// Captura por cima de qualquer tela, na tecla `n`.
//
// É o que o botão "Nova tarefa" da topbar deveria ter sido desde o começo:
// ele navegava para /backlog, o que faz perder o lugar — e, se você já estava
// digitando algo, perder o texto também.
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onKeyStroke } from '@vueuse/core';
import CapturaLinha from './CapturaLinha.vue';
import ChipProjeto from './ChipProjeto.vue';
import { fechaQuickAdd, projetoDe, quickAdd } from '../lib/store';
import { modaisAbertos } from '../lib/teclado';
import { toast } from '../lib/toast';

const captura = ref<InstanceType<typeof CapturaLinha> | null>(null);

onMounted(() => { modaisAbertos.value++; });
onBeforeUnmount(() => { modaisAbertos.value = Math.max(0, modaisAbertos.value - 1); });

watch(quickAdd, async () => { await nextTick(); captura.value?.foca(); }, { immediate: true });

onKeyStroke('Escape', (e) => { e.preventDefault(); fechaQuickAdd(); });

/** Fica aberto depois de gravar: sete tarefas seguidas sem tocar no mouse. */
function criada(): void {
  toast.ok('Tarefa registrada');
}
</script>

<template>
  <div v-if="quickAdd" class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[18vh]"
       @click.self="fechaQuickAdd()">
    <div class="painel w-[620px] max-w-[92vw] p-4 shadow-pop">
      <div class="mb-2.5 flex items-center gap-2">
        <span class="rot">Nova tarefa</span>
        <ChipProjeto v-if="quickAdd.projeto" variante="linha"
          :nome="projetoDe(quickAdd.projeto)?.name" :cor="projetoDe(quickAdd.projeto)?.color"
          class="text-[11px]" />
        <span class="med ml-auto text-[11px] text-fg-subtle">esc fecha</span>
      </div>

      <CapturaLinha ref="captura" :projeto-fixo="quickAdd.projeto"
        :status-inicial="quickAdd.status" autofoco @criada="criada" />

      <p class="mt-2.5 text-[12px] text-fg-subtle">
        Continua aberta depois do enter — registre várias seguidas.
      </p>
    </div>
  </div>
</template>
