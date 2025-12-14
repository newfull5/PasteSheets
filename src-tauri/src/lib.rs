// src-tauri/src/lib.rs

mod modules;

use log::{debug, error, info};
use modules::clipboard;
use modules::db;
use modules::hotkey;
use tauri::AppHandle;

#[tauri::command]
fn get_clipboard_history() -> Result<Vec<String>, String> {
    db::get_all_contents().map_err(|e| e.to_string())
}

#[tauri::command]
fn paste_text(text: String) -> Result<(), String> {
    clipboard::paste_text(text)
}

#[tauri::command]
fn toggle_main_window(app: AppHandle) {
    hotkey::toggle_main_window(&app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(hotkey::handle_shortcut)
                .build(),
        )
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Debug)
                        .build(),
                )?;
            }
            hotkey::save_current_app();

            let _conn = db::init_db().expect("Failed to initialize database");
            info!("Database initialized");
            let db_path = db::get_path();
            debug!("Database path: {:?}", db_path);

            clipboard::monitor_clipboard();
            info!("Clipboard monitoring started");

            hotkey::setup_global_hotkey(app.handle().clone())?;

            info!("Global hotkey setup completed");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_clipboard_history,
            paste_text,
            toggle_main_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
