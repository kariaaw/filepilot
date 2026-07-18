use std::fs::File;
use std::io::Read;

use serde::Serialize;
use tauri_plugin_fs::FsExt;

const MAXIMUM_PREVIEW_BYTES: u64 = 256 * 1024;

#[derive(Serialize)]
struct ReadLibraryEntryResponse {
    bytes: Vec<u8>,
    truncated: bool,
}

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

/// Reads at most the requested number of bytes from an approved library file.
///
/// Both the requested path and its canonical target must remain inside Tauri's
/// active file-system scope. Reading one additional byte allows FilePilot to
/// report whether the preview was truncated without loading the whole file.
#[tauri::command]
fn read_library_entry_bytes(
    app: tauri::AppHandle,
    path: String,
    maximum_bytes: u64,
) -> Result<ReadLibraryEntryResponse, String> {
    let normalized_path = path.trim();

    if normalized_path.is_empty() {
        return Err("A library entry path is required for preview.".to_owned());
    }

    if maximum_bytes == 0 || maximum_bytes > MAXIMUM_PREVIEW_BYTES {
        return Err(format!(
            "Preview size must be between 1 and {MAXIMUM_PREVIEW_BYTES} bytes."
        ));
    }

    let scope = app.fs_scope();

    if !scope.is_allowed(normalized_path) {
        return Err(
            "FilePilot cannot preview this entry because it is outside an approved library source."
                .to_owned(),
        );
    }

    let canonical_path = std::fs::canonicalize(normalized_path).map_err(|error| {
        format!("FilePilot could not resolve the selected preview file: {error}")
    })?;

    if !scope.is_allowed(&canonical_path) {
        return Err(
            "FilePilot cannot preview this entry because its resolved path is outside an approved library source."
                .to_owned(),
        );
    }

    let metadata = std::fs::metadata(&canonical_path).map_err(|error| {
        format!("FilePilot could not inspect the selected preview file: {error}")
    })?;

    if !metadata.is_file() {
        return Err("Only regular files can be previewed.".to_owned());
    }

    let file = File::open(&canonical_path)
        .map_err(|error| format!("FilePilot could not open the selected preview file: {error}"))?;

    let read_limit = maximum_bytes
        .checked_add(1)
        .ok_or_else(|| "The requested preview size is invalid.".to_owned())?;

    let mut bytes = Vec::with_capacity(read_limit as usize);

    file.take(read_limit)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("FilePilot could not read the selected preview file: {error}"))?;

    let truncated = bytes.len() > maximum_bytes as usize;

    if truncated {
        bytes.truncate(maximum_bytes as usize);
    }

    Ok(ReadLibraryEntryResponse { bytes, truncated })
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
            read_library_entry_bytes,
            restore_library_source_scope
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
