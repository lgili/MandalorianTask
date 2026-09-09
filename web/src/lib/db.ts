// Ponto único de troca da camada de dados.
//
// A implementação real é db.sql.ts (SQLite via tauri-plugin-sql). Em
// `pnpm dev:mock` o Vite troca APENAS este import por db.mock.ts, o que faz o
// app inteiro rodar no navegador com dados em memória — útil para ajustar
// visual sem recompilar o binário Rust.
//
// A troca fica aqui, num especificador só, em vez de espalhada em regex sobre
// os caminhos relativos de cada arquivo.
export * from './db.sql';
