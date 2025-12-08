// src-tauri/src/lib.rs

mod modules;

use log::{debug, error, info};
use modules::clipboard;
use modules::db;

#[tauri::command]
fn get_clipboard_history() -> Result<Vec<String>, String> {
    db::get_all_contents().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Debug)
                        .build(),
                )?;
            }

            let _conn = db::init_db().expect("Failed to initialize database");
            info!("Database initialized");
            let db_path = db::get_path();
            debug!("Database path: {:?}", db_path);

            clipboard::monitor_clipboard();
            info!("Clipboard monitoring started");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_clipboard_history])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
