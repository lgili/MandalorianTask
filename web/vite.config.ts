import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import { readFileSync } from 'node:fs';

// Porta 5176: o eBOM generator usa 5175 e o termico 5174. Assim os três rodam juntos.
const PORTA = 5176;

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      // MOCK=1 troca a camada SQL por uma em memória, para rodar a UI no
      // navegador sem Tauri. Só existe em dev: `pnpm dev:mock`.
      ...(process.env.MOCK
        ? [{ find: './db.sql', replacement: path.resolve(__dirname, 'src/lib/db.mock.ts') }]
        : []),
    ],
  },
  // Lê o MESMO package.json que dá a versão ao instalador. npm_package_version
  // traria a do subpacote web/, que não é a que o usuário instalou.
  define: {
    __APP_VERSION__: JSON.stringify(
      JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')).version,
    ),
  },

  // Tauri engole o output do vite; sem isto os erros somem da tela.
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
  server: {
    port: PORTA,
    strictPort: true,   // falhar é melhor que abrir noutra porta e o Tauri apontar pra vazio
    host: false,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    // Windows é a máquina principal: WebView2 é Chromium recente.
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
