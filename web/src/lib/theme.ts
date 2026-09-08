// Tema: claro por padrão — ferramenta de engenharia se usa de dia.
// Aplicado ANTES do mount, senão pisca branco na abertura.

const CHAVE = 'bancada-theme';
export type Tema = 'light' | 'dark';

export function temaAtual(): Tema {
  return (localStorage.getItem(CHAVE) as Tema) ?? 'light';
}

export function aplicaTema(t: Tema): void {
  document.documentElement.classList.toggle('dark', t === 'dark');
  localStorage.setItem(CHAVE, t);
}

export function initTheme(): void {
  aplicaTema(temaAtual());
}

export function alternaTema(): Tema {
  const novo: Tema = temaAtual() === 'dark' ? 'light' : 'dark';
  aplicaTema(novo);
  return novo;
}
