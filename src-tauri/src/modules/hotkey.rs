use log::{debug, info};
use std::{process::Command, sync::OnceLock};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState,
};

static PREV_APP_BUNDLE_ID: OnceLock<String> = OnceLock::new();

pub fn setup_global_hotkey<R: Runtime>(
    app: AppHandle<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    let gs = app.global_shortcut();

    // 여기서는 “어떤 조합의 키를 쓸지”만 깔끔하게 나열
    gs.register("CommandOrControl+Shift+V")?;
    //     gs.register("Enter")?;
    //     gs.register("ArrowUp")?;
    //     gs.register("ArrowDown")?;
    //     gs.register("ArrowLeft")?;
    //     gs.register("ArrowRight")?;

    Ok(())
}

fn get_current_app_bundle_id() -> Option<String> {
    let script = r#"
        tell application "System Events"
            try
                set frontApp to first process whose frontmost is true
                return bundle identifier of frontApp
            on error
                return "missing value"
            end try
        end tell
    "#;

    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .ok()?;

    let raw = String::from_utf8_lossy(&output.stdout);
    debug!("Current app bundle ID detected: {:?}", raw);

    if !output.status.success() {
        return None;
    }

    let s = raw.trim();
    if s.is_empty() || s == "missing value" {
        None
    } else {
        Some(s.to_string())
    }
}

fn save_current_app_bundle_id() {
    if let Some(bundle_id) = get_current_app_bundle_id() {
        let _ = PREV_APP_BUNDLE_ID.set(bundle_id.clone());
        info!("✅ Previous app saved: {}", bundle_id);
        debug!("Bundle ID stored: {}", bundle_id);
    } else {
        debug!("⚠️ Failed to get current app bundle ID");
    }
}

pub fn restore_prev_app() {
    use std::process::Command;

    if let Some(bundle_id) = PREV_APP_BUNDLE_ID.get() {
        info!("🔁 Restoring previous app: {}", bundle_id);

        let script = format!(r#"tell application id "{}" to activate"#, bundle_id);

        let status = Command::new("osascript").arg("-e").arg(&script).status();

        debug!("Restore prev app status: {:?}", status);
    } else {
        debug!("No previous app bundle id stored");
    }
}

pub fn handle_shortcut<R: Runtime>(app: &AppHandle<R>, shortcut: &Shortcut, event: ShortcutEvent) {
    // 눌렀을 때만 처리 (Released 이벤트 무시)
    if event.state != ShortcutState::Pressed {
        return;
    }

    match shortcut.key {
        // CommandOrControl+Shift+V 로 등록해도 key는 V라서 이렇게 분기 가능
        Code::KeyV => {
            save_current_app_bundle_id();
            toggle_main_window(app);
        }
        //
        Code::Enter => {
            save_current_app_bundle_id();
            toggle_something_else(app);
        }
        _ => {}
    }
}

fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) {
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

// 예시용: CommandOrControl+Shift+T 에서 실행할 다른 기능
fn toggle_something_else<R: Runtime>(app: &AppHandle<R>) {
    // TODO: 여기에 원하는 동작 넣기 (예: 다른 창 열기, NOTIFY 보내기 등)
    debug!("Enter hotkey pressed → do something else");
}
