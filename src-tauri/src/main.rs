// Bancada — Tauri shell.
//
// This file is deliberately almost empty. The app's logic is TypeScript; the
// Rust side only registers plugins and migrations. If this file starts to
// grow, the thing probably belongs in the frontend. The one exception is the
// backup below, which has to run before the frontend opens the database.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod migrations;

use tauri::Manager;

const DB: &str = "sqlite:bancada.db";

/// One copy of the database taken BEFORE migration v4 ever runs.
///
/// v4 rewrites status, kind and outcome values into English. It runs in a
/// transaction and is tested against the real migrator, but it is the first
/// migration that rewrites existing rows — a logic slip there would be applied
/// "successfully". This copy is the way back.
///
/// Migrations run when the frontend calls `Database.load()`, which is always
/// after `setup`, so the first launch of a v4 build sees the pre-v4 file. The
/// -wal/-shm files go too — sqlx uses WAL, and committed data can still be
/// sitting in the -wal after a crash.
///
/// The decision is made exactly once, on that first launch, and recorded in a
/// marker file. Checking only for the copy would be wrong twice: on a fresh
/// install launch 1 has no database, so launch 2 would save an already-v4
/// database as "pre-v4"; and deleting the copy would do the same.
fn backup_before_v4(app: &tauri::AppHandle) {
    let Ok(dir) = app.path().app_config_dir() else { return };
    let marker = dir.join("bancada.pre-v4.done");
    if marker.exists() || dir.join("bancada.pre-v4.db").exists() {
        return;
    }
    if dir.join("bancada.db").exists() {
        for suffix in ["", "-wal", "-shm"] {
            let from = dir.join(format!("bancada.db{suffix}"));
            let to = dir.join(format!("bancada.pre-v4.db{suffix}"));
            if from.exists() {
                if let Err(e) = std::fs::copy(&from, &to) {
                    eprintln!("backup before migration v4 failed ({}): {e}", from.display());
                }
            }
        }
    }
    // Written even if a copy failed: from here on the database is v4, and a
    // retry on the next launch would only save the migrated file.
    if let Err(e) = std::fs::create_dir_all(&dir).and_then(|()| std::fs::write(&marker, b"")) {
        eprintln!("could not record the v4 backup marker: {e}");
    }
}

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
        // fs BEFORE persisted-scope: the latter restores the former's scope.
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .setup(|app| {
            backup_before_v4(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while starting Bancada");
}
