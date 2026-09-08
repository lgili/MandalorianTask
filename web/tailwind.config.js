/** Tokens semânticos como triplas RGB, para o <alpha-value> do Tailwind funcionar.
 *  Mesmo sistema do eBOM generator — é a parte boa daquele projeto.
 *  Os valores ficam em src/style.css (:root claro, .dark escuro). */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: v('surface'), 1: v('surface-1'), 2: v('surface-2'), 3: v('surface-3') },
        fg: { DEFAULT: v('fg'), muted: v('fg-muted'), subtle: v('fg-subtle') },
        rule: { DEFAULT: v('rule'), strong: v('rule-strong') },

        // As duas cores que carregam o significado do app: foco x reunião.
        foco: v('foco'),
        reuniao: v('reuniao'),
        admin: v('admin'),
        pausa: v('pausa'),

        ok: v('ok'),
        warn: v('warn'),
        danger: v('danger'),
        'on-accent': v('on-accent'),
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--shadow) / .07)',
        pop: '0 2px 4px rgb(var(--shadow) / .06), 0 10px 28px -18px rgb(var(--shadow) / .34)',
      },
    },
  },
  plugins: [],
};
