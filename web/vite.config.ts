import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import { readFileSync } from 'node:fs';

// Port 5176: the eBOM generator uses 5175 and the thermal tool 5174. That way all three run together.
const PORT = 5176;

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      // MOCK=1 swaps the SQL layer for an in-memory one, to run the UI in the
      // browser without Tauri. Only exists in dev: `pnpm dev:mock`.
      ...(process.env.MOCK
        ? [
            { find: './db.sql', replacement: path.resolve(__dirname, 'src/lib/db.mock.ts') },
            { find: './vault.fs', replacement: path.resolve(__dirname, 'src/lib/vault.mock.ts') },
          ]
        : []),
    ],
  },
  // Reads the SAME package.json that gives the installer its version. npm_package_version
  // would bring the web/ subpackage's, which is not the one the user installed.
  define: {
    __APP_VERSION__: JSON.stringify(
      JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')).version,
    ),
  },

  // Tauri swallows vite's output; without this the errors vanish from the screen.
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
  server: {
    port: PORT,
    strictPort: true,   // failing is better than opening on another port and Tauri pointing at nothing
    host: false,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    // Windows is the main machine: WebView2 is a recent Chromium.
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
