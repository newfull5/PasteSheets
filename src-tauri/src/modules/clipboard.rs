use crate::modules::db;
use crate::modules::hotkey::restore_prev_app;
use arboard::Clipboard;
use enigo::{
    Direction::{Click, Press, Release},
    Enigo, Key, Keyboard,
};
use log::{debug, error, info};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

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

pub fn monitor_clipboard() {
    thread::spawn(move || {
        let last_content = Arc::new(Mutex::new(String::new()));
        info!("Monitoring clipboard...");

        loop {
            thread::sleep(Duration::from_millis(4000));

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

pub fn paste_text(text: String) -> Result<(), String> {
    let mut clipboard =
        Clipboard::new().map_err(|e| format!("Failed to create clipboard: {:?}", e))?;
    clipboard
        .set_text(text)
        .map_err(|e| format!("Failed to set clipboard text: {:?}", e))?;

    info!("Text copied to clipbaord");

    restore_prev_app();

    #[cfg(target_os = "macos")]
    {
        let settings = enigo::Settings::default();
        let mut enigo =
            Enigo::new(&settings).map_err(|e| format!("Failed to create enigo: {:?}", e))?;

        enigo
            .key(Key::Meta, Press)
            .map_err(|e| format!("Meta press failed: {:?}", e))?;
        enigo
            .key(Key::Unicode('v'), Click)
            .map_err(|e| format!("v click failed: {:?}", e))?;
        enigo
            .key(Key::Meta, Release)
            .map_err(|e| format!("Meta release failed: {:?}", e))?;
    }

    Ok(())
}
