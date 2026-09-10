const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', ':root:not([data-theme="claro"])'],
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: v('surface'), 1: v('surface-1'), 2: v('surface-2'), 3: v('surface-3') },
        fg: { DEFAULT: v('fg'), muted: v('fg-muted'), subtle: v('fg-subtle') },
        rule: { DEFAULT: v('rule'), strong: v('rule-strong') },
        accent: { DEFAULT: v('accent'), ink: v('accent-ink') },
        vivo: { DEFAULT: v('vivo'), ink: v('vivo-ink') },
        p1: v('p1'), p2: v('p2'), p3: v('p3'), p4: v('p4'), p5: v('p5'), p6: v('p6'),
        trabalho: v('trabalho'), reuniao: v('reuniao'), admin: v('admin'),
        ok: v('ok'), warn: v('warn'), danger: v('danger'),
        'on-accent': v('on-accent'),
      },
      fontFamily: {
        sans: ['"Instrument Sans Variable"', '"Instrument Sans"', 'system-ui', 'Segoe UI', 'sans-serif'],
        serif: ['"Newsreader Variable"', 'Newsreader', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono Variable"', '"JetBrains Mono"', 'ui-monospace', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--shadow) / .18), 0 1px 1px rgb(var(--shadow) / .08)',
        pop: '0 2px 6px rgb(var(--shadow) / .2), 0 16px 40px -16px rgb(var(--shadow) / .45)',
        glow: '0 0 0 1px rgb(var(--glow) / .35), 0 6px 20px -6px rgb(var(--glow) / .55)',
        live: '0 0 0 1px rgb(var(--vivo) / .45), 0 0 24px -4px rgb(var(--vivo) / .45)',
      },
      borderRadius: { xl: '12px', '2xl': '16px' },
    },
  },
  plugins: [],
};
