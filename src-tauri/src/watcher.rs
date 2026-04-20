use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::Path;
use std::sync::mpsc::channel;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

static WATCHER: Mutex<Option<RecommendedWatcher>> = Mutex::new(None);

#[derive(Clone, Serialize)]
pub struct FileChangedPayload {
    pub path: String,
}

#[tauri::command]
pub async fn start_watching(app: AppHandle, path: String) -> Result<(), String> {
    let path_clone = path.clone();
    let mut watcher_guard = WATCHER.lock().map_err(|e| e.to_string())?;
    if watcher_guard.is_some() {
        return Ok(());
    }
    let (tx, rx) = channel();
    let mut watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                let _ = tx.send(event);
            }
        },
        Config::default().with_poll_interval(Duration::from_secs(1)),
    )
    .map_err(|e| e.to_string())?;
    watcher
        .watch(Path::new(&path), RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;
    *watcher_guard = Some(watcher);
    let app_clone = app.clone();
    std::thread::spawn(move || {
        while let Ok(event) = rx.recv() {
            if let notify::EventKind::Modify(_) = event.kind {
                for path in event.paths {
                    let payload = FileChangedPayload {
                        path: path.to_string_lossy().to_string(),
                    };
                    let _ = app_clone.emit("file-changed", payload);
                }
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn stop_watching() -> Result<(), String> {
    let mut watcher_guard = WATCHER.lock().map_err(|e| e.to_string())?;
    *watcher_guard = None;
    Ok(())
}
