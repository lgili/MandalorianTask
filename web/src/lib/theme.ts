// Theme: three visual directions, chosen in Settings.
// Applied BEFORE mount, otherwise the window flashes on open.

const KEY = 'bancada-theme';
export type Theme = 'ledger' | 'night' | 'light';
export const THEMES: Array<{ id: Theme; name: string; desc: string }> = [
  { id: 'ledger', name: 'Ledger', desc: 'near-black, teal, serif' },
  { id: 'night',  name: 'Night',  desc: 'bluish dark, indigo' },
  { id: 'light',  name: 'Light',  desc: 'cool light' },
];

// Theme ids stored before the English rename. Mapped on read so the user's
// choice survives the upgrade; the next applyTheme writes the new id back.
const LEGACY_IDS = new Map<string, Theme>([['noite', 'night'], ['claro', 'light']]);

export function currentTheme(): Theme {
  const stored = localStorage.getItem(KEY);
  const t = (stored && LEGACY_IDS.get(stored)) || (stored as Theme | null);
  return t && THEMES.some((x) => x.id === t) ? t : 'ledger';
}

export function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t;
  localStorage.setItem(KEY, t);
}

export function initTheme(): void {
  // ?theme=light forces a theme for this launch (comparing directions, screenshots)
  const q = new URLSearchParams(location.search).get('theme') as Theme | null;
  applyTheme(q && THEMES.some((x) => x.id === q) ? q : currentTheme());
}

export function cycleTheme(): Theme {
  const i = THEMES.findIndex((x) => x.id === currentTheme());
  const next = THEMES[(i + 1) % THEMES.length].id;
  applyTheme(next);
  return next;
}
