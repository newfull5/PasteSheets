use crate::modules::db;
use crate::modules::db::{find_by_content, update_content};
use crate::modules::hotkey::restore_prev_app_native;
use crate::modules::hotkey::toggle_main_window;
use arboard::Clipboard;
use enigo::{
    Direction::{Click, Press, Release},
    Enigo, Key, Keyboard, Settings,
};
use log::{debug, error, info};
use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

const CLIPBOARD_DEFAULT_DIRECTORY: &str = "CLIPBOARD";
const MAX_ITEMS_PER_DIRECTORY: i64 = 3;
const POLLING_INTERVAL: u64 = 100;

// 디렉토리별 최대 개수 초과 시 오래된 항목 삭제
pub fn cleanup_old_items(directory: &str) -> Result<(), rusqlite::Error> {
    let conn = Connection::open(db::get_path())?;

    // 해당 디렉토리의 항목 개수 확인
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM paste_sheets WHERE directory = ?1",
        [directory],
        |row| row.get(0),
    )?;

    // 최대 개수를 초과하면 가장 오래된 항목 삭제
    if count > MAX_ITEMS_PER_DIRECTORY {
        let excess = count - MAX_ITEMS_PER_DIRECTORY;
        conn.execute(
            "DELETE FROM paste_sheets WHERE id IN (
                SELECT id FROM paste_sheets
                WHERE directory = ?1
                ORDER BY created_at ASC
                LIMIT ?2
            )",
            rusqlite::params![directory, excess],
        )?;
    }

    Ok(())
}

pub fn get_clipboard_text() -> Option<String> {
    match Clipboard::new() {
        Ok(mut clipboard) => match clipboard.get_text() {
            Ok(text) => Some(text),
            Err(e) => {
                debug!("Faield to get clipbaord text: {:?}", e);
                None
            }
        },
        Err(e) => {
            error!("Faield to get clipbaord text: {:?}", e);
            None
        }
    }
}

pub fn monitor_clipboard() {
    thread::spawn(move || {
        let last_content = Arc::new(Mutex::new(String::new()));
        info!("Monitoring clipboard...");

        loop {
            thread::sleep(Duration::from_millis(POLLING_INTERVAL));

            if let Some(current_text) = get_clipboard_text() {
                let mut last = last_content.lock().unwrap();

                if current_text != *last && !current_text.trim().is_empty() {
                    info!("Clipboard content changed: {}", current_text.len());

                    match find_by_content(&current_text, CLIPBOARD_DEFAULT_DIRECTORY) {
                        Ok(Some(existing_item)) => {
                            // 이미 있으면 업데이트 (created_at 갱신)
                            info!("Updated existing clipboard content: {:?}", current_text);
                            if let Err(e) = update_content(
                                existing_item.id,
                                &current_text,
                                CLIPBOARD_DEFAULT_DIRECTORY,
                            ) {
                                error!("Failed to update content: {:?}", e);
                            }
                        }
                        Ok(None) => {
                            // 없으면 새로 저장
                            if let Err(e) =
                                db::post_content(&current_text, CLIPBOARD_DEFAULT_DIRECTORY)
                            {
                                error!("Failed to save to database: {:?}", e);
                            } else {
                                debug!("Saved new content to database");
                            }

                            if let Err(e) = cleanup_old_items(CLIPBOARD_DEFAULT_DIRECTORY) {
                                error!("Failed to cleanup old items: {:?}", e);
                            }
                        }
                        Err(e) => {
                            error!("Failed to check content: {:?}", e);
                        }
                    }

                    *last = current_text;
                }
            }
        }
    });
}

pub fn paste_text(text: String) -> Result<(), String> {
    let mut clipboard =
        Clipboard::new().map_err(|e| format!("Failed to create clipboard: {:?}", e))?;
    clipboard
        .set_text(text)
        .map_err(|e| format!("Failed to set clipboard text: {:?}", e))?;

    info!("Text copied to clipbaord");

    restore_prev_app_native();

    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    {
        enigo.key(Key::Meta, Press).map_err(|e| e.to_string())?;
        enigo.raw(9, Click).map_err(|e| e.to_string())?;
        enigo.key(Key::Meta, Release).map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        enigo.key(Key::Control, Press).map_err(|e| e.to_string())?;
        enigo.raw(86, Click).map_err(|e| e.to_string())?;
        enigo
            .key(Key::Control, Release)
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}
