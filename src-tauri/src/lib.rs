use std::{
    collections::HashMap,
    env,
    ffi::OsStr,
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{SystemTime, UNIX_EPOCH},
};

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
#[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
use tauri::Emitter;
use tauri::Emitter as _;
use tauri::Manager;

struct OpenedPaths(Mutex<Vec<String>>);
#[derive(Default)]
struct TerminalStore(Mutex<TerminalRegistry>);
#[derive(Default)]
struct DocumentWatcherStore(Mutex<HashMap<String, RecommendedWatcher>>);
#[derive(Default)]
struct AgentStore(Mutex<HashMap<String, Arc<Mutex<Child>>>>);

static LOCAL_ID_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Default)]
struct TerminalRegistry {
    next_id: u32,
    sessions: HashMap<u32, TerminalSession>,
}

struct TerminalSession {
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentDetectRequest {
    agent_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentRunCreateRequest {
    agent_path: Option<String>,
    conversation_id: String,
    cwd: Option<String>,
    prompt: String,
    stable_prompt_hash: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentSessionClearRequest {
    conversation_id: String,
    agent_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DirectoryListRequest {
    path: String,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AttachmentWriteRequest {
    document_path: String,
    file_name: String,
    data: Vec<u8>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AgentDetectResult {
    available: bool,
    path: String,
    version: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AgentRunCreateResult {
    run_id: String,
    session_id: String,
    resumed: bool,
    cwd: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AgentEventPayload {
    run_id: String,
    event_type: String,
    text: Option<String>,
    status: Option<String>,
    code: Option<i32>,
    signal: Option<String>,
    message: Option<String>,
    session_id: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DirectoryEntryPayload {
    name: String,
    path: String,
    is_dir: bool,
    is_supported: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AgentSessionRecord {
    conversation_id: String,
    agent_id: String,
    session_id: String,
    cwd: String,
    stable_prompt_hash: String,
    created_at: u64,
    updated_at: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AttachmentWriteRequest {
  document_path: String,
  file_name: String,
  data: Vec<u8>,
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
    data: Vec<u8>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalExitPayload {
    term_id: u32,
    exit_code: Option<i32>,
    signal: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FileChangedPayload {
    path: String,
}

#[tauri::command]
fn pending_opened_paths(app: tauri::AppHandle) -> Vec<String> {
    let state = app.state::<OpenedPaths>();
    let mut paths = state.0.lock().unwrap();
    std::mem::take(&mut *paths)
}

#[tauri::command]
fn force_close_main_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    window
        .destroy()
        .map_err(|error| format!("failed to close main window: {error}"))
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
fn write_attachment_file(request: AttachmentWriteRequest) -> Result<String, String> {
    let document_path = PathBuf::from(request.document_path);
    if !is_writable_document_path(&document_path) {
        return Err("unsupported document type".into());
    }

    let parent = document_path
        .parent()
        .ok_or_else(|| "document has no parent directory".to_string())?;
    let safe_name = sanitize_attachment_file_name(&request.file_name);
    let assets_dir = parent.join("assets");
    std::fs::create_dir_all(&assets_dir)
        .map_err(|error| format!("failed to create assets directory: {error}"))?;
    let output_path = unique_attachment_path(&assets_dir, &safe_name);
    std::fs::write(&output_path, request.data)
        .map_err(|error| format!("failed to write attachment: {error}"))?;
    let file_name = output_path
        .file_name()
        .and_then(OsStr::to_str)
        .ok_or_else(|| "invalid attachment file name".to_string())?;
    Ok(format!("./assets/{file_name}"))
}

#[tauri::command]
fn agent_detect(request: AgentDetectRequest) -> AgentDetectResult {
    let agent_path = normalize_agent_path(request.agent_path.as_deref());
    match run_agent_version(&agent_path) {
        Ok(version) => AgentDetectResult {
            available: true,
            path: agent_path,
            version: Some(version),
            error: None,
        },
        Err(error) => AgentDetectResult {
            available: false,
            path: agent_path,
            version: None,
            error: Some(error),
        },
    }
}

#[tauri::command]
fn agent_run_create(
    app: tauri::AppHandle,
    state: tauri::State<'_, AgentStore>,
    request: AgentRunCreateRequest,
) -> Result<AgentRunCreateResult, String> {
    if request.prompt.trim().is_empty() {
        return Err("prompt is empty".into());
    }

    let run_id = generate_local_id("run");
    let agent_id = "claude".to_string();
    let agent_path = normalize_agent_path(request.agent_path.as_deref());
    let cwd = resolve_agent_cwd(request.cwd.as_deref());
    let now = now_millis();
    let mut sessions = read_agent_sessions(&app).unwrap_or_default();
    let session_key = agent_session_key(&request.conversation_id, &agent_id);
    let existing_session = sessions
        .get(&session_key)
        .filter(|record| is_valid_uuid(&record.session_id))
        .cloned();
    let resumed = existing_session.is_some();
    let session_id = existing_session
        .as_ref()
        .map(|record| record.session_id.clone())
        .unwrap_or_else(generate_uuid);

    let mut args = vec![
        "-p".to_string(),
        "--input-format".to_string(),
        "stream-json".to_string(),
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
        "--permission-mode".to_string(),
        "bypassPermissions".to_string(),
    ];
    if resumed {
        args.push("--resume".to_string());
    } else {
        args.push("--session-id".to_string());
    }
    args.push(session_id.clone());

    let mut command = create_agent_command(&agent_path, &args);
    command
        .current_dir(&cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|error| format!("failed to spawn Claude CLI: {error}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        let user_message = serde_json::json!({
          "type": "user",
          "message": {
            "role": "user",
            "content": [{ "type": "text", "text": request.prompt }],
          },
        });
        stdin
            .write_all(format!("{user_message}\n").as_bytes())
            .and_then(|_| stdin.flush())
            .map_err(|error| format!("failed to write Claude prompt: {error}"))?;
    }

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    sessions.insert(
        session_key,
        AgentSessionRecord {
            conversation_id: request.conversation_id,
            agent_id,
            session_id: session_id.clone(),
            cwd: cwd.to_string_lossy().to_string(),
            stable_prompt_hash: request.stable_prompt_hash,
            created_at: existing_session
                .map(|record| record.created_at)
                .unwrap_or(now),
            updated_at: now,
        },
    );
    write_agent_sessions(&app, &sessions)?;

    let child = Arc::new(Mutex::new(child));
    {
        let mut runs = state
            .0
            .lock()
            .map_err(|_| "agent store poisoned".to_string())?;
        runs.insert(run_id.clone(), Arc::clone(&child));
    }

    emit_agent_status(&app, &run_id, "running", Some(&session_id));

    if let Some(stdout) = stdout {
        let stdout_app = app.clone();
        let stdout_run_id = run_id.clone();
        thread::spawn(move || read_agent_stdout(stdout_app, stdout_run_id, stdout));
    }

    if let Some(stderr) = stderr {
        let stderr_app = app.clone();
        let stderr_run_id = run_id.clone();
        thread::spawn(move || read_agent_stderr(stderr_app, stderr_run_id, stderr));
    }

    let exit_app = app.clone();
    let exit_run_id = run_id.clone();
    thread::spawn(move || loop {
        let status = child
            .lock()
            .ok()
            .and_then(|mut child| child.try_wait().ok())
            .flatten();
        if let Some(status) = status {
            if let Ok(mut runs) = exit_app.state::<AgentStore>().0.lock() {
                runs.remove(&exit_run_id);
            }
            let _ = exit_app.emit(
                "agent_event",
                AgentEventPayload {
                    run_id: exit_run_id,
                    event_type: "exit".into(),
                    text: None,
                    status: Some("done".into()),
                    code: status.code(),
                    signal: None,
                    message: None,
                    session_id: None,
                },
            );
            break;
        }
        thread::sleep(std::time::Duration::from_millis(300));
    });

    Ok(AgentRunCreateResult {
        run_id,
        session_id,
        resumed,
        cwd: cwd.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn agent_run_stop(state: tauri::State<'_, AgentStore>, run_id: String) -> Result<(), String> {
    let mut child = {
        let mut runs = state
            .0
            .lock()
            .map_err(|_| "agent store poisoned".to_string())?;
        runs.remove(&run_id)
    };

    if let Some(child) = child.as_mut() {
        child
            .lock()
            .map_err(|_| "agent run poisoned".to_string())?
            .kill()
            .map_err(|error| format!("failed to stop agent run: {error}"))?;
    }
    Ok(())
}

#[tauri::command]
fn agent_session_clear(
    app: tauri::AppHandle,
    request: AgentSessionClearRequest,
) -> Result<(), String> {
    let mut sessions = read_agent_sessions(&app).unwrap_or_default();
    sessions.remove(&agent_session_key(
        &request.conversation_id,
        &request.agent_id,
    ));
    write_agent_sessions(&app, &sessions)
}

#[tauri::command]
fn list_directory_entries(
    request: DirectoryListRequest,
) -> Result<Vec<DirectoryEntryPayload>, String> {
    let root = PathBuf::from(request.path);
    if !root.is_dir() {
        return Err("directory not found".into());
    }

    let mut entries = Vec::new();
    for entry in
        std::fs::read_dir(&root).map_err(|error| format!("failed to read directory: {error}"))?
    {
        let entry = entry.map_err(|error| format!("failed to read directory entry: {error}"))?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.')
            || matches!(name.as_str(), "node_modules" | "dist" | "target" | ".git")
        {
            continue;
        }
        let is_dir = path.is_dir();
        let is_supported = is_dir || is_openable_document_path(&path);
        if !is_supported {
            continue;
        }
        entries.push(DirectoryEntryPayload {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir,
            is_supported,
        });
    }

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

#[tauri::command]
fn write_attachment_file(request: AttachmentWriteRequest) -> Result<String, String> {
  let document_path = PathBuf::from(request.document_path);
  if !is_writable_document_path(&document_path) {
    return Err("unsupported document type".into());
  }

  let parent = document_path.parent().ok_or_else(|| "document has no parent directory".to_string())?;
  let safe_name = sanitize_attachment_file_name(&request.file_name);
  let assets_dir = parent.join("assets");
  std::fs::create_dir_all(&assets_dir).map_err(|error| format!("failed to create assets directory: {error}"))?;
  let output_path = unique_attachment_path(&assets_dir, &safe_name);
  std::fs::write(&output_path, request.data).map_err(|error| format!("failed to write attachment: {error}"))?;
  let file_name = output_path
    .file_name()
    .and_then(OsStr::to_str)
    .ok_or_else(|| "invalid attachment file name".to_string())?;
  Ok(format!("./assets/{file_name}"))
}

#[tauri::command]
fn watch_opened_document(
    app: tauri::AppHandle,
    state: tauri::State<'_, DocumentWatcherStore>,
    path: String,
) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !is_openable_document_path(&path) {
        return Err("unsupported document type".into());
    }

    let watch_key = watch_path_key(&path);
    let mut watchers = state
        .0
        .lock()
        .map_err(|_| "document watcher store poisoned".to_string())?;
    if watchers.contains_key(&watch_key) {
        return Ok(());
    }

    let emit_app = app.clone();
    let emit_path = watch_key.clone();
    let watched_path = path.clone();
    let mut watcher = RecommendedWatcher::new(
        move |result: notify::Result<Event>| {
            let Ok(event) = result else {
                return;
            };
            if !is_document_change_event(&event.kind) {
                return;
            }
            if !event.paths.is_empty()
                && !event
                    .paths
                    .iter()
                    .any(|candidate| watch_path_key(candidate) == emit_path)
            {
                return;
            }
            let _ = emit_app.emit(
                "file-changed",
                FileChangedPayload {
                    path: emit_path.clone(),
                },
            );
        },
        Config::default(),
    )
    .map_err(|error| format!("failed to create document watcher: {error}"))?;

    watcher
        .watch(&watched_path, RecursiveMode::NonRecursive)
        .map_err(|error| format!("failed to watch document: {error}"))?;
    watchers.insert(watch_key, watcher);
    Ok(())
}

#[tauri::command]
fn unwatch_opened_document(
    state: tauri::State<'_, DocumentWatcherStore>,
    path: String,
) -> Result<(), String> {
    let watch_key = watch_path_key(Path::new(&path));
    let mut watchers = state
        .0
        .lock()
        .map_err(|_| "document watcher store poisoned".to_string())?;
    watchers.remove(&watch_key);
    Ok(())
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
        let mut registry = state
            .0
            .lock()
            .map_err(|_| "terminal store poisoned".to_string())?;
        registry.next_id = registry.next_id.saturating_add(1).max(1);
        let term_id = registry.next_id;
        registry.sessions.insert(
            term_id,
            TerminalSession {
                master: Arc::new(Mutex::new(pair.master)),
                writer: Arc::new(Mutex::new(writer)),
                killer,
            },
        );
        term_id
    };

    let data_app = app.clone();
    thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    let data = buffer[..count].to_vec();
                    let _ = data_app.emit("terminal_data", TerminalDataPayload { term_id, data });
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
    let writer = {
        let registry = state
            .0
            .lock()
            .map_err(|_| "terminal store poisoned".to_string())?;
        registry
            .sessions
            .get(&request.term_id)
            .map(|session| Arc::clone(&session.writer))
            .ok_or_else(|| "terminal session not found".to_string())?
    };

    let mut writer = writer
        .lock()
        .map_err(|_| "terminal writer poisoned".to_string())?;
    writer
        .write_all(request.data.as_bytes())
        .and_then(|_| writer.flush())
        .map_err(|error| format!("failed to write terminal input: {error}"))
}

#[tauri::command]
fn terminal_resize(
    state: tauri::State<'_, TerminalStore>,
    request: TerminalResizeRequest,
) -> Result<(), String> {
    let master = {
        let registry = state
            .0
            .lock()
            .map_err(|_| "terminal store poisoned".to_string())?;
        registry
            .sessions
            .get(&request.term_id)
            .map(|session| Arc::clone(&session.master))
            .ok_or_else(|| "terminal session not found".to_string())?
    };

    let resize_result = master
        .lock()
        .map_err(|_| "terminal pty poisoned".to_string())?
        .resize(PtySize {
            rows: request.rows.max(4),
            cols: request.cols.max(20),
            pixel_width: 0,
            pixel_height: 0,
        });

    resize_result.map_err(|error| format!("failed to resize terminal: {error}"))
}

#[tauri::command]
fn terminal_kill(state: tauri::State<'_, TerminalStore>, term_id: u32) -> Result<(), String> {
    let session = {
        let mut registry = state
            .0
            .lock()
            .map_err(|_| "terminal store poisoned".to_string())?;
        registry.sessions.remove(&term_id)
    };
    if let Some(mut session) = session {
        session
            .killer
            .kill()
            .map_err(|error| format!("failed to kill terminal: {error}"))?;
    };

    Ok(())
}

#[tauri::command]
fn terminal_clear(state: tauri::State<'_, TerminalStore>, term_id: u32) -> Result<(), String> {
    let writer = {
        let registry = state
            .0
            .lock()
            .map_err(|_| "terminal store poisoned".to_string())?;
        registry
            .sessions
            .get(&term_id)
            .map(|session| Arc::clone(&session.writer))
            .ok_or_else(|| "terminal session not found".to_string())?
    };

    let mut writer = writer
        .lock()
        .map_err(|_| "terminal writer poisoned".to_string())?;
    writer
        .write_all(b"\x1b[3J\x1b[2J\x1b[H")
        .and_then(|_| writer.flush())
        .map_err(|error| format!("failed to clear terminal: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(OpenedPaths(Mutex::new(collect_initial_open_paths())))
        .manage(TerminalStore::default())
        .manage(DocumentWatcherStore::default())
        .manage(AgentStore::default())
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let paths = opened_paths_from_args(args, &cwd);
            if paths.is_empty() {
                return;
            }

            app.state::<OpenedPaths>()
                .0
                .lock()
                .unwrap()
                .extend(paths.clone());

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }

            let _ = app.emit("opened-paths", paths);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            pending_opened_paths,
            force_close_main_window,
            read_opened_document,
            write_opened_document,
            write_attachment_file,
            agent_detect,
            agent_run_create,
            agent_run_stop,
            agent_session_clear,
            list_directory_entries,
            watch_opened_document,
            unwatch_opened_document,
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

                _app.state::<OpenedPaths>()
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

fn opened_paths_from_args(args: Vec<String>, cwd: &str) -> Vec<String> {
    args.into_iter()
        .filter_map(|arg| {
            let path = PathBuf::from(&arg);
            let path = if path.is_absolute() {
                path
            } else {
                PathBuf::from(cwd).join(path)
            };
            openable_path_to_string(path)
        })
        .collect()
}

#[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
fn opened_paths_from_urls(urls: Vec<tauri::Url>) -> Vec<String> {
    urls.into_iter()
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

fn watch_path_key(path: &Path) -> String {
    path.canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .to_string()
}

fn is_document_change_event(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
    )
}

fn is_openable_document_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.to_ascii_lowercase())
            .as_deref(),
        Some("md" | "markdown" | "html" | "htm" | "docx")
    )
}

fn is_writable_document_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.to_ascii_lowercase())
            .as_deref(),
        Some("md" | "markdown" | "html" | "htm")
    )
}

fn sanitize_attachment_file_name(file_name: &str) -> String {
    let candidate = Path::new(file_name)
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or("pasted-image.png")
        .chars()
        .map(|ch| match ch {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            _ => ch,
        })
        .collect::<String>();
    let trimmed = candidate.trim_matches(['.', ' ']).trim();
    if trimmed.is_empty() {
        "pasted-image.png".into()
    } else {
        trimmed.chars().take(96).collect()
    }
}

fn unique_attachment_path(dir: &Path, file_name: &str) -> PathBuf {
    let original = Path::new(file_name);
    let stem = original
        .file_stem()
        .and_then(OsStr::to_str)
        .filter(|value| !value.is_empty())
        .unwrap_or("pasted-image");
    let extension = original
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or("png");
    let mut candidate = dir.join(format!("{stem}.{extension}"));
    let mut index = 2;
    while candidate.exists() {
        candidate = dir.join(format!("{stem}-{index}.{extension}"));
        index += 1;
    }
    candidate
}

fn normalize_agent_path(path: Option<&str>) -> String {
    if let Some(path) = path.map(str::trim).filter(|value| !value.is_empty()) {
        return path.to_string();
    }

    default_claude_command()
}

fn default_claude_command() -> String {
    #[cfg(target_os = "windows")]
    {
        for candidate in windows_claude_candidates() {
            if candidate.is_file() {
                return candidate.to_string_lossy().to_string();
            }
        }
    }

    "claude".to_string()
}

#[cfg(target_os = "windows")]
fn windows_claude_candidates() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(app_data) = env::var("APPDATA") {
        roots.push(PathBuf::from(app_data).join("npm"));
    }
    if let Ok(user_profile) = env::var("USERPROFILE") {
        roots.push(
            PathBuf::from(user_profile)
                .join("AppData")
                .join("Roaming")
                .join("npm"),
        );
    }

    let mut candidates = Vec::new();
    for root in roots {
        candidates.push(root.join("claude.cmd"));
        candidates.push(root.join("claude.exe"));
        candidates.push(root.join("claude"));
    }
    candidates
}

fn resolve_agent_cwd(requested: Option<&str>) -> PathBuf {
    requested
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .filter(|path| path.is_dir())
        .or_else(home_dir)
        .unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
}

#[cfg(target_os = "windows")]
fn create_agent_command(command_path: &str, args: &[String]) -> Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let lower = command_path.to_ascii_lowercase();
    if lower.ends_with(".cmd") || lower.ends_with(".bat") {
        let mut command = Command::new("cmd");
        command
            .arg("/d")
            .arg("/s")
            .arg("/c")
            .arg(command_path)
            .args(args);
        command.creation_flags(CREATE_NO_WINDOW);
        return command;
    }
    let mut command = Command::new(command_path);
    command.args(args);
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

#[cfg(not(target_os = "windows"))]
fn create_agent_command(command_path: &str, args: &[String]) -> Command {
    let mut command = Command::new(command_path);
    command.args(args);
    command
}

fn run_agent_version(agent_path: &str) -> Result<String, String> {
    let output = create_agent_command(agent_path, &["--version".to_string()])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| format!("failed to run Claude CLI: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Claude CLI exited with an error".into()
        } else {
            stderr
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if stdout.is_empty() {
        "unknown".into()
    } else {
        stdout
    })
}

fn emit_agent_status(app: &tauri::AppHandle, run_id: &str, status: &str, session_id: Option<&str>) {
    let _ = app.emit(
        "agent_event",
        AgentEventPayload {
            run_id: run_id.into(),
            event_type: "status".into(),
            text: None,
            status: Some(status.into()),
            code: None,
            signal: None,
            message: None,
            session_id: session_id.map(str::to_string),
        },
    );
}

fn emit_agent_text(app: &tauri::AppHandle, run_id: &str, event_type: &str, text: String) {
    if text.is_empty() {
        return;
    }
    let _ = app.emit(
        "agent_event",
        AgentEventPayload {
            run_id: run_id.into(),
            event_type: event_type.into(),
            text: Some(text),
            status: None,
            code: None,
            signal: None,
            message: None,
            session_id: None,
        },
    );
}

fn read_agent_stdout(app: tauri::AppHandle, run_id: String, stdout: std::process::ChildStdout) {
    let reader = BufReader::new(stdout);
    for line in reader.lines().map_while(Result::ok) {
        if let Some((event_type, text)) = parse_claude_jsonl_text(&line) {
            emit_agent_text(&app, &run_id, &event_type, text);
        } else if serde_json::from_str::<serde_json::Value>(&line).is_err() {
            emit_agent_text(&app, &run_id, "text_delta", format!("{line}\n"));
        }
    }
}

fn read_agent_stderr(app: tauri::AppHandle, run_id: String, stderr: std::process::ChildStderr) {
    let reader = BufReader::new(stderr);
    for line in reader.lines().map_while(Result::ok) {
        emit_agent_text(&app, &run_id, "stderr", format!("{line}\n"));
    }
}

fn parse_claude_jsonl_text(line: &str) -> Option<(String, String)> {
    let value: serde_json::Value = serde_json::from_str(line).ok()?;
    if value.get("type").and_then(|value| value.as_str()) == Some("system")
        && value.get("subtype").and_then(|value| value.as_str()) == Some("init")
    {
        let model = value
            .get("model")
            .and_then(|value| value.as_str())
            .unwrap_or("claude");
        return Some(("status".into(), format!("initializing {model}")));
    }
    if let Some(event) = value.get("event") {
        if let Some(text) = event
            .pointer("/delta/text")
            .and_then(|value| value.as_str())
        {
            return Some(("text_delta".into(), text.into()));
        }
        if let Some(text) = event
            .pointer("/delta/thinking")
            .and_then(|value| value.as_str())
        {
            return Some(("thinking_delta".into(), text.into()));
        }
        if let Some(text) = event
            .pointer("/delta/partial_json")
            .and_then(|value| value.as_str())
        {
            return Some(("tool_delta".into(), text.into()));
        }
    }
    if let Some(text) = value
        .pointer("/delta/text")
        .and_then(|value| value.as_str())
    {
        return Some(("text_delta".into(), text.into()));
    }
    if let Some(text) = value
        .pointer("/delta/thinking")
        .and_then(|value| value.as_str())
    {
        return Some(("thinking_delta".into(), text.into()));
    }
    if let Some(content) = value
        .pointer("/message/content")
        .and_then(|value| value.as_array())
    {
        let text = extract_claude_content_text(content);
        if !text.trim().is_empty() {
            return Some(("text_delta".into(), format!("{text}\n")));
        }
        return Some(("stdout".into(), String::new()));
    }
    if let Some(content) = value.pointer("/content").and_then(|value| value.as_array()) {
        let text = extract_claude_content_text(content);
        if !text.trim().is_empty() {
            return Some(("text_delta".into(), format!("{text}\n")));
        }
        return Some(("stdout".into(), String::new()));
    }
    if let Some(text) = value.get("text").and_then(|value| value.as_str()) {
        return Some(("text_delta".into(), text.into()));
    }
    if value.get("type").and_then(|value| value.as_str()) == Some("result") {
        return Some(("stdout".into(), String::new()));
    }
    if let Some(error) = value.get("error").and_then(|value| value.as_str()) {
        return Some(("error".into(), error.into()));
    }
    if value.get("type").and_then(|value| value.as_str()).is_some() {
        return Some(("stdout".into(), String::new()));
    }
    None
}

fn extract_claude_content_text(content: &[serde_json::Value]) -> String {
    content
        .iter()
        .filter(|item| {
            item.get("type")
                .and_then(|value| value.as_str())
                .map(|kind| matches!(kind, "text" | "output_text"))
                .unwrap_or(true)
        })
        .filter_map(|item| item.get("text").and_then(|value| value.as_str()))
        .collect::<Vec<_>>()
        .join("")
}

fn agent_sessions_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data dir: {error}"))?;
    std::fs::create_dir_all(&dir)
        .map_err(|error| format!("failed to create app data dir: {error}"))?;
    Ok(dir.join("agent-sessions.json"))
}

fn read_agent_sessions(
    app: &tauri::AppHandle,
) -> Result<HashMap<String, AgentSessionRecord>, String> {
    let path = agent_sessions_path(app)?;
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let raw = std::fs::read_to_string(&path)
        .map_err(|error| format!("failed to read agent sessions: {error}"))?;
    serde_json::from_str(&raw).map_err(|error| format!("failed to parse agent sessions: {error}"))
}

fn write_agent_sessions(
    app: &tauri::AppHandle,
    sessions: &HashMap<String, AgentSessionRecord>,
) -> Result<(), String> {
    let path = agent_sessions_path(app)?;
    let raw = serde_json::to_string_pretty(sessions)
        .map_err(|error| format!("failed to encode agent sessions: {error}"))?;
    std::fs::write(path, raw).map_err(|error| format!("failed to write agent sessions: {error}"))
}

fn agent_session_key(conversation_id: &str, agent_id: &str) -> String {
    format!("{conversation_id}:{agent_id}")
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

fn generate_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn is_valid_uuid(value: &str) -> bool {
    uuid::Uuid::parse_str(value).is_ok()
}

fn generate_local_id(prefix: &str) -> String {
    let counter = LOCAL_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}-{}-{}-{counter}", std::process::id(), now_millis())
}

fn sanitize_attachment_file_name(file_name: &str) -> String {
  let candidate = Path::new(file_name)
    .file_name()
    .and_then(OsStr::to_str)
    .unwrap_or("pasted-image.png")
    .chars()
    .map(|ch| match ch {
      '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
      _ => ch,
    })
    .collect::<String>();
  let trimmed = candidate.trim_matches(['.', ' ']).trim();
  if trimmed.is_empty() {
    "pasted-image.png".into()
  } else {
    trimmed.chars().take(96).collect()
  }
}

fn unique_attachment_path(dir: &Path, file_name: &str) -> PathBuf {
  let original = Path::new(file_name);
  let stem = original
    .file_stem()
    .and_then(OsStr::to_str)
    .filter(|value| !value.is_empty())
    .unwrap_or("pasted-image");
  let extension = original.extension().and_then(OsStr::to_str).unwrap_or("png");
  let mut candidate = dir.join(format!("{stem}.{extension}"));
  let mut index = 2;
  while candidate.exists() {
    candidate = dir.join(format!("{stem}-{index}.{extension}"));
    index += 1;
  }
  candidate
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
        env::var_os("USERPROFILE").map(PathBuf::from).or_else(|| {
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

        let error =
            write_opened_document(path.to_string_lossy().to_string(), "after".into()).unwrap_err();

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

    #[test]
    fn claude_path_accepts_explicit_value() {
        assert_eq!(
            normalize_agent_path(Some(" custom-claude ")),
            "custom-claude"
        );
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn claude_path_defaults_to_path_lookup_on_non_windows() {
        assert_eq!(normalize_agent_path(None), "claude");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn claude_path_checks_windows_npm_global_directory() {
        let path = normalize_agent_path(None);

        assert!(
            path == "claude"
                || path.ends_with("\\npm\\claude.cmd")
                || path.ends_with("\\npm\\claude.exe"),
            "unexpected default Claude path: {path}"
        );
    }

    #[test]
    fn agent_session_ids_are_valid_uuids() {
        assert!(is_valid_uuid(&generate_uuid()));
        assert!(!is_valid_uuid("session-123"));
    }

    #[test]
    fn claude_stream_parser_reads_stream_event_delta() {
        let line = r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"hello"}}}"#;

        assert_eq!(
            parse_claude_jsonl_text(line),
            Some(("text_delta".into(), "hello".into()))
        );
    }

    #[test]
    fn claude_stream_parser_reads_final_assistant_text() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"final"}]}}"#;

        assert_eq!(
            parse_claude_jsonl_text(line),
            Some(("text_delta".into(), "final\n".into()))
        );
    }

    #[test]
    fn claude_stream_parser_suppresses_thinking_blocks() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"hidden reasoning"}]}}"#;

        assert_eq!(
            parse_claude_jsonl_text(line),
            Some(("stdout".into(), String::new()))
        );
    }

    #[test]
    fn claude_stream_parser_suppresses_result_usage_event() {
        let line = r#"{"type":"result","result":"done"}"#;

        assert_eq!(
            parse_claude_jsonl_text(line),
            Some(("stdout".into(), String::new()))
        );
    }

    #[test]
    fn opened_paths_from_args_filters_supported_documents() {
        let cwd = std::env::temp_dir();
        let paths = opened_paths_from_args(
            vec![
                "typola.exe".into(),
                "notes.md".into(),
                "secret.txt".into(),
                cwd.join("page.html").to_string_lossy().to_string(),
            ],
            cwd.to_string_lossy().as_ref(),
        );

        assert_eq!(paths.len(), 2);
        assert!(paths.iter().any(|path| path.ends_with("notes.md")));
        assert!(paths.iter().any(|path| path.ends_with("page.html")));
    }
}
