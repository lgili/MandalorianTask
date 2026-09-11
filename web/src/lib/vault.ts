// Ponto único de troca da camada de arquivos — mesmo desenho de db.ts.
// Em `pnpm dev:mock` o Vite troca APENAS este especificador por vault.mock.ts.
export * from './vault.fs';
