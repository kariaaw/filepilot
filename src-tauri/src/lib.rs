use std::fs::File;
use std::io::Read;
use std::path::Path;

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri_plugin_fs::FsExt;

const MAXIMUM_PREVIEW_BYTES: u64 = 256 * 1024;
const HASH_BUFFER_BYTES: usize = 64 * 1024;

#[derive(Serialize)]
struct ReadLibraryEntryResponse {
    bytes: Vec<u8>,
    truncated: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HashLibraryEntryResponse {
    algorithm: &'static str,
    value: String,
    size_bytes: u64,
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

fn hash_reader_sha256<R: Read>(reader: &mut R) -> std::io::Result<(String, u64)> {
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; HASH_BUFFER_BYTES];
    let mut size_bytes = 0_u64;

    loop {
        let read_count = reader.read(&mut buffer)?;

        if read_count == 0 {
            break;
        }

        hasher.update(&buffer[..read_count]);

        size_bytes = size_bytes.checked_add(read_count as u64).ok_or_else(|| {
            std::io::Error::other("The hashed file size exceeds the supported range.")
        })?;
    }

    Ok((format!("{:x}", hasher.finalize()), size_bytes))
}

fn hash_file_sha256(
    canonical_path: &Path,
    expected_size_bytes: u64,
    expected_modified: Option<std::time::SystemTime>,
) -> Result<HashLibraryEntryResponse, String> {
    let mut file = File::open(canonical_path).map_err(|error| {
        format!("FilePilot could not open the selected file for hashing: {error}")
    })?;

    let (value, size_bytes) = hash_reader_sha256(&mut file)
        .map_err(|error| format!("FilePilot could not hash the selected file: {error}"))?;

    let final_metadata = file
        .metadata()
        .map_err(|error| format!("FilePilot could not verify the hashed file: {error}"))?;

    let final_modified = final_metadata.modified().ok();

    if size_bytes != expected_size_bytes
        || final_metadata.len() != expected_size_bytes
        || final_modified != expected_modified
    {
        return Err(
            "The selected file changed while FilePilot was hashing it. Run duplicate analysis again."
                .to_owned(),
        );
    }

    Ok(HashLibraryEntryResponse {
        algorithm: "sha256",
        value,
        size_bytes,
    })
}

/// Calculates SHA-256 for one approved local file without loading it fully
/// into memory.
///
/// The path and its canonical target must both remain inside Tauri's approved
/// file-system scope. Hashing runs on a blocking worker thread and reads the
/// file incrementally using a fixed-size buffer.
#[tauri::command]
async fn hash_library_entry_sha256(
    app: tauri::AppHandle,
    path: String,
) -> Result<HashLibraryEntryResponse, String> {
    let normalized_path = path.trim();

    if normalized_path.is_empty() {
        return Err("A library entry path is required for hashing.".to_owned());
    }

    let scope = app.fs_scope();

    if !scope.is_allowed(normalized_path) {
        return Err(
            "FilePilot cannot hash this entry because it is outside an approved library source."
                .to_owned(),
        );
    }

    let canonical_path = std::fs::canonicalize(normalized_path).map_err(|error| {
        format!("FilePilot could not resolve the selected file for hashing: {error}")
    })?;

    if !scope.is_allowed(&canonical_path) {
        return Err(
            "FilePilot cannot hash this entry because its resolved path is outside an approved library source."
                .to_owned(),
        );
    }

    let metadata = std::fs::metadata(&canonical_path).map_err(|error| {
        format!("FilePilot could not inspect the selected file for hashing: {error}")
    })?;

    if !metadata.is_file() {
        return Err("Only regular files can receive a content hash.".to_owned());
    }

    let expected_size_bytes = metadata.len();
    let expected_modified = metadata.modified().ok();

    tauri::async_runtime::spawn_blocking(move || {
        hash_file_sha256(&canonical_path, expected_size_bytes, expected_modified)
    })
    .await
    .map_err(|error| format!("FilePilot's hashing worker failed: {error}"))?
}

#[cfg(test)]
mod hash_tests {
    use std::io::Cursor;

    use sha2::{Digest, Sha256};

    use super::{hash_reader_sha256, HASH_BUFFER_BYTES};

    #[test]
    fn hashes_an_empty_file_using_the_standard_sha256_value() {
        let mut reader = Cursor::new(Vec::<u8>::new());

        let (value, size_bytes) =
            hash_reader_sha256(&mut reader).expect("empty hash should succeed");

        assert_eq!(
            value,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(size_bytes, 0);
    }

    #[test]
    fn hashes_content_larger_than_multiple_streaming_buffers() {
        let bytes = vec![0x5a_u8; (HASH_BUFFER_BYTES * 2) + 17];
        let expected_value = format!("{:x}", Sha256::digest(&bytes));

        let mut reader = Cursor::new(bytes.clone());

        let (value, size_bytes) =
            hash_reader_sha256(&mut reader).expect("streaming hash should succeed");

        assert_eq!(value, expected_value);
        assert_eq!(size_bytes, bytes.len() as u64);
    }
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
            hash_library_entry_sha256,
            open_library_entry,
            read_library_entry_bytes,
            restore_library_source_scope
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
