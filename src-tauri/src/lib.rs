use std::{
    collections::HashMap,
    env,
    ffi::OsStr,
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
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
struct WorkspaceWatcherStore(Mutex<HashMap<String, WorkspaceWatcherEntry>>);

struct WorkspaceWatcherEntry {
    #[allow(dead_code)]
    root: PathBuf,
    #[allow(dead_code)]
    watcher: RecommendedWatcher,
}
#[derive(Default)]
struct AgentHeadlessStore(Arc<Mutex<AgentHeadlessRegistry>>);

#[derive(Default)]
struct AgentHeadlessRegistry {
    sessions: HashMap<String, String>,
    runs: HashMap<String, Arc<Mutex<Child>>>,
}

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
struct AgentSessionStartRequest {
    conversation_id: String,
    prompt: String,
    cwd: Option<String>,
    agent_path: Option<String>,
    model: Option<String>,
    plugin_dirs: Option<Vec<String>>,
    extra_allowed_dirs: Option<Vec<String>>,
    stall_timeout_ms: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArchiveArtifactRequest {
    artifact_path: String,
    workspace_root: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentSessionCancelRequest {
    run_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct McpConfigReadRequest {
    cwd: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct McpConfigWriteRequest {
    cwd: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenameDocumentRequest {
    path: String,
    new_name: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RenameDocumentResult {
    path: String,
    name: String,
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
struct AgentSessionStartResult {
    run_id: String,
    conversation_id: String,
    session_uuid: String,
    resumed: bool,
    agent_path: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AgentStdoutPayload {
    run_id: String,
    conversation_id: String,
    session_uuid: String,
    line: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AgentExitPayload {
    run_id: String,
    conversation_id: String,
    session_uuid: String,
    exit_code: Option<i32>,
    cancelled: bool,
    stderr_tail: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AgentStallPayload {
    run_id: String,
    conversation_id: String,
    session_uuid: String,
    idle_ms: u64,
    stderr_tail: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DirectoryEntryPayload {
    name: String,
    path: String,
    is_dir: bool,
    is_supported: bool,
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

#[derive(Serialize, Clone)]
struct WorkspaceChangedPayload {
    kind: String,
    paths: Vec<String>,
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
fn rename_opened_document(request: RenameDocumentRequest) -> Result<RenameDocumentResult, String> {
    let path = PathBuf::from(request.path);
    if !is_writable_document_path(&path) {
        return Err("unsupported document type".into());
    }
    let parent = path
        .parent()
        .ok_or_else(|| "document has no parent directory".to_string())?;
    let new_name = request.new_name.trim();
    if new_name.is_empty() || new_name.contains('/') || new_name.contains('\\') {
        return Err("invalid file name".into());
    }
    let target = parent.join(new_name);
    if !is_writable_document_path(&target) {
        return Err("unsupported document type".into());
    }
    if target.exists() && target != path {
        return Err("target file already exists".into());
    }
    std::fs::rename(&path, &target).map_err(|error| format!("failed to rename document: {error}"))?;
    let name = target
        .file_name()
        .and_then(OsStr::to_str)
        .ok_or_else(|| "invalid target file name".to_string())?
        .to_string();
    Ok(RenameDocumentResult {
        path: target.to_string_lossy().to_string(),
        name,
    })
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
fn archive_artifact_to_workspace(request: ArchiveArtifactRequest) -> Result<String, String> {
    let artifact_path = PathBuf::from(request.artifact_path);
    if !artifact_path.is_file() {
        return Err("artifact file not found".into());
    }
    if !is_openable_document_path(&artifact_path) {
        return Err("unsupported artifact type".into());
    }

    let workspace_root = PathBuf::from(request.workspace_root);
    if !workspace_root.is_dir() {
        return Err("workspace root not found".into());
    }
    let file_name = artifact_path
        .file_name()
        .and_then(OsStr::to_str)
        .ok_or_else(|| "invalid artifact file name".to_string())?;
    let target = unique_file_path(&workspace_root, file_name);
    std::fs::rename(&artifact_path, &target)
        .map_err(|error| format!("failed to archive artifact: {error}"))?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn agent_session_start(
    app: tauri::AppHandle,
    state: tauri::State<'_, AgentHeadlessStore>,
    request: AgentSessionStartRequest,
) -> Result<AgentSessionStartResult, String> {
    start_agent_headless_run(app, state, request, false)
}

#[tauri::command]
fn agent_session_resume(
    app: tauri::AppHandle,
    state: tauri::State<'_, AgentHeadlessStore>,
    request: AgentSessionStartRequest,
) -> Result<AgentSessionStartResult, String> {
    start_agent_headless_run(app, state, request, true)
}

#[tauri::command]
fn agent_session_cancel(
    state: tauri::State<'_, AgentHeadlessStore>,
    request: AgentSessionCancelRequest,
) -> Result<(), String> {
    let child = {
        let registry = state
            .0
            .lock()
            .map_err(|_| "agent headless store poisoned".to_string())?;
        registry
            .runs
            .get(&request.run_id)
            .cloned()
            .ok_or_else(|| "agent run not found".to_string())?
    };

    let mut child = child
        .lock()
        .map_err(|_| "agent child process poisoned".to_string())?;
    child
        .kill()
        .map_err(|error| format!("failed to cancel agent run: {error}"))
}

#[tauri::command]
fn read_mcp_config(request: McpConfigReadRequest) -> Result<Option<String>, String> {
    let cwd = PathBuf::from(request.cwd.trim());
    if !cwd.is_dir() {
        return Err("workspace path is not a directory".into());
    }
    let path = cwd.join(".mcp.json");
    if !path.exists() {
        return Ok(None);
    }
    std::fs::read_to_string(&path)
        .map(Some)
        .map_err(|error| format!("failed to read .mcp.json: {error}"))
}

#[tauri::command]
fn write_mcp_config(request: McpConfigWriteRequest) -> Result<(), String> {
    let cwd = PathBuf::from(request.cwd.trim());
    if !cwd.is_dir() {
        return Err("workspace path is not a directory".into());
    }
    let content = request.content.trim();
    if !content.is_empty() {
        serde_json::from_str::<serde_json::Value>(content)
            .map_err(|error| format!("invalid .mcp.json: {error}"))?;
    }
    std::fs::write(cwd.join(".mcp.json"), request.content)
        .map_err(|error| format!("failed to write .mcp.json: {error}"))
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

const WORKSPACE_IGNORE_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "dist",
    "target",
    ".worktrees",
    ".vscode",
    ".idea",
    ".DS_Store",
];

fn should_ignore_workspace_path(path: &Path) -> bool {
    for component in path.components() {
        let name = component.as_os_str().to_string_lossy();
        if name.starts_with('.') {
            return true;
        }
        if WORKSPACE_IGNORE_DIRS.iter().any(|ignored| name == *ignored) {
            return true;
        }
    }
    false
}

#[tauri::command]
fn watch_workspace(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceWatcherStore>,
    path: String,
) -> Result<(), String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("workspace path is not a directory: {path}"));
    }
    let key = watch_path_key(&root);

    let mut watchers = state
        .0
        .lock()
        .map_err(|_| "workspace watcher store poisoned".to_string())?;
    if watchers.contains_key(&key) {
        return Ok(());
    }

    let emit_app = app.clone();
    let root_for_filter = root.clone();
    let mut watcher: RecommendedWatcher = RecommendedWatcher::new(
        move |result: notify::Result<Event>| {
            let Ok(event) = result else { return; };
            if !is_document_change_event(&event.kind) {
                return;
            }
            let kind = workspace_change_kind(&event.kind);
            let mut touched: Vec<String> = event
                .paths
                .iter()
                .filter(|candidate| {
                    candidate.starts_with(&root_for_filter)
                        && !should_ignore_workspace_path(candidate)
                })
                .map(|candidate| watch_path_key(candidate))
                .collect();
            if touched.is_empty() {
                return;
            }
            touched.sort();
            touched.dedup();
            let _ = emit_app.emit(
                "workspace-changed",
                WorkspaceChangedPayload { kind, paths: touched },
            );
        },
        Config::default(),
    )
    .map_err(|error| format!("failed to create workspace watcher: {error}"))?;

    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|error| format!("failed to watch workspace: {error}"))?;

    let entry = WorkspaceWatcherEntry {
        root,
        watcher,
    };
    watchers.insert(key, entry);
    Ok(())
}

#[tauri::command]
fn unwatch_workspace(
    state: tauri::State<'_, WorkspaceWatcherStore>,
    path: String,
) -> Result<(), String> {
    let key = watch_path_key(Path::new(&path));
    let mut watchers = state
        .0
        .lock()
        .map_err(|_| "workspace watcher store poisoned".to_string())?;
    watchers.remove(&key);
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
        .manage(WorkspaceWatcherStore::default())
        .manage(AgentHeadlessStore::default())
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
            rename_opened_document,
            archive_artifact_to_workspace,
            write_attachment_file,
            agent_detect,
            agent_session_start,
            agent_session_resume,
            agent_session_cancel,
            read_mcp_config,
            write_mcp_config,
            list_directory_entries,
            watch_opened_document,
            unwatch_opened_document,
            watch_workspace,
            unwatch_workspace,
            terminal_create,
            terminal_write,
            terminal_resize,
            terminal_kill,
            terminal_clear,
            read_flow_scenarios,
            write_flow_scenarios,
            open_flow_scenarios_file
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

fn workspace_change_kind(kind: &EventKind) -> String {
    match kind {
        EventKind::Create(_) => "create".to_string(),
        EventKind::Remove(_) => "remove".to_string(),
        EventKind::Modify(notify::event::ModifyKind::Name(_)) => "rename".to_string(),
        EventKind::Modify(_) => "modify".to_string(),
        _ => "other".to_string(),
    }
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

fn unique_file_path(dir: &Path, file_name: &str) -> PathBuf {
    let original = Path::new(file_name);
    let stem = original
        .file_stem()
        .and_then(OsStr::to_str)
        .filter(|value| !value.is_empty())
        .unwrap_or("artifact");
    let extension = original.extension().and_then(OsStr::to_str);
    let format_name = |index: Option<usize>| match (index, extension) {
        (Some(index), Some(extension)) => format!("{stem}-{index}.{extension}"),
        (Some(index), None) => format!("{stem}-{index}"),
        (None, Some(extension)) => format!("{stem}.{extension}"),
        (None, None) => stem.to_string(),
    };
    let mut candidate = dir.join(format_name(None));
    let mut index = 2;
    while candidate.exists() {
        candidate = dir.join(format_name(Some(index)));
        index += 1;
    }
    candidate
}

fn normalize_agent_path(path: Option<&str>) -> String {
    if let Some(path) = path.map(str::trim).filter(|value| !value.is_empty()) {
        // Windows: 裸命令名(无路径分隔符、无扩展名)必须回退到 PATH/npm 全局扫描,
        // 因为 std::process::Command::new("claude") 不会自动尝试 PATHEXT 上的
        // .cmd/.exe/.bat 后缀,而 npm 全局安装的 Claude CLI 实际是 `claude.cmd`。
        // 不做这一步 detect 就会假阴报"未找到",尽管用户在终端里能直接用 `claude`。
        #[cfg(target_os = "windows")]
        {
            let p = std::path::Path::new(path);
            let bare = p
                .parent()
                .map_or(true, |parent| parent.as_os_str().is_empty())
                && p.extension().is_none();
            if bare {
                if let Some(resolved) = resolve_windows_bare_command(path) {
                    return resolved;
                }
            }
        }
        return path.to_string();
    }

    default_claude_command()
}

fn start_agent_headless_run(
    app: tauri::AppHandle,
    state: tauri::State<'_, AgentHeadlessStore>,
    request: AgentSessionStartRequest,
    prefer_resume: bool,
) -> Result<AgentSessionStartResult, String> {
    let conversation_id = request.conversation_id.trim();
    if conversation_id.is_empty() {
        return Err("conversationId is required".into());
    }
    if request.prompt.is_empty() {
        return Err("prompt is required".into());
    }

    let agent_path = normalize_agent_path(request.agent_path.as_deref());
    let run_id = uuid::Uuid::new_v4().to_string();
    let (session_uuid, resumed) = {
        let mut registry = state
            .0
            .lock()
            .map_err(|_| "agent headless store poisoned".to_string())?;
        let existing = registry.sessions.get(conversation_id).cloned();
        match (prefer_resume, existing) {
            (true, Some(session_uuid)) => (session_uuid, true),
            _ => {
                let session_uuid = uuid::Uuid::new_v4().to_string();
                registry
                    .sessions
                    .insert(conversation_id.to_string(), session_uuid.clone());
                (session_uuid, false)
            }
        }
    };

    let args = build_claude_headless_args(
        &session_uuid,
        resumed,
        request.model.as_deref(),
        request.plugin_dirs.as_deref().unwrap_or(&[]),
        request.extra_allowed_dirs.as_deref().unwrap_or(&[]),
    );
    let mut command = create_agent_command(&agent_path, &args);
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(cwd) = request.cwd.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        let cwd_path = PathBuf::from(cwd);
        std::fs::create_dir_all(&cwd_path)
            .map_err(|error| format!("failed to create Claude cwd: {error}"))?;
        command.current_dir(cwd_path);
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("failed to start Claude headless run: {error}"))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "failed to open Claude stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "failed to open Claude stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "failed to open Claude stderr".to_string())?;

    stdin
        .write_all(request.prompt.as_bytes())
        .and_then(|_| stdin.flush())
        .map_err(|error| format!("failed to write Claude prompt: {error}"))?;
    drop(stdin);

    let child = Arc::new(Mutex::new(child));
    {
        let mut registry = state
            .0
            .lock()
            .map_err(|_| "agent headless store poisoned".to_string())?;
        registry.runs.insert(run_id.clone(), Arc::clone(&child));
    }

    let stderr_tail = Arc::new(Mutex::new(String::new()));
    spawn_agent_stderr_collector(stderr, Arc::clone(&stderr_tail));
    let last_output_at = Arc::new(Mutex::new(Instant::now()));
    spawn_agent_stdout_forwarder(
        app.clone(),
        run_id.clone(),
        conversation_id.to_string(),
        session_uuid.clone(),
        stdout,
        Arc::clone(&last_output_at),
    );
    let done = Arc::new(AtomicBool::new(false));
    spawn_agent_stall_monitor(
        app.clone(),
        run_id.clone(),
        conversation_id.to_string(),
        session_uuid.clone(),
        Arc::clone(&last_output_at),
        Arc::clone(&stderr_tail),
        Arc::clone(&done),
        request.stall_timeout_ms.unwrap_or(30_000),
    );
    spawn_agent_waiter(
        app,
        child,
        Arc::clone(&state.0),
        run_id.clone(),
        conversation_id.to_string(),
        session_uuid.clone(),
        stderr_tail,
        done,
    );

    Ok(AgentSessionStartResult {
        run_id,
        conversation_id: conversation_id.to_string(),
        session_uuid,
        resumed,
        agent_path,
    })
}

fn build_claude_headless_args(
    session_uuid: &str,
    resumed: bool,
    model: Option<&str>,
    plugin_dirs: &[String],
    extra_allowed_dirs: &[String],
) -> Vec<String> {
    let mut args = vec![
        "-p".to_string(),
        "--input-format".to_string(),
        "text".to_string(),
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
    args.push(session_uuid.to_string());
    if let Some(model) = model.map(str::trim).filter(|value| !value.is_empty()) {
        args.push("--model".to_string());
        args.push(model.to_string());
    }
    for dir in plugin_dirs.iter().map(|value| value.trim()).filter(|value| !value.is_empty()) {
        args.push("--plugin-dir".to_string());
        args.push(dir.to_string());
    }
    for dir in extra_allowed_dirs
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        args.push("--add-dir".to_string());
        args.push(dir.to_string());
    }
    args
}

fn spawn_agent_stdout_forwarder(
    app: tauri::AppHandle,
    run_id: String,
    conversation_id: String,
    session_uuid: String,
    stdout: impl Read + Send + 'static,
    last_output_at: Arc<Mutex<Instant>>,
) {
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let Ok(line) = line else { break };
            if let Ok(mut last) = last_output_at.lock() {
                *last = Instant::now();
            }
            let _ = app.emit(
                "agent-stdout",
                AgentStdoutPayload {
                    run_id: run_id.clone(),
                    conversation_id: conversation_id.clone(),
                    session_uuid: session_uuid.clone(),
                    line,
                },
            );
        }
    });
}

fn spawn_agent_stderr_collector(stderr: impl Read + Send + 'static, stderr_tail: Arc<Mutex<String>>) {
    thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        let mut buffer = String::new();
        loop {
            buffer.clear();
            match reader.read_line(&mut buffer) {
                Ok(0) => break,
                Ok(_) => {
                    if let Ok(mut tail) = stderr_tail.lock() {
                        tail.push_str(&buffer);
                        if tail.len() > 8192 {
                            let keep_from = tail.len().saturating_sub(8192);
                            *tail = tail[keep_from..].to_string();
                        }
                    }
                }
                Err(_) => break,
            }
        }
    });
}

fn spawn_agent_stall_monitor(
    app: tauri::AppHandle,
    run_id: String,
    conversation_id: String,
    session_uuid: String,
    last_output_at: Arc<Mutex<Instant>>,
    stderr_tail: Arc<Mutex<String>>,
    done: Arc<AtomicBool>,
    stall_timeout_ms: u64,
) {
    thread::spawn(move || {
        let timeout = Duration::from_millis(stall_timeout_ms.max(5_000));
        let mut emitted = false;
        while !done.load(Ordering::Relaxed) {
            thread::sleep(Duration::from_millis(1_000));
            if emitted {
                continue;
            }
            let idle = last_output_at
                .lock()
                .map(|last| last.elapsed())
                .unwrap_or_default();
            if idle >= timeout {
                emitted = true;
                let stderr_tail = stderr_tail
                    .lock()
                    .map(|tail| tail.clone())
                    .unwrap_or_default();
                let _ = app.emit(
                    "agent-stall",
                    AgentStallPayload {
                        run_id: run_id.clone(),
                        conversation_id: conversation_id.clone(),
                        session_uuid: session_uuid.clone(),
                        idle_ms: idle.as_millis().min(u128::from(u64::MAX)) as u64,
                        stderr_tail,
                    },
                );
            }
        }
    });
}

fn spawn_agent_waiter(
    app: tauri::AppHandle,
    child: Arc<Mutex<Child>>,
    registry: Arc<Mutex<AgentHeadlessRegistry>>,
    run_id: String,
    conversation_id: String,
    session_uuid: String,
    stderr_tail: Arc<Mutex<String>>,
    done: Arc<AtomicBool>,
) {
    thread::spawn(move || {
        let exit_code = child
            .lock()
            .ok()
            .and_then(|mut child| child.wait().ok())
            .and_then(|status| status.code());
        if let Ok(mut registry) = registry.lock() {
            registry.runs.remove(&run_id);
        }
        done.store(true, Ordering::Relaxed);
        let stderr_tail = stderr_tail
            .lock()
            .map(|tail| tail.clone())
            .unwrap_or_default();
        let cancelled = exit_code.is_none();
        let _ = app.emit(
            "agent-exit",
            AgentExitPayload {
                run_id,
                conversation_id,
                session_uuid,
                exit_code,
                cancelled,
                stderr_tail,
            },
        );
    });
}

fn default_claude_command() -> String {
    #[cfg(target_os = "windows")]
    {
        if let Some(resolved) = resolve_windows_bare_command("claude") {
            return resolved;
        }
    }

    "claude".to_string()
}

#[cfg(target_os = "windows")]
fn resolve_windows_bare_command(bare_name: &str) -> Option<String> {
    // 1) 已知的 npm 全局位置(claude/pnpm/yarn 全局基本落在 %APPDATA%\npm)
    for candidate in windows_npm_global_candidates(bare_name) {
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }
    // 2) 系统 PATH 上扫 .cmd/.exe/.bat —— 兜底 nvm/volta/手装等其他路径
    if let Ok(path_env) = env::var("PATH") {
        for dir in env::split_paths(&path_env) {
            for ext in ["cmd", "exe", "bat"] {
                let candidate = dir.join(format!("{bare_name}.{ext}"));
                if candidate.is_file() {
                    return Some(candidate.to_string_lossy().to_string());
                }
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn windows_npm_global_candidates(bare_name: &str) -> Vec<PathBuf> {
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
        candidates.push(root.join(format!("{bare_name}.cmd")));
        candidates.push(root.join(format!("{bare_name}.exe")));
        candidates.push(root.join(bare_name));
    }
    candidates
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

fn flow_scenarios_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("failed to resolve app config dir: {error}"))?
        .join("typola");
    std::fs::create_dir_all(&dir).map_err(|error| format!("failed to create config dir: {error}"))?;
    Ok(dir.join("flow-scenarios.json"))
}

#[tauri::command]
fn read_flow_scenarios(app: tauri::AppHandle) -> Result<String, String> {
    let path = flow_scenarios_file(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(content) => Ok(content),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(format!("failed to read flow scenarios: {error}")),
    }
}

#[tauri::command]
fn write_flow_scenarios(app: tauri::AppHandle, content: String) -> Result<(), String> {
    let path = flow_scenarios_file(&app)?;
    std::fs::write(&path, content).map_err(|error| format!("failed to write flow scenarios: {error}"))
}

#[tauri::command]
fn open_flow_scenarios_file(app: tauri::AppHandle) -> Result<String, String> {
    let path = flow_scenarios_file(&app)?;
    if !path.exists() {
        std::fs::write(&path, "[]").map_err(|error| format!("failed to seed flow scenarios: {error}"))?;
    }
    Ok(path.to_string_lossy().to_string())
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
    fn claude_headless_args_use_text_stdin_and_stream_json_output() {
        let plugin_dirs = vec!["D:\\plugins\\one".to_string(), "D:\\plugins\\two".to_string()];
        let extra_allowed_dirs = vec!["D:\\workspace".to_string()];
        let args = build_claude_headless_args(
            "session-123",
            false,
            Some("sonnet"),
            &plugin_dirs,
            &extra_allowed_dirs,
        );

        assert!(args.windows(2).any(|pair| pair == ["--input-format", "text"]));
        assert!(args.windows(2).any(|pair| pair == ["--output-format", "stream-json"]));
        assert!(args.windows(2).any(|pair| pair == ["--session-id", "session-123"]));
        assert!(args.windows(2).any(|pair| pair == ["--model", "sonnet"]));
        assert!(args.windows(2).any(|pair| pair == ["--plugin-dir", "D:\\plugins\\one"]));
        assert!(args.windows(2).any(|pair| pair == ["--plugin-dir", "D:\\plugins\\two"]));
        assert!(args.windows(2).any(|pair| pair == ["--add-dir", "D:\\workspace"]));
        assert!(!args.contains(&"--resume".to_string()));
    }

    #[test]
    fn claude_headless_resume_args_reuse_session_uuid() {
        let args = build_claude_headless_args("session-123", true, None, &[], &[]);

        assert!(args.windows(2).any(|pair| pair == ["--resume", "session-123"]));
        assert!(!args.contains(&"--session-id".to_string()));
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
