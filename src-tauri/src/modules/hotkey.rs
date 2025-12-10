use log::debug;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState,
};

pub fn setup_global_hotkey<R: Runtime>(
    app: AppHandle<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    let gs = app.global_shortcut();

    // 여기서는 “어떤 조합의 키를 쓸지”만 깔끔하게 나열
    gs.register("CommandOrControl+Shift+V")?;
    gs.register("Enter")?;

    Ok(())
}

pub fn handle_shortcut<R: Runtime>(app: &AppHandle<R>, shortcut: &Shortcut, event: ShortcutEvent) {
    // 눌렀을 때만 처리 (Released 이벤트 무시)
    if event.state != ShortcutState::Pressed {
        return;
    }

    match shortcut.key {
        // CommandOrControl+Shift+V 로 등록해도 key는 V라서 이렇게 분기 가능
        Code::KeyV => {
            toggle_main_window(app);
        }

        Code::Enter => {
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
