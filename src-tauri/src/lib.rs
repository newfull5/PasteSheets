// src-tauri/src/lib.rs

mod modules;

use log::{debug, info};
use modules::clipboard;
use modules::db;

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

            clipboard::monitor_clipboard(db_path);
            info!("Clipboard monitoring started");

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
