// O que acontece no app, anunciado num lugar só.
//
// Existe por causa dos plugins: é por aqui que código de terceiro fica sabendo
// que uma nota foi salva ou que uma sessão de trabalho começou, sem ninguém
// importar store.ts ou mexer em ref interna. O app emite; plugin escuta.
//
// Os eventos de TEMPO são o que só o Bancada tem — nenhum outro app de notas
// sabe quando você começou a trabalhar numa tarefa. É a API mais valiosa
// que um plugin daqui pode ter.

export interface Eventos {
  'nota:aberta': { path: string };
  'nota:salva': { path: string; texto: string };
  'nota:criada': { path: string };
  'nota:apagada': { path: string };
  'nota:renomeada': { de: string; para: string };
  /** Mudou POR FORA do app — Obsidian, git, Dropbox. O editor aberto recarrega. */
  'nota:externa': { path: string };
  'vault:sincronizado': { total: number };
  'tarefa:criada': { id: number; titulo: string; projeto: number | null };
  'tarefa:movida': { id: number; de: string | null; para: string };
  'sessao:iniciada': { tarefa: number; titulo: string };
  'sessao:encerrada': { tarefa: number | null };
}

export type NomeEvento = keyof Eventos;
type Ouvinte<K extends NomeEvento> = (dado: Eventos[K]) => void;

const ouvintes = new Map<NomeEvento, Set<Ouvinte<NomeEvento>>>();

/** Devolve a função que desinscreve — plugin que esquece de chamar vaza. */
export function escuta<K extends NomeEvento>(nome: K, fn: Ouvinte<K>): () => void {
  if (!ouvintes.has(nome)) ouvintes.set(nome, new Set());
  ouvintes.get(nome)!.add(fn as Ouvinte<NomeEvento>);
  return () => { ouvintes.get(nome)?.delete(fn as Ouvinte<NomeEvento>); };
}

/**
 * Um ouvinte que explode não pode derrubar o app nem calar os outros.
 * Plugin de terceiro com bug é o caso normal, não a exceção.
 */
export function emite<K extends NomeEvento>(nome: K, dado: Eventos[K]): void {
  for (const fn of ouvintes.get(nome) ?? []) {
    try { fn(dado); } catch (e) { console.error(`[evento ${nome}]`, e); }
  }
}
