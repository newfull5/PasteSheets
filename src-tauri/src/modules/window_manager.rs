#![allow(unexpected_cfgs)]
use log::debug;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime};

#[cfg(target_os = "macos")]
use objc::{class, msg_send, sel, sel_impl};

static IS_WINDOW_VISIBLE: Mutex<bool> = Mutex::new(false);
static IS_AUTO_HIDE_ENABLED: Mutex<bool> = Mutex::new(false);

pub fn set_window_state(is_visible: bool) {
    if let Ok(mut visible) = IS_WINDOW_VISIBLE.lock() {
        *visible = is_visible;
    }
}

pub fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let mut visible = IS_WINDOW_VISIBLE.lock().unwrap();
        let mut auto_hide = IS_AUTO_HIDE_ENABLED.lock().unwrap();

        // let actual_visible = window.is_visible().unwrap_or(false);
        // if *visible != actual_visible {
        //     *visible = actual_visible;
        // }

        if *visible {
            *visible = false;
            *auto_hide = false;
            let _ = window.emit("window-visible", false);

            let window_clone = window.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(350));

                let still_hidden = {
                    let s = IS_WINDOW_VISIBLE.lock().unwrap();
                    !*s
                };

                if still_hidden {
                    let _ = window_clone.hide();
                    debug!("Window physically hidden after animation delay");
                }
            });
        } else {
            *visible = true;
            *auto_hide = false;

            // Reposition window to the monitor containing the mouse
            if let Some((mouse_x, _mouse_y)) = get_mouse_location() {
                if let Ok(monitors) = window.available_monitors() {
                    for monitor in monitors {
                        let scale_factor = monitor.scale_factor();
                        let pos = monitor.position();
                        let size = monitor.size();

                        let left = pos.x as f64 / scale_factor;
                        let width = size.width as f64 / scale_factor;
                        let right = left + width;

                        if mouse_x >= left && mouse_x <= right {
                            let window_width = 410.0;
                            let x = right - window_width;
                            let y = pos.y as f64 / scale_factor;

                            use tauri::LogicalPosition;
                            let _ = window.set_position(LogicalPosition::new(x, y));
                            debug!(
                                "✅ Window repositioned to active monitor (Logical): ({}, {})",
                                x, y
                            );
                            break;
                        }
                    }
                }
            }

            let _ = window.show();
            let _ = window.set_focus();

            let window_clone = window.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(20));
                let _ = window_clone.emit("window-visible", true);
            });
            debug!("Window shown and animation-start emitted");
        }
    }
}
pub fn start_mouse_edge_monitor<R: Runtime>(
    app: AppHandle<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    set_window_position(&app);

    #[cfg(target_os = "macos")]
    {
        let app_clone = app.clone();
        std::thread::spawn(move || {
            setup_mouse_event_monitoring(app_clone);
        });
    }

    Ok(())
}

fn set_window_position<R: Runtime>(app: &AppHandle<R>) {
    std::thread::sleep(std::time::Duration::from_millis(100));

    if let Some(window) = app.get_webview_window("main") {
        use tauri::LogicalPosition;

        if let Ok(monitors) = window.available_monitors() {
            if let Some(monitor) = monitors.first() {
                let scale_factor = monitor.scale_factor();
                let physical_size = monitor.size();

                let logical_width = physical_size.width as f64 / scale_factor;

                let window_width = 410.0;
                let x = logical_width - window_width;
                let y = 0.0;

                let _ = window.set_position(LogicalPosition::new(x, y));
                debug!(
                    "✅ Window positioned at right edge (Logical): ({}, {})",
                    x, y
                );
            }
        }
    }
}
#[allow(dead_code)]
pub fn stop_mouse_edge_monitor() {
    debug!("🛑 Mouse detection stopped");
}

#[cfg(target_os = "macos")]
fn setup_mouse_event_monitoring<R: Runtime>(app: AppHandle<R>) {
    use std::thread;
    use std::time::Duration;

    thread::spawn(move || loop {
        if let Some((mouse_x, _)) = get_mouse_location() {
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(monitors) = window.available_monitors() {
                    let mut current_screen_right_edge = 0.0;

                    for monitor in monitors {
                        let scale_factor = monitor.scale_factor();
                        let pos = monitor.position();
                        let size = monitor.size();

                        let left = pos.x as f64 / scale_factor;
                        let width = size.width as f64 / scale_factor;
                        let right = left + width;

                        if mouse_x >= left && mouse_x <= right {
                            current_screen_right_edge = right;
                            break;
                        }
                    }

                    if current_screen_right_edge > 0.0 {
                        let show_threshold = 2.0;
                        let hide_threshold = 410.0;

                        let at_right_edge = mouse_x >= current_screen_right_edge - show_threshold;
                        let outside_window = mouse_x < current_screen_right_edge - hide_threshold;

                        let mut visible = IS_WINDOW_VISIBLE.lock().unwrap();
                        let mut auto_hide = IS_AUTO_HIDE_ENABLED.lock().unwrap();

                        if at_right_edge && !*visible {
                            if !window.is_visible().unwrap_or(false) {
                                *visible = true;
                                *auto_hide = true;
                                let _ = window.emit("window-visible", true);
                                let _ = window.show();
                                let _ = window.set_focus();
                                debug!("✅ Window shown from mouse edge (Auto-hide enabled)");
                            }
                        } else if outside_window && *visible && *auto_hide {
                            if window.is_visible().unwrap_or(false) {
                                *visible = false;
                                *auto_hide = false;
                                let _ = window.emit("window-visible", false);
                                thread::sleep(Duration::from_millis(150));
                                let _ = window.hide();
                                debug!("✅ Window hidden (left mouse edge)");
                            }
                        }
                    }
                }
            }
        }
        thread::sleep(Duration::from_millis(100));
    });
}

#[cfg(target_os = "macos")]
fn get_mouse_location() -> Option<(f64, f64)> {
    unsafe {
        let event_class = class!(NSEvent);
        let pos: cocoa::foundation::NSPoint = msg_send![event_class, mouseLocation];
        Some((pos.x, pos.y))
    }
}

#[cfg(target_os = "windows")]
fn get_mouse_location() -> Option<(f64, f64)> {
    None
}

#[cfg(target_os = "windows")]
fn get_screen_width() -> Option<f64> {
    None
}
