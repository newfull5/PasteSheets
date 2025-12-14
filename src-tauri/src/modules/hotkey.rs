use active_win_pos_rs::get_active_window;
use log::{debug, info};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use std::{process::Command, sync::OnceLock};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState,
};

// [변경 1] 값을 계속 업데이트해야 하므로 OnceLock 대신 Mutex 사용
// active-win은 Bundle ID 대신 앱 이름(App Name)을 줍니다. (예: "Google Chrome")
static PREV_APP_NAME: Mutex<Option<String>> = Mutex::new(None);

pub fn setup_global_hotkey<R: Runtime>(
    app: AppHandle<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    let gs = app.global_shortcut();

    // 여기서는 “어떤 조합의 키를 쓸지”만 깔끔하게 나열
    gs.register("CommandOrControl+Shift+V")?;

    Ok(())
}

// [변경 2] osascript 대신 네이티브 API 사용 (속도: 200ms -> 1ms)
fn get_current_app_name() -> Option<String> {
    match get_active_window() {
        Ok(window) => {
            // macOS에서는 window.app_name이 "Google Chrome", "Code" 등으로 나옵니다.
            Some(window.app_name)
        }
        Err(_) => None,
    }
}

pub fn save_current_app() {
    if let Some(app_name) = get_current_app_name() {
        // 내 앱(PasteSheet)이거나 개발 중(Electron)일 때는 저장하지 않음
        if app_name != "PasteSheet" && app_name != "Electron" {
            let mut prev = PREV_APP_NAME.lock().unwrap();
            *prev = Some(app_name.clone());
            debug!("✅ Previous app saved: {}", app_name);
        }
    } else {
        debug!("⚠️ Failed to get current app name");
    }
}

pub fn restore_prev_app(idle_time: u64) {
    let prev = PREV_APP_NAME.lock().unwrap();

    if let Some(app_name) = &*prev {
        info!("🔁 Restoring previous app: {}", app_name);

        // [변경 3] Bundle ID 대신 App Name으로 활성화
        let script = format!(r#"tell application "{}" to activate"#, app_name);

        // [변경 4] spawn()을 사용하여 결과를 기다리지 않고 비동기처럼 실행 (렉 없음)
        let _ = Command::new("osascript").arg("-e").arg(&script).spawn();

        thread::sleep(Duration::from_millis(idle_time));
    }
}

pub fn handle_shortcut<R: Runtime>(app: &AppHandle<R>, shortcut: &Shortcut, event: ShortcutEvent) {
    // 눌렀을 때만 처리
    if event.state != ShortcutState::Pressed {
        return;
    }

    match shortcut.key {
        Code::KeyV => {
            // 창을 띄우기 직전, 현재 활성화된 앱을 저장 (Lazy Check)
            save_current_app();
            toggle_main_window(app);
        }
        Code::Enter => {
            // 엔터를 쳐서 붙여넣기 할 때도 현재 상태를 저장해두면 안전함
            save_current_app();
        }
        _ => {}
    }
}

pub fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
            debug!("Window hidden");
        } else {
            let _ = window.show();
            let _ = window.set_focus();
            debug!("Window shown");
        }
    }
}
