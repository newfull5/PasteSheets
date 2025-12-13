use crate::modules::db;
use crate::modules::hotkey::restore_prev_app;
use arboard::Clipboard;
use enigo::{
    Direction::{Click, Press, Release},
    Enigo, Key, Keyboard, Settings,
};
use log::{debug, error, info};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

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
