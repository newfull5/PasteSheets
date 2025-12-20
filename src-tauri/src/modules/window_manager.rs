use log::debug;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime};

#[cfg(target_os = "macos")]
use objc::{class, msg_send, sel, sel_impl};

// 윈도우 표시 상태 및 자동 닫기 활성화 여부 추적
static IS_WINDOW_VISIBLE: Mutex<bool> = Mutex::new(false);
static IS_AUTO_HIDE_ENABLED: Mutex<bool> = Mutex::new(false);

pub fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let mut visible = IS_WINDOW_VISIBLE.lock().unwrap();
        let mut auto_hide = IS_AUTO_HIDE_ENABLED.lock().unwrap();

        // 실제 윈도우의 상태와 플래그를 동기화 (예외 상황 대비)
        let actual_visible = window.is_visible().unwrap_or(false);
        if *visible != actual_visible {
            *visible = actual_visible;
        }

        if *visible {
            // [상태: 현재 보임 -> 숨김으로 변경]
            *visible = false;
            *auto_hide = false; // 단축키로 닫을 때 자동닫기 해제
                                // 1. 프론트엔드에 애니메이션 시작 신호를 먼저 보냄
            let _ = window.emit("window-visible", false);

            // 2. 별도 스레드에서 대기 후, 여전히 숨김 상태일 때만 hide() 호출
            let window_clone = window.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(350));

                // 다시 한 번 상태를 확인 (대기 중에 다시 켜졌을 수도 있음)
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
            // [상태: 표시]
            *visible = true;
            *auto_hide = false; // 단축키로 열 때는 마우스가 나가도 안 닫히게 설정

            // 1. 먼저 윈도우를 보여줌
            let _ = window.show();
            let _ = window.set_focus();

            // 2. 아주 살짝의 텀을 두고 애니메이션 신호를 보냄 (레이아웃 준비 시간)
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
        use tauri::LogicalPosition;

        if let Ok(monitors) = window.available_monitors() {
            if let Some(monitor) = monitors.first() {
                let scale_factor = monitor.scale_factor();
                let physical_size = monitor.size();

                // 물리 픽셀을 배율로 나눠서 논리 좌표(Points) 구하기
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
    debug!("🛑 Mouse edge detection stopped");
}

#[cfg(target_os = "macos")]
fn setup_mouse_event_monitoring<R: Runtime>(app: AppHandle<R>) {
    use std::thread;
    use std::time::Duration;

    thread::spawn(move || {
        loop {
            if let Some(mouse_x) = get_mouse_x() {
                if let Some(window) = app.get_webview_window("main") {
                    if let Ok(monitors) = window.available_monitors() {
                        let mut current_screen_right_edge = 0.0;

                        for monitor in monitors {
                            let scale_factor = monitor.scale_factor();
                            let pos = monitor.position();
                            let size = monitor.size();

                            // 논리적 좌표로 변환하여 모든 디스플레이에서 동일한 비율의 거리값 사용
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

                            let at_right_edge =
                                mouse_x >= current_screen_right_edge - show_threshold;
                            let outside_window =
                                mouse_x < current_screen_right_edge - hide_threshold;

                            let mut visible = IS_WINDOW_VISIBLE.lock().unwrap();
                            let mut auto_hide = IS_AUTO_HIDE_ENABLED.lock().unwrap();

                            if at_right_edge && !*visible {
                                // 엣지에 닿아 새로 보여주는 경우
                                if !window.is_visible().unwrap_or(false) {
                                    *visible = true;
                                    *auto_hide = true; // 마우스로 열었으니 자동 닫기 활성화
                                    let _ = window.emit("window-visible", true);
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                    debug!("✅ Window shown from mouse edge (Auto-hide enabled)");
                                }
                            } else if outside_window && *visible && *auto_hide {
                                // 창 밖으로 나갔고, 자동 닫기가 활성화된 상태일 때만 닫음
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

#[cfg(target_os = "windows")]
fn get_mouse_x() -> Option<f64> {
    None
}

#[cfg(target_os = "windows")]
fn get_screen_width() -> Option<f64> {
    None
}
