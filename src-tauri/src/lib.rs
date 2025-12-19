mod modules;

use log::{debug, info};
use modules::clipboard;
use modules::db;
use modules::hotkey;
use modules::window_manager;
use tauri::AppHandle;

#[tauri::command]
fn get_clipboard_history() -> Result<Vec<db::PasteItem>, String> {
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

#[tauri::command]
fn get_directories() -> Result<Vec<db::DirectoryInfo>, String> {
    db::get_directories().map_err(|e| e.to_string())
}

#[tauri::command]
fn create_directory(name: String) -> Result<i64, String> {
    db::create_directory(&name).map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_directory(old_name: String, new_name: String) -> Result<(), String> {
    db::rename_directory(&old_name, &new_name).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_directory(name: String) -> Result<(), String> {
    db::delete_directory(&name).map_err(|e| e.to_string())
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

            clipboard::monitor_clipboard(app.handle().clone());
            info!("Clipboard monitoring started");

            hotkey::setup_global_hotkey(app.handle().clone())?;
            info!("Global hotkey setup completed");

            // 마우스 엣지 감지 시작
            window_manager::start_mouse_edge_monitor(app.handle().clone())?;
            info!("Mouse edge detection started");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_clipboard_history,
            get_directories,
            create_directory,
            rename_directory,
            delete_directory,
            paste_text,
            toggle_main_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
