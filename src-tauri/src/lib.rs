mod modules;

use log::{debug, info};
use modules::clipboard;
use modules::db;
use modules::hotkey;
use modules::window_manager;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::AppHandle;

#[tauri::command]
fn get_clipboard_history() -> Result<Vec<db::PasteItem>, String> {
    db::get_all_contents().map_err(|e| e.to_string())
}

#[tauri::command]
fn create_history_item(
    content: String,
    directory: String,
    memo: Option<String>,
) -> Result<i64, String> {
    db::post_content(&content, &directory, memo.as_deref()).map_err(|e| e.to_string())
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

#[tauri::command]
fn update_history_item(
    id: i64,
    content: String,
    directory: String,
    memo: Option<String>,
) -> Result<(), String> {
    db::update_content(id, &content, &directory, memo.as_deref())
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_history_item(id: i64) -> Result<(), String> {
    db::delete_history_item(id).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(hotkey::handle_shortcut)
                .build(),
        )
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                let _ = window.hide();
                api.prevent_close();
            }
            _ => {}
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Debug)
                        .build(),
                )?;
            }
            hotkey::save_current_app();

            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let _conn = db::init_db().expect("Failed to initialize database");
            info!("Database initialized");
            let db_path = db::get_path();
            debug!("Database path: {:?}", db_path);

            let quit_i = MenuItem::with_id(app, "quit", "Quit PasteSheet", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show App", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        window_manager::toggle_main_window(app);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Down,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        window_manager::toggle_main_window(app);
                    }
                })
                .build(app)?;

            clipboard::monitor_clipboard(app.handle().clone());
            info!("Clipboard monitoring started");

            hotkey::setup_global_hotkey(app.handle().clone())?;
            info!("Global hotkey setup completed");

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
            toggle_main_window,
            update_history_item,
            delete_history_item,
            create_history_item
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
