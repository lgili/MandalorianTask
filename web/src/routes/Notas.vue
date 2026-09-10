<script setup lang="ts">
// v0.3 — vault de notas em markdown.
//
// A decisão já está tomada e não muda: os arquivos .md numa pasta são a VERDADE,
// e o SQLite guarda só um índice reconstruível (tabela notes + FTS5). Isso deixa
// o Obsidian de verdade abrir o mesmo vault, e mantém as notas legíveis no dia
// em que este app morrer.
//
// O que falta construir aqui:
//   1. tauri-plugin-fs + escolher a pasta do vault (Ajustes) -> meta['vault_path']
//   2. ler/escrever .md, separar frontmatter (js-yaml) do corpo
//   3. watcher de arquivo -> reindexar o que mudou (mtime)
//   4. migration v3: notes + notes_fts
//   5. templates com {{data}} {{titulo}} {{atividade}} {{participantes}} {{duracao}}
//   6. editor: <textarea> + preview com markdown-it. CodeMirror só se incomodar.
</script>

<template>
  <div class="grid min-h-0 flex-1 place-items-center p-8">
    <div class="max-w-[440px] text-center">
      <h2 class="mb-2 text-base font-semibold">Notas chegam na v0.3</h2>
      <p class="text-[14px] leading-relaxed text-fg-muted">
        Vai apontar para o seu vault do Obsidian, não criar outro. Os arquivos
        <code class="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px]">.md</code>
        são a verdade; o banco guarda só o índice de busca.
      </p>
    </div>
  </div>
</template>
