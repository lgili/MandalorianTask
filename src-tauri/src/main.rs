// Bancada — shell Tauri.
//
// Este arquivo é de propósito quase vazio. A lógica do app é TypeScript;
// o Rust aqui só registra plugins e as migrations. Se este arquivo começar
// a crescer, provavelmente a coisa devia estar no frontend.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod migrations;

const DB: &str = "sqlite:bancada.db";

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB, migrations::all())
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        // fs ANTES de persisted-scope: este restaura o escopo daquele.
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Bancada");
}
