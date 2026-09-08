/** Tokens semânticos como triplas RGB, para o <alpha-value> do Tailwind funcionar.
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

        // o único saturado: significa "rodando agora"
        vivo: { DEFAULT: v('vivo'), ink: v('vivo-ink'), halo: v('vivo-halo') },

        trabalho: v('trabalho'),
        reuniao: v('reuniao'),
        admin: v('admin'),

        ok: v('ok'),
        warn: v('warn'),
        danger: v('danger'),
        'on-accent': v('on-accent'),
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--shadow) / .06)',
        pop: '0 4px 6px -2px rgb(var(--shadow) / .08), 0 12px 28px -12px rgb(var(--shadow) / .22)',
      },
    },
  },
  plugins: [],
};
