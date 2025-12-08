use arboard::Clipboard;
use log::{debug, error, info};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use crate::modules::db;

pub fn get_clipboard() -> String {
    let mut clipboard = Clipboard::new().unwrap();
    let text = clipboard.get_text().unwrap();
    text
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

pub fn monitor_clipboard(db_path: String) {
    thread::spawn(move || {
        let last_content = Arc::new(Mutex::new(String::new()));
        info!("Monitoring clipboard...");

        loop {
            thread::sleep(Duration::from_millis(1000));

            if let Some(current_text) = get_clipboard_text() {
                let mut last = last_content.lock().unwrap();

                if current_text != *last && !current_text.trim().is_empty() {
                    info!("Clipboard content changed: {}", current_text.len());

                    if let Err(e) = db::post_content(&current_text, "test") {
                        error!("Failed to save to database: {:?}", e);
                    } else {
                        debug!("Saved to database");
                        debug!("Current text: {}", current_text);
                    }

                    *last = current_text;
                }
            }
        }
    });
}
