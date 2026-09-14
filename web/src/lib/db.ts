// Single swap point for the data layer.
//
// The real implementation is db.sql.ts (SQLite via tauri-plugin-sql). Under
// `pnpm dev:mock` Vite swaps ONLY this import for db.mock.ts, which makes the
// whole app run in the browser with in-memory data — handy for tuning the
// visuals without recompiling the Rust binary.
//
// The swap lives here, in a single specifier, instead of being spread across
// regexes over every file's relative paths.
export * from './db.sql';
