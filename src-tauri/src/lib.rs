#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // The remote website needs no native commands or plugins.
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
