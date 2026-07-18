use tauri_plugin_fs::FsExt;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Upgrades an already user-approved directory to recursive file-system access.
///
/// The root path must already exist in Tauri's runtime scope. This prevents the
/// frontend from granting access to arbitrary directories that the user has
/// never selected through the native dialog.
#[tauri::command]
fn restore_library_source_scope(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let normalized_path = path.trim();

    if normalized_path.is_empty() {
        return Err("A library source path is required to restore file-system access.".to_owned());
    }

    let scope = app.fs_scope();

    if !scope.is_allowed(normalized_path) {
        return Err(
            "FilePilot cannot restore this folder because it was not previously approved by the user."
                .to_owned(),
        );
    }

    scope
        .allow_directory(normalized_path, true)
        .map_err(|error| format!("FilePilot could not restore recursive folder access: {error}"))
}

/// Opens a file or directory only when it belongs to the active Tauri
/// file-system scope previously approved by the user.
///
/// The frontend cannot use this command to open arbitrary operating-system
/// paths because every requested path is validated against the recursive
/// scope restored for connected FilePilot library sources.
#[tauri::command]
fn open_library_entry(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let normalized_path = path.trim();

    if normalized_path.is_empty() {
        return Err("A library entry path is required.".to_owned());
    }

    let scope = app.fs_scope();

    if !scope.is_allowed(normalized_path) {
        return Err(
            "FilePilot cannot open this entry because it is outside an approved library source."
                .to_owned(),
        );
    }

    tauri_plugin_opener::open_path(normalized_path, None::<&str>)
        .map_err(|error| format!("FilePilot could not open the selected entry: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            open_library_entry,
            restore_library_source_scope
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
