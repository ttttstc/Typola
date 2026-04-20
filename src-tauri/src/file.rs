use rand::Rng;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::Path;
use tauri::command;
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    #[serde(rename = "children", skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileEntry>>,
}

fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.starts_with('.'))
        .unwrap_or(false)
}

fn is_supported_format(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.ends_with(".md"))
        .unwrap_or(false)
}

#[command]
pub async fn read_file(path: String) -> Result<String, String> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err("File not found".to_string());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    let path = Path::new(&path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let temp_path = path.with_extension("tmp");
    {
        let mut file = fs::File::create(&temp_path).map_err(|e| e.to_string())?;
        file.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
    }
    fs::rename(&temp_path, path).map_err(|e| e.to_string())
}

#[command]
pub async fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog()
        .file()
        .pick_folder(move |folder| {
            let _ = tx.send(folder.map(|f| f.to_string()));
        });
    rx.recv().map_err(|e| e.to_string())
}

fn collect_dir_entries(path: &Path) -> Option<Vec<FileEntry>> {
    let mut entries: Vec<FileEntry> = Vec::new();
    let dir_entries = fs::read_dir(path).ok()?;

    for entry in dir_entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let entry_path = entry.path();
        if is_hidden(&entry_path) {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = entry_path.is_dir();

        if is_dir {
            // Recursively collect for subdirectory
            if let Some(mut children) = collect_dir_entries(&entry_path) {
                // Sort: dirs first, then files, alphabetically
                children.sort_by(|a, b| {
                    if a.is_dir == b.is_dir {
                        a.name.to_lowercase().cmp(&b.name.to_lowercase())
                    } else if a.is_dir {
                        std::cmp::Ordering::Less
                    } else {
                        std::cmp::Ordering::Greater
                    }
                });
                entries.push(FileEntry {
                    name,
                    path: entry_path.to_string_lossy().to_string(),
                    is_dir: true,
                    children: Some(children),
                });
            }
        } else if is_supported_format(&entry_path) {
            entries.push(FileEntry {
                name,
                path: entry_path.to_string_lossy().to_string(),
                is_dir: false,
                children: None,
            });
        }
    }

    if entries.is_empty() {
        None
    } else {
        Some(entries)
    }
}

#[command]
pub async fn list_dir(path: String) -> Result<Vec<FileEntry>, String> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err("Directory not found".to_string());
    }

    let entries = collect_dir_entries(path).unwrap_or_default();

    let mut entries = entries;
    entries.sort_by(|a, b| {
        if a.is_dir == b.is_dir {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        } else if a.is_dir {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });

    Ok(entries)
}

#[command]
pub async fn create_file(path: String) -> Result<(), String> {
    let path = Path::new(&path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, "").map_err(|e| e.to_string())
}

#[command]
pub async fn create_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[command]
pub async fn rename_path(old: String, new: String) -> Result<(), String> {
    fs::rename(&old, &new).map_err(|e| e.to_string())
}

#[command]
pub async fn delete_path(path: String) -> Result<(), String> {
    let path = Path::new(&path);
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(path).map_err(|e| e.to_string())
    }
}

#[command]
pub async fn save_image(
    workspace_root: String,
    data: Vec<u8>,
    ext: String,
) -> Result<String, String> {
    let resources_dir = Path::new(&workspace_root).join(".resources");
    fs::create_dir_all(&resources_dir).map_err(|e| e.to_string())?;
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let mut rng = rand::thread_rng();
    let random_hex: String = (0..8)
        .map(|_| format!("{:x}", rng.gen::<u8>()))
        .collect();
    let filename = format!("{}-{}.{}", timestamp, random_hex, ext);
    let file_path = resources_dir.join(&filename);
    fs::write(&file_path, data).map_err(|e| e.to_string())?;
    Ok(format!(".resources/{}", filename))
}
