use active_win_pos_rs::get_active_window;
use cocoa::base::{id, nil};
use cocoa::foundation::{NSArray, NSString};
use log::{debug, info};
use objc::{class, msg_send, sel, sel_impl};
use std::ffi::CStr;
use std::ffi::CString;
use std::sync::Mutex;
use tauri::{AppHandle, Runtime};
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

pub fn restore_prev_app_native() {
    #[cfg(target_os = "macos")]
    {
        let prev = PREV_APP_NAME.lock().unwrap();

        if let Some(target_app_name) = &*prev {
            // info!("⚡️ Restoring app: {}", target_app_name); // 로그 필요시 주석 해제

            unsafe {
                // 1. NSWorkspace 클래스를 직접 찾아서 sharedWorkspace 호출
                //    (import 필요 없음)
                let workspace_class = class!(NSWorkspace);
                let workspace: id = msg_send![workspace_class, sharedWorkspace];

                // 2. 실행 중인 앱 목록 가져오기
                let running_apps: id = msg_send![workspace, runningApplications];
                let count: usize = msg_send![running_apps, count];

                for i in 0..count {
                    let app: id = msg_send![running_apps, objectAtIndex: i];

                    // 3. 앱 이름 가져오기
                    let ns_name: id = msg_send![app, localizedName];
                    if ns_name == nil {
                        continue;
                    }

                    // NSString -> Rust String 변환
                    let name_ptr: *const i8 = msg_send![ns_name, UTF8String];
                    let name_cstr = CStr::from_ptr(name_ptr);

                    if let Ok(name_str) = name_cstr.to_str() {
                        if name_str == target_app_name {
                            // 4. 활성화 옵션 (NSApplicationActivateIgnoringOtherApps = 1 << 1)
                            //    상수를 직접 써서 import 에러 방지
                            let options: usize = 1 << 1;

                            let _: bool = msg_send![app, activateWithOptions: options];
                            return;
                        }
                    }
                }
            }
        }
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
    use crate::modules::window_manager;
    window_manager::toggle_main_window(app);
}
