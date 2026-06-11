use std::{
  collections::HashMap,
  env,
  ffi::OsStr,
  io::{Read, Write},
  path::{Path, PathBuf},
  sync::Mutex,
  thread,
};

#[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
use tauri::Emitter;
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use tauri::Emitter as _;
use tauri::Manager;

struct OpenedPaths(Mutex<Vec<String>>);
#[derive(Default)]
struct TerminalStore(Mutex<TerminalRegistry>);

#[derive(Default)]
struct TerminalRegistry {
  next_id: u32,
  sessions: HashMap<u32, TerminalSession>,
}

struct TerminalSession {
  master: Box<dyn MasterPty + Send>,
  writer: Box<dyn Write + Send>,
  killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TerminalCreateRequest {
  cwd: Option<String>,
  shell: Option<String>,
  cols: Option<u16>,
  rows: Option<u16>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TerminalWriteRequest {
  term_id: u32,
  data: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TerminalResizeRequest {
  term_id: u32,
  cols: u16,
  rows: u16,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalCreateResult {
  term_id: u32,
  cwd: String,
  shell_path: String,
  process_name: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalDataPayload {
  term_id: u32,
  data: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalExitPayload {
  term_id: u32,
  exit_code: Option<i32>,
  signal: Option<String>,
}

#[tauri::command]
fn pending_opened_paths(app: tauri::AppHandle) -> Vec<String> {
  let state = app.state::<OpenedPaths>();
  let mut paths = state.0.lock().unwrap();
  std::mem::take(&mut *paths)
}

#[tauri::command]
fn read_opened_document(path: String) -> Result<Vec<u8>, String> {
  let path = PathBuf::from(path);
  if !is_openable_document_path(&path) {
    return Err("unsupported document type".into());
  }

  std::fs::read(&path).map_err(|error| format!("failed to read document: {error}"))
}

#[tauri::command]
fn write_opened_document(path: String, content: String) -> Result<(), String> {
  let path = PathBuf::from(path);
  if !is_writable_document_path(&path) {
    return Err("unsupported document type".into());
  }

  std::fs::write(&path, content).map_err(|error| format!("failed to write document: {error}"))
}

#[tauri::command]
fn terminal_create(
  app: tauri::AppHandle,
  state: tauri::State<'_, TerminalStore>,
  request: TerminalCreateRequest,
) -> Result<TerminalCreateResult, String> {
  let cols = request.cols.unwrap_or(100).max(20);
  let rows = request.rows.unwrap_or(28).max(4);
  let cwd = resolve_terminal_cwd(request.cwd.as_deref());
  let shell_path = resolve_terminal_shell(request.shell.as_deref())?;
  let process_name = Path::new(&shell_path)
    .file_name()
    .and_then(OsStr::to_str)
    .unwrap_or(&shell_path)
    .to_string();

  let pty_system = native_pty_system();
  let pair = pty_system
    .openpty(PtySize {
      rows,
      cols,
      pixel_width: 0,
      pixel_height: 0,
    })
    .map_err(|error| format!("failed to open terminal pty: {error}"))?;

  let mut command = CommandBuilder::new(&shell_path);
  command.cwd(&cwd);

  let mut child = pair
    .slave
    .spawn_command(command)
    .map_err(|error| format!("failed to spawn terminal shell: {error}"))?;
  let killer = child.clone_killer();
  let mut reader = pair
    .master
    .try_clone_reader()
    .map_err(|error| format!("failed to create terminal reader: {error}"))?;
  let writer = pair
    .master
    .take_writer()
    .map_err(|error| format!("failed to create terminal writer: {error}"))?;

  let term_id = {
    let mut registry = state.0.lock().map_err(|_| "terminal store poisoned".to_string())?;
    registry.next_id = registry.next_id.saturating_add(1).max(1);
    let term_id = registry.next_id;
    registry.sessions.insert(term_id, TerminalSession {
      master: pair.master,
      writer,
      killer,
    });
    term_id
  };

  let data_app = app.clone();
  thread::spawn(move || {
    let mut buffer = [0_u8; 8192];
    loop {
      match reader.read(&mut buffer) {
        Ok(0) => break,
        Ok(count) => {
          let data = String::from_utf8_lossy(&buffer[..count]).to_string();
          let _ = data_app.emit(
            "terminal_data",
            TerminalDataPayload { term_id, data },
          );
        }
        Err(_) => break,
      }
    }
  });

  let exit_app = app;
  thread::spawn(move || {
    let status = child.wait().ok();
    let exit_code = status.map(|status| status.exit_code() as i32);
    let _ = exit_app.emit(
      "terminal_exit",
      TerminalExitPayload {
        term_id,
        exit_code,
        signal: None,
      },
    );
  });

  Ok(TerminalCreateResult {
    term_id,
    cwd: cwd.to_string_lossy().to_string(),
    shell_path,
    process_name,
  })
}

#[tauri::command]
fn terminal_write(
  state: tauri::State<'_, TerminalStore>,
  request: TerminalWriteRequest,
) -> Result<(), String> {
  let mut registry = state.0.lock().map_err(|_| "terminal store poisoned".to_string())?;
  let session = registry
    .sessions
    .get_mut(&request.term_id)
    .ok_or_else(|| "terminal session not found".to_string())?;

  session
    .writer
    .write_all(request.data.as_bytes())
    .and_then(|_| session.writer.flush())
    .map_err(|error| format!("failed to write terminal input: {error}"))
}

#[tauri::command]
fn terminal_resize(
  state: tauri::State<'_, TerminalStore>,
  request: TerminalResizeRequest,
) -> Result<(), String> {
  let mut registry = state.0.lock().map_err(|_| "terminal store poisoned".to_string())?;
  let session = registry
    .sessions
    .get_mut(&request.term_id)
    .ok_or_else(|| "terminal session not found".to_string())?;

  session
    .master
    .resize(PtySize {
      rows: request.rows.max(4),
      cols: request.cols.max(20),
      pixel_width: 0,
      pixel_height: 0,
    })
    .map_err(|error| format!("failed to resize terminal: {error}"))
}

#[tauri::command]
fn terminal_kill(state: tauri::State<'_, TerminalStore>, term_id: u32) -> Result<(), String> {
  let mut registry = state.0.lock().map_err(|_| "terminal store poisoned".to_string())?;
  let Some(mut session) = registry.sessions.remove(&term_id) else {
    return Ok(());
  };

  session
    .killer
    .kill()
    .map_err(|error| format!("failed to kill terminal: {error}"))
}

#[tauri::command]
fn terminal_clear(_state: tauri::State<'_, TerminalStore>, _term_id: u32) -> Result<(), String> {
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(OpenedPaths(Mutex::new(collect_initial_open_paths())))
    .manage(TerminalStore::default())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .invoke_handler(tauri::generate_handler![
      pending_opened_paths,
      read_opened_document,
      write_opened_document,
      terminal_create,
      terminal_write,
      terminal_resize,
      terminal_kill,
      terminal_clear
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|_app, _event| {
      #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
      if let tauri::RunEvent::Opened { urls } = _event {
        let paths = opened_paths_from_urls(urls);
        if paths.is_empty() {
          return;
        }

        _app
          .state::<OpenedPaths>()
          .0
          .lock()
          .unwrap()
          .extend(paths.clone());

        if let Some(window) = _app.get_webview_window("main") {
          let _ = window.unminimize();
          let _ = window.show();
          let _ = window.set_focus();
        }

        let _ = _app.emit("opened-paths", paths);
      }
    });
}

fn collect_initial_open_paths() -> Vec<String> {
  std::env::args_os()
    .skip(1)
    .filter_map(|arg| openable_path_to_string(PathBuf::from(arg)))
    .collect()
}

#[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
fn opened_paths_from_urls(urls: Vec<tauri::Url>) -> Vec<String> {
  urls
    .into_iter()
    .filter_map(|url| {
      if url.scheme() != "file" {
        return None;
      }

      url.to_file_path().ok().and_then(openable_path_to_string)
    })
    .collect()
}

fn openable_path_to_string(path: PathBuf) -> Option<String> {
  if !is_openable_document_path(&path) {
    return None;
  }

  path.into_os_string().into_string().ok()
}

fn is_openable_document_path(path: &Path) -> bool {
  matches!(
    path
      .extension()
      .and_then(|extension| extension.to_str())
      .map(|extension| extension.to_ascii_lowercase())
      .as_deref(),
    Some("md" | "markdown" | "html" | "htm" | "docx")
  )
}

fn is_writable_document_path(path: &Path) -> bool {
  matches!(
    path
      .extension()
      .and_then(|extension| extension.to_str())
      .map(|extension| extension.to_ascii_lowercase())
      .as_deref(),
    Some("md" | "markdown" | "html" | "htm")
  )
}

fn resolve_terminal_cwd(requested: Option<&str>) -> PathBuf {
  requested
    .filter(|value| !value.trim().is_empty())
    .map(PathBuf::from)
    .filter(|path| path.is_dir())
    .or_else(home_dir)
    .unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
}

fn resolve_terminal_shell(requested: Option<&str>) -> Result<String, String> {
  if let Some(shell) = requested.filter(|value| !value.trim().is_empty()) {
    return Ok(shell.to_string());
  }

  #[cfg(windows)]
  {
    for candidate in ["pwsh.exe", "powershell.exe", "cmd.exe"] {
      if let Some(path) = find_on_path(candidate) {
        return Ok(path.to_string_lossy().to_string());
      }
    }
    return Ok("cmd.exe".into());
  }

  #[cfg(not(windows))]
  {
    if let Ok(shell) = env::var("SHELL") {
      if !shell.trim().is_empty() && Path::new(&shell).exists() {
        return Ok(shell);
      }
    }
    for candidate in ["/bin/zsh", "/bin/bash", "/bin/sh"] {
      if Path::new(candidate).exists() {
        return Ok(candidate.into());
      }
    }
    Err("no usable shell found".into())
  }
}

fn home_dir() -> Option<PathBuf> {
  #[cfg(windows)]
  {
    env::var_os("USERPROFILE")
      .map(PathBuf::from)
      .or_else(|| {
        let drive = env::var_os("HOMEDRIVE")?;
        let path = env::var_os("HOMEPATH")?;
        Some(PathBuf::from(format!(
          "{}{}",
          drive.to_string_lossy(),
          path.to_string_lossy()
        )))
      })
  }

  #[cfg(not(windows))]
  {
    env::var_os("HOME").map(PathBuf::from)
  }
}

#[cfg(windows)]
fn find_on_path(executable: &str) -> Option<PathBuf> {
  let paths = env::var_os("PATH")?;
  env::split_paths(&paths)
    .map(|path| path.join(executable))
    .find(|path| path.is_file())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn temp_path(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!("typola-{}-{}", std::process::id(), name))
  }

  #[test]
  fn read_opened_document_reads_supported_document_bytes() {
    let path = temp_path("opened.md");
    std::fs::write(&path, b"# opened").unwrap();

    let bytes = read_opened_document(path.to_string_lossy().to_string()).unwrap();

    assert_eq!(bytes, b"# opened");
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn read_opened_document_rejects_unsupported_extensions() {
    let path = temp_path("secret.txt");
    std::fs::write(&path, b"secret").unwrap();

    let error = read_opened_document(path.to_string_lossy().to_string()).unwrap_err();

    assert!(error.contains("unsupported document type"));
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn write_opened_document_writes_supported_text_documents() {
    let path = temp_path("saved.html");
    std::fs::write(&path, b"before").unwrap();

    write_opened_document(path.to_string_lossy().to_string(), "<h1>after</h1>".into()).unwrap();

    assert_eq!(std::fs::read_to_string(&path).unwrap(), "<h1>after</h1>");
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn write_opened_document_rejects_docx() {
    let path = temp_path("saved.docx");
    std::fs::write(&path, b"before").unwrap();

    let error = write_opened_document(path.to_string_lossy().to_string(), "after".into()).unwrap_err();

    assert!(error.contains("unsupported document type"));
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn terminal_cwd_falls_back_to_home_or_current_dir() {
    let cwd = resolve_terminal_cwd(Some(""));

    assert!(cwd.is_dir());
  }

  #[test]
  fn terminal_accepts_explicit_shell_path() {
    let shell = resolve_terminal_shell(Some("custom-shell")).unwrap();

    assert_eq!(shell, "custom-shell");
  }
}
