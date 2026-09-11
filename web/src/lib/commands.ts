// Registro de comandos: tudo que o app sabe fazer, com nome, num lugar só.
//
// A paleta (Ctrl+P) lista isto. O app registra os dele na abertura; plugins
// registram os seus pela API. É o `addCommand` do Obsidian — a porta de
// entrada mais simples para um plugin: uma função e um nome.

import { shallowRef } from 'vue';

export interface Comando {
  id: string;
  nome: string;
  /** 'bancada' para os do app; o id do plugin para os de terceiros. */
  dono: string;
  /** Só exibição — o atalho de verdade é registrado em outro lugar. */
  tecla?: string;
  executa: () => void | Promise<void>;
}

export const comandos = shallowRef<Comando[]>([]);

/** Devolve a função que remove. Id repetido substitui o anterior. */
export function registraComando(c: Comando): () => void {
  comandos.value = [...comandos.value.filter((x) => x.id !== c.id), c];
  return () => { comandos.value = comandos.value.filter((x) => x !== c); };
}

export async function executaComando(id: string): Promise<void> {
  const c = comandos.value.find((x) => x.id === id);
  if (!c) return;
  try {
    await c.executa();
  } catch (e) {
    // Comando de plugin com bug não derruba o app.
    console.error(`[comando ${id}]`, e);
    throw e;
  }
}
