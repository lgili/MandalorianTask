// Tema: três direções visuais, escolhidas em Ajustes.
// Aplicado ANTES do mount, senão a janela pisca na abertura.

const CHAVE = 'bancada-theme';
export type Tema = 'ledger' | 'noite' | 'claro';
export const TEMAS: Array<{ id: Tema; nome: string; desc: string }> = [
  { id: 'ledger', nome: 'Ledger', desc: 'quase-preto, teal, serif' },
  { id: 'noite',  nome: 'Noite',  desc: 'escuro azulado, índigo' },
  { id: 'claro',  nome: 'Claro',  desc: 'light frio' },
];

export function temaAtual(): Tema {
  const t = localStorage.getItem(CHAVE) as Tema | null;
  return t && TEMAS.some((x) => x.id === t) ? t : 'ledger';
}

export function aplicaTema(t: Tema): void {
  document.documentElement.dataset.theme = t;
  localStorage.setItem(CHAVE, t);
}

export function initTheme(): void {
  // ?tema=claro força um tema nesta abertura (comparar direções, screenshots)
  const q = new URLSearchParams(location.search).get('tema') as Tema | null;
  aplicaTema(q && TEMAS.some((x) => x.id === q) ? q : temaAtual());
}

export function alternaTema(): Tema {
  const i = TEMAS.findIndex((x) => x.id === temaAtual());
  const novo = TEMAS[(i + 1) % TEMAS.length].id;
  aplicaTema(novo);
  return novo;
}
