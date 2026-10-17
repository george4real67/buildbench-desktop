use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use std::time::Duration;
use tauri::{LogicalPosition, LogicalSize, Manager, WebviewUrl};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::UpdaterExt;

const BAR_HEIGHT: f64 = 52.0;
const CHECK_URL: &str = "https://buildbench.invalid/check-for-updates";
const APP_START_URL: &str = "https://buildbench.online/#/login";
// Presentation and routing only. This script grants no native or account permissions.
const DESKTOP_INIT: &str = r#"
(() => {
    if (window.top !== window || location.origin !== 'https://buildbench.online') return;
    const marketing = new Set(['/', '/index.html', '/how-it-works', '/how-it-works.html', '/pricing', '/pricing.html']);
    const route = () => location.hash.startsWith('#/') ? location.hash.slice(1) : location.pathname.replace(/\/$/, '') || '/';
    const destination = path => /^\/pricing(?:\.html)?$/.test(path) ? '/credits' : '/dashboard';
    const leaveMarketing = () => {
        const path = route();
        if (!marketing.has(path)) return false;
        location.replace('/#' + destination(path));
        return true;
    };
    if (leaveMarketing()) return;
    window.addEventListener('hashchange', event => {
        if (marketing.has(route())) { event.stopImmediatePropagation(); leaveMarketing(); }
    }, true);
    document.addEventListener('click', event => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const anchor = event.target.closest?.('a[href]');
        if (!anchor || anchor.hasAttribute('download') || anchor.target === '_blank') return;
        const href = anchor.getAttribute('href') || '';
        if (href.startsWith('#') && !href.startsWith('#/')) return;
        const url = new URL(anchor.href, location.href);
        if (url.origin !== location.origin) return;
        const path = url.hash.startsWith('#/') ? url.hash.slice(1) : url.pathname.replace(/\/$/, '') || '/';
        if (!marketing.has(path)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const next = destination(path);
        if (window.__bizAppBridge?.navigate) window.__bizAppBridge.navigate(next);
        else location.hash = next;
    }, true);
    // Hide server-rendered marketing content while Firebase restores the session.
    const observer = new MutationObserver(() => {
        if (!document.documentElement) return;
        if (!document.getElementById('bb-desktop-style')) {
            const style = document.createElement('style');
            style.id = 'bb-desktop-style';
            style.textContent = '#app:has(main[data-public-route]){visibility:hidden}body:has(#app main[data-public-route])::before{content:"Opening BuildBench…";position:fixed;inset:0;display:grid;place-items:center;color:var(--ink,#23272f);background:var(--paper,#fafbfc);font:500 15px Inter,system-ui,sans-serif}';
            document.documentElement.append(style);
        }
        if (document.querySelector('#app .auth-shell, #app .app-shell, #app .access-restricted')) observer.disconnect();
    });
    observer.observe(document, {childList: true, subtree: true});
})();
"#;

fn status(app: &tauri::AppHandle, message: &str, busy: bool) {
    if let Some(bar) = app.get_webview("app-toolbar") {
        // Messages are generated locally (never release notes or remote strings).
        let message = message.replace('\\', "\\\\").replace('\'', "\\'");
        let _ = bar.eval(format!(
            "document.getElementById('update-status').textContent='{message}';document.getElementById('update-button').setAttribute('aria-disabled','{busy}');"
        ));
    }
}

async fn check_update(
    app: &tauri::AppHandle,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    status(app, "Checking for updates...", true);
    let updater = app
        .updater_builder()
        .timeout(Duration::from_secs(30))
        .build()?;
    let Some(update) = updater.check().await? else {
        status(app, "You're up to date", false);
        app.dialog()
            .message(format!(
                "BuildBench {} is up to date.",
                app.package_info().version
            ))
            .title("BuildBench updates")
            .blocking_show();
        return Ok(());
    };
    status(app, "Update available", true);
    let accepted = app.dialog()
        .message(format!("BuildBench {} is available. Save your work before continuing. The app will close to install the update.", update.version))
        .title("Update BuildBench")
        .buttons(MessageDialogButtons::OkCancelCustom("Update now".into(), "Later".into()))
        .blocking_show();
    if !accepted {
        status(app, "Update available", false);
        return Ok(());
    }
    status(app, "Downloading update...", true);
    let progress_app = app.clone();
    let finish_app = app.clone();
    let mut downloaded: u64 = 0;
    let mut last_percent: u64 = 101;
    update
        .download_and_install(
            move |chunk, total| {
                downloaded += chunk as u64;
                if let Some(total) = total.filter(|size| *size > 0) {
                    let percent = downloaded
                        .saturating_mul(100)
                        .checked_div(total)
                        .unwrap_or(0)
                        .min(100);
                    if percent != last_percent {
                        last_percent = percent;
                        status(&progress_app, &format!("Downloading {percent}%"), true);
                    }
                }
            },
            move || status(&finish_app, "Verifying and installing...", true),
        )
        .await?;
    app.restart();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let window = tauri::window::WindowBuilder::from_config(app, &app.config().app.windows[0])?.build()?;
            let content = window.add_child(
                tauri::webview::WebviewBuilder::new("main", WebviewUrl::External(APP_START_URL.parse()?))
                    .initialization_script(DESKTOP_INIT)
                    .devtools(false).zoom_hotkeys_enabled(true),
                LogicalPosition::new(0.0, BAR_HEIGHT),
                LogicalSize::new(1280.0, 800.0 - BAR_HEIGHT),
            )?;
            let busy = Arc::new(AtomicBool::new(false));
            let update_app = app.handle().clone();
            let toolbar = window.add_child(
                tauri::webview::WebviewBuilder::new("app-toolbar", WebviewUrl::App("toolbar.html".into()))
                    .devtools(false)
                    .on_navigation(move |url| {
                        if url.as_str() == CHECK_URL {
                            if !busy.swap(true, Ordering::SeqCst) {
                                let app = update_app.clone();
                                let busy = busy.clone();
                                // Blocking native dialogs run off the main UI thread.
                                std::thread::spawn(move || {
                                    if tauri::async_runtime::block_on(check_update(&app)).is_err() {
                                        status(&app, "Couldn't check or install update", false);
                                        app.dialog().message("The update could not be completed. Check your internet connection and try again. Your current app is still available.")
                                            .title("BuildBench updates").blocking_show();
                                    }
                                    busy.store(false, Ordering::SeqCst);
                                });
                            }
                            false
                        } else {
                            // The toolbar must remain local. It has no native IPC permissions.
                            matches!(url.scheme(), "tauri" | "http" | "https") &&
                                matches!(url.host_str(), Some("tauri.localhost" | "localhost"))
                        }
                    }),
                LogicalPosition::new(0.0, 0.0),
                LogicalSize::new(1280.0, BAR_HEIGHT),
            )?;
            let resize = move |width: f64, height: f64| {
                let _ = toolbar.set_size(LogicalSize::new(width, BAR_HEIGHT));
                let _ = content.set_position(LogicalPosition::new(0.0, BAR_HEIGHT));
                let _ = content.set_size(LogicalSize::new(width, (height - BAR_HEIGHT).max(1.0)));
            };
            let scale = window.scale_factor()?;
            let initial = window.inner_size()?.to_logical::<f64>(scale);
            resize(initial.width, initial.height);
            let resize_window = window.clone();
            window.on_window_event(move |event| {
                if matches!(event, tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. }) {
                    if let (Ok(size), Ok(scale)) = (resize_window.inner_size(), resize_window.scale_factor()) {
                        let size = size.to_logical::<f64>(scale);
                        resize(size.width, size.height);
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
