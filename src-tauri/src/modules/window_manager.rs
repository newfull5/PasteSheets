use log::debug;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Runtime};

#[cfg(target_os = "macos")]
use objc::{class, msg_send, sel, sel_impl};

// 윈도우가 엣지로 표시 중인지 추적
static WINDOW_SHOWN_BY_EDGE: Mutex<bool> = Mutex::new(false);

pub fn start_mouse_edge_monitor<R: Runtime>(
    app: AppHandle<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    // 첫 시작 시 창 위치 설정
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
    // 약간의 지연 (창이 완전히 초기화될 때까지)
    std::thread::sleep(std::time::Duration::from_millis(100));

    if let Some(window) = app.get_webview_window("main") {
        #[cfg(target_os = "macos")]
        {
            use tauri::PhysicalPosition;

            if let Ok(monitors) = window.available_monitors() {
                if let Some(monitor) = monitors.first() {
                    let size = monitor.size();
                    let window_width = 410.0;
                    let x = size.width as f64 - window_width;
                    let y = 0.0;

                    let _ = window.set_position(PhysicalPosition::new(x as i32, y as i32));
                    debug!("✅ Window positioned at right edge: ({}, {})", x, y);
                }
            }
        }

        #[cfg(target_os = "windows")]
        {
            use tauri::PhysicalPosition;

            if let Ok(monitors) = window.available_monitors() {
                if let Some(monitor) = monitors.first() {
                    let size = monitor.size();
                    let window_width = 410.0;
                    let x = size.width as f64 - window_width;
                    let y = 0.0;

                    let _ = window.set_position(PhysicalPosition::new(x as i32, y as i32));
                    debug!("✅ Window positioned at right edge: ({}, {})", x, y);
                }
            }
        }
    }
}
pub fn stop_mouse_edge_monitor() {
    debug!("🛑 Mouse edge detection stopped");
}

#[cfg(target_os = "macos")]
fn setup_mouse_event_monitoring<R: Runtime>(app: AppHandle<R>) {
    use std::thread;
    use std::time::Duration;

    thread::spawn(move || {
        loop {
            if let Some(mouse_x) = get_mouse_x() {
                if let Some(screen_width) = get_screen_width() {
                    let threshold = 10.0;
                    let at_right_edge = mouse_x >= screen_width - threshold;

                    let mut shown = WINDOW_SHOWN_BY_EDGE.lock().unwrap();

                    // 엣지에 들어감
                    if at_right_edge && !*shown {
                        if let Some(window) = app.get_webview_window("main") {
                            if !window.is_visible().unwrap_or(false) {
                                let _ = window.show();
                                let _ = window.set_focus();
                                *shown = true;
                                debug!("✅ Window shown from mouse edge");
                            }
                        }
                    }
                    // 엣지에서 떠남
                    else if !at_right_edge && *shown {
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                                *shown = false;
                                debug!("✅ Window hidden (left mouse edge)");
                            }
                        }
                    }
                }
            }

            thread::sleep(Duration::from_millis(100));
        }
    });
}

#[cfg(target_os = "macos")]
fn get_mouse_x() -> Option<f64> {
    unsafe {
        let event_class = class!(NSEvent);
        let pos: cocoa::foundation::NSPoint = msg_send![event_class, mouseLocation];
        Some(pos.x)
    }
}

#[cfg(target_os = "macos")]
fn get_screen_width() -> Option<f64> {
    unsafe {
        let screens_class = class!(NSScreen);
        let screens: cocoa::base::id = msg_send![screens_class, screens];

        if screens.is_null() {
            return None;
        }

        let count: usize = msg_send![screens, count];
        if count == 0 {
            return None;
        }

        let screen: cocoa::base::id = msg_send![screens, objectAtIndex: 0];
        let frame: cocoa::foundation::NSRect = msg_send![screen, visibleFrame];

        Some(frame.size.width + frame.origin.x)
    }
}

#[cfg(target_os = "windows")]
fn get_mouse_x() -> Option<f64> {
    None
}

#[cfg(target_os = "windows")]
fn get_screen_width() -> Option<f64> {
    None
}
