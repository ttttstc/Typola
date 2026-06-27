use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
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
    time::{Duration, SystemTime, UNIX_EPOCH},
};
#[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
use tauri::Emitter;
use tauri::Emitter as _;
use tauri::Manager;
use wait_timeout::ChildExt;

mod export;

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
    runs: HashMap<String, AgentRunHandle>,
}

#[derive(Clone)]
struct AgentRunHandle {
    #[allow(dead_code)]
    child: Arc<Mutex<Child>>,
    pid: u32,
    cancel_requested: Arc<AtomicBool>,
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
    provider: Option<AgentProvider>,
    agent_path: Option<String>,
    runtime_id: Option<AgentProvider>,
    custom_path: Option<String>,
    default_command: Option<String>,
    version_args: Option<Vec<String>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
enum AgentProvider {
    Claude,
    Opencode,
}

impl Default for AgentProvider {
    fn default() -> Self {
        Self::Claude
    }
}

impl AgentProvider {
    fn default_command(self) -> String {
        match self {
            Self::Claude => default_agent_command("claude"),
            Self::Opencode => default_agent_command("opencode"),
        }
    }

    fn detect_args(self) -> Vec<String> {
        match self {
            Self::Claude => vec!["--version".to_string()],
            Self::Opencode => vec!["--version".to_string()],
        }
    }

    fn display_name(self) -> &'static str {
        match self {
            Self::Claude => "Claude",
            Self::Opencode => "OpenCode",
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentSessionStartRequest {
    provider: Option<AgentProvider>,
    conversation_id: String,
    prompt: String,
    cwd: Option<String>,
    agent_path: Option<String>,
    model: Option<String>,
    plugin_dirs: Option<Vec<String>>,
    extra_allowed_dirs: Option<Vec<String>>,
    prompt_context_paths: Option<Vec<String>>,
    command_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArchiveArtifactRequest {
    artifact_path: String,
    workspace_root: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OverwriteArtifactRequest {
    artifact_path: String,
    target_path: String,
    workspace_root: Option<String>,
    expected_document_path: Option<String>,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProcessInsertedImageRequest {
    document_path: String,
    source_bytes: Option<Vec<u8>>,
    source_path: Option<String>,
    file_name: Option<String>,
    copy_destination: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProcessInsertedImageResult {
    path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UploadImageRequest {
    command: String,
    image_paths: Vec<String>,
    document_path: String,
    document_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UploadImageResult {
    urls: Vec<String>,
    raw_stdout: String,
    raw_stderr: String,
    exit_code: Option<i32>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AgentDetectResult {
    runtime_id: AgentProvider,
    available: bool,
    path: String,
    executable_path: Option<String>,
    version: Option<String>,
    auth_status: String,
    diagnostics: Vec<AgentDiagnostic>,
    detected_at: String,
    error: Option<String>,
    exit_code: Option<i32>,
    stdout_preview: Option<String>,
    stderr_preview: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AgentDiagnostic {
    code: String,
    level: String,
    title: String,
    detail: String,
    fix: Option<AgentDiagnosticFix>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AgentDiagnosticFix {
    label: String,
    action: String,
    payload: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AgentSessionStartResult {
    run_id: String,
    conversation_id: String,
    session_uuid: String,
    resumed: bool,
    agent_path: String,
    provider: AgentProvider,
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

// 动态把目录加入 asset protocol scope:每次打开/另存文档时调,允许 webview 通过
// convertFileSrc() 读取该目录(递归)的本地图片。幂等;重复 allow 无害。
#[tauri::command]
fn allow_asset_directory(app: tauri::AppHandle, dir: String) -> Result<(), String> {
    app.asset_protocol_scope()
        .allow_directory(dir, true)
        .map_err(|error| format!("failed to allow asset directory: {error}"))
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
    std::fs::rename(&path, &target)
        .map_err(|error| format!("failed to rename document: {error}"))?;
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
fn process_inserted_image(
    request: ProcessInsertedImageRequest,
) -> Result<ProcessInsertedImageResult, String> {
    let document_path = PathBuf::from(&request.document_path);
    if !is_writable_document_path(&document_path) {
        return Err("unsupported document type".into());
    }
    let parent = document_path
        .parent()
        .ok_or_else(|| "document has no parent directory".to_string())?;
    let destination = sanitize_relative_dir(&request.copy_destination);
    let output_dir = parent.join(destination);
    std::fs::create_dir_all(&output_dir)
        .map_err(|error| format!("failed to create image directory: {error}"))?;

    let requested_name = request
        .file_name
        .as_deref()
        .or_else(|| {
            request
                .source_path
                .as_deref()
                .and_then(|path| Path::new(path).file_name()?.to_str())
        })
        .unwrap_or("inserted-image.png");
    let safe_name = sanitize_attachment_file_name(requested_name);
    let output_path = unique_attachment_path(&output_dir, &safe_name);

    if let Some(bytes) = request.source_bytes {
        std::fs::write(&output_path, bytes)
            .map_err(|error| format!("failed to write inserted image: {error}"))?;
    } else if let Some(source_path) = request.source_path {
        std::fs::copy(&source_path, &output_path)
            .map_err(|error| format!("failed to copy inserted image: {error}"))?;
    } else {
        return Err("missing image source".into());
    }

    Ok(ProcessInsertedImageResult {
        path: output_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn upload_image_via_command(request: UploadImageRequest) -> Result<UploadImageResult, String> {
    if request.image_paths.is_empty() {
        return Err("no images to upload".into());
    }
    let command = request
        .command
        .replace("${filename}", &request.document_name)
        .replace("${filepath}", &request.document_path);
    let full_command = build_upload_shell_command(&command, &request.image_paths);
    let output = if cfg!(target_os = "windows") {
        Command::new("cmd").args(["/C", &full_command]).output()
    } else {
        Command::new("sh").args(["-c", &full_command]).output()
    }
    .map_err(|error| format!("failed to run upload command: {error}"))?;

    let raw_stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let raw_stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if !output.status.success() {
        return Err(format!(
            "upload command failed with exit code {:?}: {}",
            output.status.code(),
            raw_stderr.trim()
        ));
    }
    let urls = parse_upload_urls(&raw_stdout, request.image_paths.len())?;
    Ok(UploadImageResult {
        urls,
        raw_stdout,
        raw_stderr,
        exit_code: output.status.code(),
    })
}

#[tauri::command]
fn agent_detect(request: AgentDetectRequest) -> AgentDetectResult {
    detect_agent_runtime(request)
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

fn canonical_output_dir_for_artifact(
    artifact_path: &Path,
    workspace_root: Option<&str>,
) -> Result<PathBuf, String> {
    let canonical = artifact_path
        .canonicalize()
        .map_err(|error| format!("failed to resolve path: {error}"))?;
    let inferred_output_dir = canonical
        .ancestors()
        .find(|path| path.file_name().and_then(OsStr::to_str) == Some(".typola-output"))
        .map(PathBuf::from);
    let mut candidate_output_dirs = Vec::new();
    if let Some(workspace_root) = workspace_root.filter(|root| !root.is_empty()) {
        candidate_output_dirs.push(PathBuf::from(workspace_root).join(".typola-output"));
    }
    if let Some(output_dir) = inferred_output_dir {
        candidate_output_dirs.push(output_dir);
    }
    for output_dir in candidate_output_dirs {
        if let Ok(canonical_output) = output_dir.canonicalize() {
            if canonical.starts_with(&canonical_output) {
                return Ok(canonical_output);
            }
        }
    }
    Err("refused: path is outside .typola-output directory".into())
}

fn path_matches_optional_expected(path: &Path, expected_path: Option<&str>) -> bool {
    expected_path
        .filter(|value| !value.is_empty())
        .and_then(|value| PathBuf::from(value).canonicalize().ok())
        .is_some_and(|expected| path == expected)
}

fn path_is_inside_optional_workspace(path: &Path, workspace_root: Option<&str>) -> bool {
    workspace_root
        .filter(|value| !value.is_empty())
        .and_then(|value| PathBuf::from(value).canonicalize().ok())
        .is_some_and(|workspace| path.starts_with(workspace))
}

fn validate_overwrite_target(
    request: &OverwriteArtifactRequest,
    target_path: &Path,
) -> Result<PathBuf, String> {
    let canonical_target = target_path
        .canonicalize()
        .map_err(|error| format!("failed to resolve target document: {error}"))?;
    if path_matches_optional_expected(&canonical_target, request.expected_document_path.as_deref())
        || path_is_inside_optional_workspace(&canonical_target, request.workspace_root.as_deref())
    {
        return Ok(canonical_target);
    }
    Err("refused: target document is outside the allowed document/workspace scope".into())
}

fn artifact_manifest_path(artifact_path: &Path) -> Result<PathBuf, String> {
    let parent = artifact_path
        .parent()
        .ok_or_else(|| "invalid artifact parent".to_string())?;
    Ok(parent.join("artifact.json"))
}

fn read_manifest_json(path: &Path) -> serde_json::Value {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
        .unwrap_or_else(|| serde_json::json!({}))
}

fn write_manifest_json(path: &Path, manifest: &serde_json::Value) -> Result<String, String> {
    let content = serde_json::to_string_pretty(manifest)
        .map_err(|error| format!("failed to serialize artifact manifest: {error}"))?;
    std::fs::write(path, format!("{content}\n"))
        .map_err(|error| format!("failed to write artifact manifest: {error}"))?;
    Ok(content)
}

fn update_manifest_overwrite(
    manifest_path: &Path,
    artifact_path: &Path,
    target_path: &Path,
    backup_path: Option<&Path>,
) -> Result<String, String> {
    let mut manifest = read_manifest_json(manifest_path);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".into());
    if !manifest.is_object() {
        manifest = serde_json::json!({});
    }
    manifest["primaryFile"] =
        serde_json::Value::String(artifact_path.to_string_lossy().to_string());
    manifest["updatedAt"] = serde_json::Value::String(now.clone());
    if let Some(backup_path) = backup_path {
        manifest["overwrite"] = serde_json::json!({
            "targetPath": target_path.to_string_lossy().to_string(),
            "backupPath": backup_path.to_string_lossy().to_string(),
            "appliedAt": now,
        });
        if !manifest
            .get("actions")
            .is_some_and(|value| value.is_object())
        {
            manifest["actions"] = serde_json::json!({});
        }
        manifest["actions"]["undoOverwrite"] = serde_json::Value::Bool(true);
    } else if let Some(object) = manifest.as_object_mut() {
        object.remove("overwrite");
        if let Some(actions) = object
            .get_mut("actions")
            .and_then(|value| value.as_object_mut())
        {
            actions.remove("undoOverwrite");
        }
    }
    write_manifest_json(manifest_path, &manifest)
}

#[tauri::command]
fn overwrite_artifact_to_document(request: OverwriteArtifactRequest) -> Result<String, String> {
    let artifact_path = PathBuf::from(&request.artifact_path);
    let target_path = PathBuf::from(&request.target_path);
    if !artifact_path.is_file() {
        return Err("artifact file not found".into());
    }
    if !target_path.is_file() {
        return Err("target document not found".into());
    }
    if !is_openable_document_path(&artifact_path) || !is_openable_document_path(&target_path) {
        return Err("unsupported artifact or target type".into());
    }
    canonical_output_dir_for_artifact(&artifact_path, None)?;
    let target_path = validate_overwrite_target(&request, &target_path)?;
    let artifact_parent = artifact_path
        .parent()
        .ok_or_else(|| "invalid artifact parent".to_string())?;
    let backup_dir = artifact_parent.join("backups");
    std::fs::create_dir_all(&backup_dir)
        .map_err(|error| format!("failed to create backup directory: {error}"))?;
    let target_name = target_path
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or("document");
    let backup_path = unique_file_path(&backup_dir, &format!("{target_name}.bak"));
    std::fs::copy(&target_path, &backup_path)
        .map_err(|error| format!("failed to backup target document: {error}"))?;
    std::fs::copy(&artifact_path, &target_path)
        .map_err(|error| format!("failed to overwrite target document: {error}"))?;
    update_manifest_overwrite(
        &artifact_manifest_path(&artifact_path)?,
        &artifact_path,
        &target_path,
        Some(&backup_path),
    )
}

#[tauri::command]
fn undo_artifact_overwrite(request: OverwriteArtifactRequest) -> Result<String, String> {
    let artifact_path = PathBuf::from(&request.artifact_path);
    let target_path = PathBuf::from(&request.target_path);
    if !artifact_path.is_file() {
        return Err("artifact file not found".into());
    }
    if !target_path.is_file() {
        return Err("target document not found".into());
    }
    if !is_openable_document_path(&artifact_path) || !is_openable_document_path(&target_path) {
        return Err("unsupported artifact or target type".into());
    }
    canonical_output_dir_for_artifact(&artifact_path, None)?;
    let manifest_path = artifact_manifest_path(&artifact_path)?;
    let manifest = read_manifest_json(&manifest_path);
    let backup_path = manifest
        .get("overwrite")
        .and_then(|value| value.get("backupPath"))
        .and_then(|value| value.as_str())
        .ok_or_else(|| "artifact has no overwrite backup".to_string())?;
    let backup_path = PathBuf::from(backup_path);
    if !backup_path.is_file() {
        return Err("overwrite backup not found".into());
    }
    canonical_output_dir_for_artifact(&backup_path, None)?;
    let target_path = validate_overwrite_target(&request, &target_path)?;
    let manifest_target = manifest
        .get("overwrite")
        .and_then(|value| value.get("targetPath"))
        .and_then(|value| value.as_str())
        .ok_or_else(|| "artifact has no overwrite target".to_string())?;
    let manifest_target = PathBuf::from(manifest_target)
        .canonicalize()
        .map_err(|error| format!("failed to resolve overwrite target: {error}"))?;
    if manifest_target != target_path {
        return Err("refused: undo target does not match the recorded overwrite target".into());
    }
    std::fs::copy(&backup_path, &target_path)
        .map_err(|error| format!("failed to restore backup: {error}"))?;
    update_manifest_overwrite(&manifest_path, &artifact_path, &target_path, None)
}

#[derive(Debug, Deserialize)]
struct DeleteArtifactRequest {
    path: String,
    workspace_root: Option<String>,
}

#[tauri::command]
fn delete_artifact_file(request: DeleteArtifactRequest) -> Result<(), String> {
    let artifact_path = PathBuf::from(&request.path);
    if !artifact_path.is_file() {
        return Err("artifact file not found".into());
    }
    canonical_output_dir_for_artifact(&artifact_path, request.workspace_root.as_deref())?;
    std::fs::remove_file(&artifact_path)
        .map_err(|error| format!("failed to delete artifact: {error}"))
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
    let run = {
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

    run.cancel_requested.store(true, Ordering::Relaxed);
    kill_agent_process_tree(&run)
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
            let Ok(event) = result else {
                return;
            };
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
                WorkspaceChangedPayload {
                    kind,
                    paths: touched,
                },
            );
        },
        Config::default(),
    )
    .map_err(|error| format!("failed to create workspace watcher: {error}"))?;

    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|error| format!("failed to watch workspace: {error}"))?;

    let entry = WorkspaceWatcherEntry { root, watcher };
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

            // 用户双击 exe 时如果应用已在后台,窗口可能被最小化/遮挡,
            // 必须无条件 unminimize + show + focus 把窗口拽回前面。
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }

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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            pending_opened_paths,
            force_close_main_window,
            allow_asset_directory,
            read_opened_document,
            write_opened_document,
            rename_opened_document,
            archive_artifact_to_workspace,
            overwrite_artifact_to_document,
            undo_artifact_overwrite,
            delete_artifact_file,
            write_attachment_file,
            process_inserted_image,
            upload_image_via_command,
            export::export_pdf_file,
            export::export_pandoc_file,
            export::detect_pandoc_path,
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
            list_local_skills,
            read_skill_hub,
            write_skill_hub
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

fn sanitize_relative_dir(dir: &str) -> PathBuf {
    let cleaned = dir
        .replace('\\', "/")
        .split('/')
        .filter_map(|part| {
            let trimmed = part.trim();
            if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
                None
            } else {
                Some(sanitize_attachment_file_name(trimmed))
            }
        })
        .fold(PathBuf::new(), |mut path, part| {
            path.push(part);
            path
        });
    if cleaned.as_os_str().is_empty() {
        PathBuf::from("assets")
    } else {
        cleaned
    }
}

fn build_upload_shell_command(command: &str, image_paths: &[String]) -> String {
    let mut full = command.trim().to_string();
    for path in image_paths {
        full.push(' ');
        full.push_str(&shell_quote(path));
    }
    full
}

fn shell_quote(value: &str) -> String {
    if cfg!(target_os = "windows") {
        format!("\"{}\"", value.replace('"', "\\\""))
    } else {
        format!("'{}'", value.replace('\'', "'\\''"))
    }
}

fn parse_upload_urls(stdout: &str, count: usize) -> Result<Vec<String>, String> {
    let lines = stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    if lines.len() < count {
        return Err("upload command did not output enough URL lines".into());
    }
    let urls = lines[lines.len() - count..].to_vec();
    if urls.iter().any(|url| !is_upload_url(url)) {
        return Err("upload command output does not end with valid URLs".into());
    }
    Ok(urls)
}

fn is_upload_url(value: &str) -> bool {
    value.starts_with("http://")
        || value.starts_with("https://")
        || value.starts_with("data:image/")
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

struct AgentCommandSpec {
    args: Vec<String>,
    prompt_stdin: bool,
}

fn normalize_agent_path(provider: AgentProvider, path: Option<&str>) -> String {
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

    provider.default_command()
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

    let provider = request.provider.unwrap_or_default();
    let agent_path = normalize_agent_path(provider, request.agent_path.as_deref());
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

    let command_spec = build_agent_headless_command(
        provider,
        &session_uuid,
        resumed,
        request.model.as_deref(),
        request.cwd.as_deref(),
        request.plugin_dirs.as_deref().unwrap_or(&[]),
        request.extra_allowed_dirs.as_deref().unwrap_or(&[]),
        request.prompt_context_paths.as_deref().unwrap_or(&[]),
        request.command_name.as_deref(),
        &request.prompt,
    );
    let mut command = create_agent_command(&agent_path, &command_spec.args);
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(cwd) = request
        .cwd
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let cwd_path = PathBuf::from(cwd);
        std::fs::create_dir_all(&cwd_path).map_err(|error| {
            format!("failed to create {} cwd: {error}", provider.display_name())
        })?;
        command.current_dir(cwd_path);
    }

    let mut child = command.spawn().map_err(|error| {
        format!(
            "failed to start {} headless run: {error}",
            provider.display_name()
        )
    })?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| format!("failed to open {} stdin", provider.display_name()))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| format!("failed to open {} stdout", provider.display_name()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| format!("failed to open {} stderr", provider.display_name()))?;

    if command_spec.prompt_stdin {
        stdin
            .write_all(request.prompt.as_bytes())
            .and_then(|_| stdin.flush())
            .map_err(|error| {
                format!(
                    "failed to write {} prompt: {error}",
                    provider.display_name()
                )
            })?;
    }
    drop(stdin);

    let pid = child.id();
    let child = Arc::new(Mutex::new(child));
    let cancel_requested = Arc::new(AtomicBool::new(false));
    {
        let mut registry = state
            .0
            .lock()
            .map_err(|_| "agent headless store poisoned".to_string())?;
        registry.runs.insert(
            run_id.clone(),
            AgentRunHandle {
                child: Arc::clone(&child),
                pid,
                cancel_requested: Arc::clone(&cancel_requested),
            },
        );
    }

    let stderr_tail = Arc::new(Mutex::new(String::new()));
    spawn_agent_stderr_collector(stderr, Arc::clone(&stderr_tail));
    spawn_agent_stdout_forwarder(
        app.clone(),
        run_id.clone(),
        conversation_id.to_string(),
        session_uuid.clone(),
        stdout,
    );
    spawn_agent_waiter(
        app,
        child,
        Arc::clone(&state.0),
        run_id.clone(),
        conversation_id.to_string(),
        session_uuid.clone(),
        stderr_tail,
        cancel_requested,
    );

    Ok(AgentSessionStartResult {
        run_id,
        conversation_id: conversation_id.to_string(),
        session_uuid,
        resumed,
        agent_path,
        provider,
    })
}

fn kill_agent_process_tree(run: &AgentRunHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let status = Command::new("taskkill")
            .args(["/PID", &run.pid.to_string(), "/T", "/F"])
            .creation_flags(0x08000000)
            .status()
            .map_err(|error| format!("failed to run taskkill: {error}"))?;
        if status.success() {
            return Ok(());
        }
        return Err(format!("taskkill failed with status: {status}"));
    }

    #[cfg(not(target_os = "windows"))]
    {
        run.child
            .lock()
            .map_err(|_| "agent child process poisoned".to_string())?
            .kill()
            .map_err(|error| format!("failed to cancel agent run: {error}"))
    }
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
    for dir in plugin_dirs
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
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

fn build_opencode_headless_args(
    _session_uuid: &str,
    resumed: bool,
    model: Option<&str>,
    project_dir: Option<&str>,
    prompt_context_paths: &[String],
    command_name: Option<&str>,
    prompt: &str,
) -> Vec<String> {
    let mut args = vec![
        "run".to_string(),
        "--format".to_string(),
        "json".to_string(),
        "--dangerously-skip-permissions".to_string(),
    ];
    if resumed {
        args.push("--continue".to_string());
    }
    if let Some(dir) = project_dir.map(str::trim).filter(|value| !value.is_empty()) {
        args.push("--dir".to_string());
        args.push(dir.to_string());
    }
    if let Some(model) = model.map(str::trim).filter(|value| !value.is_empty()) {
        args.push("--model".to_string());
        args.push(model.to_string());
    }
    if let Some(command_name) = command_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        args.push("--command".to_string());
        args.push(command_name.trim_start_matches('/').to_string());
    }
    args.push(prompt.to_string());
    for path in prompt_context_paths
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        args.push("--file".to_string());
        args.push(path.to_string());
    }
    args
}

fn build_agent_headless_command(
    provider: AgentProvider,
    session_uuid: &str,
    resumed: bool,
    model: Option<&str>,
    cwd: Option<&str>,
    plugin_dirs: &[String],
    extra_allowed_dirs: &[String],
    prompt_context_paths: &[String],
    command_name: Option<&str>,
    prompt: &str,
) -> AgentCommandSpec {
    match provider {
        AgentProvider::Claude => AgentCommandSpec {
            args: build_claude_headless_args(
                session_uuid,
                resumed,
                model,
                plugin_dirs,
                extra_allowed_dirs,
            ),
            prompt_stdin: true,
        },
        AgentProvider::Opencode => AgentCommandSpec {
            args: build_opencode_headless_args(
                session_uuid,
                resumed,
                model,
                extra_allowed_dirs.first().map(String::as_str).or(cwd),
                prompt_context_paths,
                command_name,
                prompt,
            ),
            prompt_stdin: false,
        },
    }
}

fn spawn_agent_stdout_forwarder(
    app: tauri::AppHandle,
    run_id: String,
    conversation_id: String,
    session_uuid: String,
    stdout: impl Read + Send + 'static,
) {
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let Ok(line) = line else { break };
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

fn spawn_agent_stderr_collector(
    stderr: impl Read + Send + 'static,
    stderr_tail: Arc<Mutex<String>>,
) {
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

fn spawn_agent_waiter(
    app: tauri::AppHandle,
    child: Arc<Mutex<Child>>,
    registry: Arc<Mutex<AgentHeadlessRegistry>>,
    run_id: String,
    conversation_id: String,
    session_uuid: String,
    stderr_tail: Arc<Mutex<String>>,
    cancel_requested: Arc<AtomicBool>,
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
        let stderr_tail = stderr_tail
            .lock()
            .map(|tail| tail.clone())
            .unwrap_or_default();
        let cancelled = cancel_requested.load(Ordering::Relaxed) || exit_code.is_none();
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

fn default_agent_command(command_name: &str) -> String {
    #[cfg(target_os = "windows")]
    {
        if let Some(resolved) = resolve_windows_bare_command(command_name) {
            return resolved;
        }
    }

    command_name.to_string()
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
        if let Some(target) = resolve_windows_cmd_wrapper_target(command_path) {
            let mut command = Command::new(target);
            command.args(args);
            command.creation_flags(CREATE_NO_WINDOW);
            return command;
        }
        let mut command = Command::new("cmd");
        let command_line = build_windows_cmd_invocation(command_path, args);
        command.arg("/d").arg("/s").arg("/c").raw_arg(command_line);
        command.creation_flags(CREATE_NO_WINDOW);
        return command;
    }
    let mut command = Command::new(command_path);
    command.args(args);
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

#[cfg(target_os = "windows")]
fn build_windows_cmd_invocation(command_path: &str, args: &[String]) -> String {
    let parts = std::iter::once(command_path)
        .map(quote_windows_cmd_arg)
        .chain(args.iter().map(|arg| quote_windows_cmd_arg(arg)))
        .collect::<Vec<_>>()
        .join(" ");
    format!("\"{parts}\"")
}

#[cfg(target_os = "windows")]
fn quote_windows_cmd_arg(value: &str) -> String {
    let mut quoted = String::from("\"");
    for ch in value.chars() {
        match ch {
            '"' => quoted.push_str("\\\""),
            '%' => quoted.push_str("%%"),
            _ => quoted.push(ch),
        }
    }
    quoted.push('"');
    quoted
}

#[cfg(target_os = "windows")]
fn resolve_windows_cmd_wrapper_target(command_path: &str) -> Option<PathBuf> {
    let command_path = Path::new(command_path);
    let base_dir = command_path.parent()?;
    let content = std::fs::read_to_string(command_path).ok()?;
    for line in content.lines() {
        let Some(marker_index) = line.find("%dp0%\\").or_else(|| line.find("%dp0%/")) else {
            continue;
        };
        let marker_len = "%dp0%\\".len();
        let after_marker = &line[marker_index + marker_len..];
        let Some(end_quote) = after_marker.find('"') else {
            continue;
        };
        let relative = after_marker[..end_quote].trim_start_matches(['\\', '/']);
        if relative.is_empty() {
            continue;
        }
        let target = base_dir.join(relative);
        let target_name = target
            .file_name()
            .and_then(OsStr::to_str)
            .unwrap_or_default()
            .to_ascii_lowercase();
        let is_direct_executable = target
            .extension()
            .and_then(OsStr::to_str)
            .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
            && target_name != "node.exe";
        if is_direct_executable && target.is_file() {
            return Some(target);
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
fn create_agent_command(command_path: &str, args: &[String]) -> Command {
    let mut command = Command::new(command_path);
    command.args(args);
    command
}

struct AgentVersionProbe {
    version: Option<String>,
    exit_code: Option<i32>,
    stdout_preview: String,
    stderr_preview: String,
}

fn detect_agent_runtime(request: AgentDetectRequest) -> AgentDetectResult {
    let provider = request.runtime_id.or(request.provider).unwrap_or_default();
    let requested_path = request
        .custom_path
        .as_deref()
        .or(request.agent_path.as_deref());
    let default_command = request
        .default_command
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| normalize_agent_path(provider, Some(value)))
        .unwrap_or_else(|| provider.default_command());
    let agent_path = requested_path
        .map(|value| normalize_agent_path(provider, Some(value)))
        .unwrap_or(default_command);
    let version_args = request
        .version_args
        .filter(|args| !args.is_empty())
        .unwrap_or_else(|| provider.detect_args());
    let detected_at = detected_at_millis();

    if let Some(diagnostic) =
        validate_agent_path_before_spawn(provider, requested_path, &agent_path)
    {
        return AgentDetectResult {
            runtime_id: provider,
            available: false,
            path: agent_path,
            executable_path: None,
            version: None,
            auth_status: "unknown".into(),
            error: Some(diagnostic.detail.clone()),
            diagnostics: vec![diagnostic],
            detected_at,
            exit_code: None,
            stdout_preview: None,
            stderr_preview: None,
        };
    }

    match run_agent_version(provider, &agent_path, &version_args) {
        Ok(probe) => {
            let mut diagnostics = vec![agent_diagnostic(
                "ok",
                "ok",
                format!("{} CLI 可用", provider.display_name()),
                format!("已识别到 {}：{}", provider.display_name(), agent_path),
                None,
            )];
            diagnostics.push(agent_diagnostic(
                "auth_unknown",
                "warning",
                "尚未验证登录状态",
                "本次只做 CLI 识别，不运行模型请求；如果后续对话失败，请先在终端确认 CLI 已登录。",
                None,
            ));
            AgentDetectResult {
                runtime_id: provider,
                available: true,
                path: agent_path.clone(),
                executable_path: Some(agent_path),
                version: probe.version,
                auth_status: "unknown".into(),
                error: None,
                diagnostics,
                detected_at,
                exit_code: probe.exit_code,
                stdout_preview: optional_preview(probe.stdout_preview),
                stderr_preview: optional_preview(probe.stderr_preview),
            }
        }
        Err((diagnostic, probe)) => AgentDetectResult {
            runtime_id: provider,
            available: false,
            path: agent_path,
            executable_path: None,
            version: None,
            auth_status: "unknown".into(),
            error: Some(diagnostic.detail.clone()),
            diagnostics: vec![diagnostic],
            detected_at,
            exit_code: probe.as_ref().and_then(|value| value.exit_code),
            stdout_preview: probe
                .as_ref()
                .and_then(|value| optional_preview(value.stdout_preview.clone())),
            stderr_preview: probe.and_then(|value| optional_preview(value.stderr_preview)),
        },
    }
}

fn run_agent_version(
    provider: AgentProvider,
    agent_path: &str,
    version_args: &[String],
) -> Result<AgentVersionProbe, (AgentDiagnostic, Option<AgentVersionProbe>)> {
    let mut child = create_agent_command(agent_path, version_args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            let diagnostic = classify_spawn_error(provider, agent_path, &error.to_string());
            (diagnostic, None)
        })?;

    let stdout_reader = child.stdout.take().map(spawn_preview_reader);
    let stderr_reader = child.stderr.take().map(spawn_preview_reader);
    let status = match child.wait_timeout(Duration::from_secs(5)) {
        Ok(Some(status)) => status,
        Ok(None) => {
            let _ = child.kill();
            let _ = child.wait();
            let stdout = join_preview_reader(stdout_reader);
            let stderr = join_preview_reader(stderr_reader);
            let probe = AgentVersionProbe {
                version: optional_preview(
                    stdout.lines().next().unwrap_or_default().trim().to_string(),
                ),
                exit_code: None,
                stdout_preview: preview_text(&stdout),
                stderr_preview: preview_text(&stderr),
            };
            let diagnostic = agent_diagnostic(
                "timeout",
                "error",
                format!("{} CLI 检测超时", provider.display_name()),
                format!(
                    "Typola 启动了 {agent_path}，但版本探测在 5 秒内没有结束。请先在终端运行 `{}` 确认是否会卡住。",
                    display_command(agent_path, version_args),
                ),
                Some(agent_fix("重新检测", "rescan", None)),
            );
            return Err((diagnostic, Some(probe)));
        }
        Err(error) => {
            let diagnostic = classify_spawn_error(provider, agent_path, &error.to_string());
            return Err((diagnostic, None));
        }
    };

    let stdout = join_preview_reader(stdout_reader);
    let stderr = join_preview_reader(stderr_reader);
    let probe = AgentVersionProbe {
        version: optional_preview(stdout.lines().next().unwrap_or_default().trim().to_string()),
        exit_code: status.code(),
        stdout_preview: preview_text(&stdout),
        stderr_preview: preview_text(&stderr),
    };

    if !status.success() {
        let detail = if probe.stderr_preview.trim().is_empty() {
            format!(
                "{} CLI 能启动，但 `--version` 返回非 0。",
                provider.display_name()
            )
        } else {
            probe.stderr_preview.clone()
        };
        let diagnostic = agent_diagnostic(
            "version_failed",
            "error",
            format!("{} CLI 版本探测失败", provider.display_name()),
            format!(
                "Typola 已找到 {agent_path}，但执行 `{}` 失败。输出：{}",
                display_command(agent_path, version_args),
                detail,
            ),
            Some(agent_fix("重新检测", "rescan", None)),
        );
        return Err((diagnostic, Some(probe)));
    }

    Ok(probe)
}

fn spawn_preview_reader(reader: impl Read + Send + 'static) -> thread::JoinHandle<String> {
    thread::spawn(move || read_preview(reader))
}

fn join_preview_reader(handle: Option<thread::JoinHandle<String>>) -> String {
    handle
        .and_then(|reader| reader.join().ok())
        .unwrap_or_default()
}

fn validate_agent_path_before_spawn(
    provider: AgentProvider,
    requested_path: Option<&str>,
    resolved_path: &str,
) -> Option<AgentDiagnostic> {
    let requested = requested_path?.trim();
    if requested.is_empty() || is_bare_command(requested) {
        return None;
    }
    let path = Path::new(resolved_path);
    if !path.exists() {
        return Some(agent_diagnostic(
            "not_found",
            "error",
            format!("{} CLI 路径不存在", provider.display_name()),
            format!("Typola 找不到你填写的 CLI 路径：{resolved_path}。请检查路径，或清空后让 Typola 从 PATH 自动识别。"),
            Some(agent_fix("选择路径", "choose_file", Some(resolved_path.to_string()))),
        ));
    }
    if !path.is_file() {
        return Some(agent_diagnostic(
            "not_executable",
            "error",
            format!("{} CLI 路径不是可执行文件", provider.display_name()),
            format!(
                "你填写的路径不是文件：{resolved_path}。请填写 CLI 的 .cmd/.exe 或可执行文件路径。"
            ),
            Some(agent_fix(
                "选择路径",
                "choose_file",
                Some(resolved_path.to_string()),
            )),
        ));
    }
    if !is_agent_executable_file(path) {
        return Some(agent_diagnostic(
            "not_executable",
            "error",
            format!("{} CLI 路径不可执行", provider.display_name()),
            format!("Typola 找到了文件，但它看起来不是可执行 CLI：{resolved_path}。Windows 下建议填写 .cmd 或 .exe。"),
            Some(agent_fix("选择路径", "choose_file", Some(resolved_path.to_string()))),
        ));
    }
    None
}

fn classify_spawn_error(
    provider: AgentProvider,
    agent_path: &str,
    raw_error: &str,
) -> AgentDiagnostic {
    let lower = raw_error.to_ascii_lowercase();
    let missing = lower.contains("not found")
        || lower.contains("no such file")
        || lower.contains("cannot find")
        || lower.contains("os error 2")
        || raw_error.contains("系统找不到指定的文件");
    if missing {
        let (code, title, detail) = if cfg!(target_os = "windows") && is_bare_command(agent_path) {
            (
                "windows_path_issue",
                format!("{} CLI 未在 Windows GUI PATH 中找到", provider.display_name()),
                format!("Typola 没能启动 `{agent_path}`。Windows 桌面应用的 PATH 可能和终端不同，请填写 npm 全局目录中的完整 .cmd 路径，或重新打开应用。原始错误：{raw_error}"),
            )
        } else {
            (
                "not_found",
                format!("{} CLI 未找到", provider.display_name()),
                format!("Typola 没能启动 `{agent_path}`。请先安装 CLI，或在设置里填写完整路径。原始错误：{raw_error}"),
            )
        };
        return agent_diagnostic(
            code,
            "error",
            title,
            detail,
            Some(agent_fix("重新检测", "rescan", None)),
        );
    }

    let denied = lower.contains("permission denied")
        || lower.contains("access is denied")
        || raw_error.contains("拒绝访问");
    if denied {
        return agent_diagnostic(
            "not_executable",
            "error",
            format!("{} CLI 无法执行", provider.display_name()),
            format!("Typola 找到了 `{agent_path}`，但系统拒绝执行。请检查文件权限，或改填 .cmd/.exe 路径。原始错误：{raw_error}"),
            Some(agent_fix("选择路径", "choose_file", Some(agent_path.to_string()))),
        );
    }

    agent_diagnostic(
        "unknown",
        "error",
        format!("{} CLI 检测失败", provider.display_name()),
        format!("Typola 检测 `{agent_path}` 时遇到未知错误：{raw_error}"),
        Some(agent_fix("重新检测", "rescan", None)),
    )
}

fn agent_diagnostic(
    code: impl Into<String>,
    level: impl Into<String>,
    title: impl Into<String>,
    detail: impl Into<String>,
    fix: Option<AgentDiagnosticFix>,
) -> AgentDiagnostic {
    AgentDiagnostic {
        code: code.into(),
        level: level.into(),
        title: title.into(),
        detail: detail.into(),
        fix,
    }
}

fn agent_fix(
    label: impl Into<String>,
    action: impl Into<String>,
    payload: Option<String>,
) -> AgentDiagnosticFix {
    AgentDiagnosticFix {
        label: label.into(),
        action: action.into(),
        payload,
    }
}

fn is_bare_command(value: &str) -> bool {
    let path = Path::new(value);
    path.parent()
        .map_or(true, |parent| parent.as_os_str().is_empty())
        && path.extension().is_none()
        && !value.contains('\\')
        && !value.contains('/')
}

fn read_preview(mut reader: impl Read) -> String {
    const MAX_PREVIEW_BYTES: usize = 64 * 1024;
    let mut bytes = Vec::with_capacity(MAX_PREVIEW_BYTES);
    let _ = reader
        .by_ref()
        .take(MAX_PREVIEW_BYTES as u64)
        .read_to_end(&mut bytes);
    String::from_utf8_lossy(&bytes).into_owned()
}

fn preview_text(value: &str) -> String {
    const MAX_PREVIEW_CHARS: usize = 800;
    let cleaned = value.replace('\0', "");
    let trimmed = cleaned.trim();
    if trimmed.chars().count() <= MAX_PREVIEW_CHARS {
        return trimmed.to_string();
    }
    let start = trimmed
        .char_indices()
        .rev()
        .nth(MAX_PREVIEW_CHARS - 1)
        .map(|(index, _)| index)
        .unwrap_or(0);
    trimmed[start..].to_string()
}

fn optional_preview(value: String) -> Option<String> {
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn display_command(agent_path: &str, args: &[String]) -> String {
    std::iter::once(agent_path.to_string())
        .chain(args.iter().cloned())
        .collect::<Vec<_>>()
        .join(" ")
}

fn detected_at_millis() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}

#[cfg(target_os = "windows")]
fn is_agent_executable_file(path: &Path) -> bool {
    path.extension()
        .and_then(OsStr::to_str)
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "cmd" | "exe" | "bat"
            )
        })
}

#[cfg(not(target_os = "windows"))]
fn is_agent_executable_file(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(path)
        .map(|metadata| metadata.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
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

// SkillHub：分类+skill 引用文件，存 Tauri app config dir
fn skill_hub_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("failed to resolve app config dir: {error}"))?
        .join("typola");
    std::fs::create_dir_all(&dir)
        .map_err(|error| format!("failed to create config dir: {error}"))?;
    Ok(dir.join("skill-hub.json"))
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SkillInfo {
    name: String,
    description: Option<String>,
    source: String,
    path: String,
}

// 解析 SKILL.md 的 YAML frontmatter 里的 description 字段。
// 简化版:只看 `description: <value>` 一行(支持单行引号字符串),不做完整 YAML。
// 失败返回 None,UI 仍按 name 展示。
fn parse_skill_md_description(content: &str) -> Option<String> {
    let trimmed = content.trim_start();
    let after_open = trimmed.strip_prefix("---")?;
    let close_idx = after_open.find("\n---")?;
    let yaml = &after_open[..close_idx];
    for line in yaml.lines() {
        let line = line.trim_start();
        if let Some(rest) = line.strip_prefix("description:") {
            let value = rest.trim();
            // 去引号
            let unquoted = if (value.starts_with('"') && value.ends_with('"') && value.len() >= 2)
                || (value.starts_with('\'') && value.ends_with('\'') && value.len() >= 2)
            {
                &value[1..value.len() - 1]
            } else {
                value
            };
            if !unquoted.is_empty() {
                return Some(unquoted.to_string());
            }
        }
    }
    None
}

#[tauri::command]
fn list_local_skills(
    app: tauri::AppHandle,
    provider: Option<AgentProvider>,
    workspace_root: Option<String>,
) -> Result<Vec<SkillInfo>, String> {
    match provider.unwrap_or_default() {
        AgentProvider::Claude => list_claude_skills(app),
        AgentProvider::Opencode => list_opencode_commands(app, workspace_root.as_deref()),
    }
}

fn list_claude_skills(app: tauri::AppHandle) -> Result<Vec<SkillInfo>, String> {
    let home = app
        .path()
        .home_dir()
        .map_err(|error| format!("failed to resolve home dir: {error}"))?;
    let skills_dir = home.join(".claude").join("skills");
    if !skills_dir.exists() {
        return Ok(Vec::new());
    }
    let entries = std::fs::read_dir(&skills_dir)
        .map_err(|error| format!("failed to read skills dir: {error}"))?;
    let mut skills = Vec::new();
    for entry in entries {
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(name) = path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|s| s.to_string())
        else {
            continue;
        };
        let skill_md = path.join("SKILL.md");
        let description = std::fs::read_to_string(&skill_md)
            .ok()
            .and_then(|c| parse_skill_md_description(&c));
        skills.push(SkillInfo {
            name: name.clone(),
            description,
            source: "claude".to_string(),
            path: path.to_string_lossy().to_string(),
        });
    }
    skills.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(skills)
}

fn list_opencode_commands(
    app: tauri::AppHandle,
    workspace_root: Option<&str>,
) -> Result<Vec<SkillInfo>, String> {
    let home = app
        .path()
        .home_dir()
        .map_err(|error| format!("failed to resolve home dir: {error}"))?;
    let mut commands = Vec::new();
    let global_config = home.join(".config").join("opencode");
    collect_opencode_command_dirs(&mut commands, &global_config);
    collect_opencode_config_commands(&mut commands, &global_config.join("opencode.jsonc"));

    if let Some(root) = workspace_root
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let project_config = PathBuf::from(root).join(".opencode");
        collect_opencode_command_dirs(&mut commands, &project_config);
        collect_opencode_config_commands(&mut commands, &project_config.join("opencode.jsonc"));
    }

    commands.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.path.cmp(&b.path)));
    commands.dedup_by(|a, b| a.name == b.name && a.path == b.path);
    Ok(commands)
}

fn collect_opencode_command_dirs(commands: &mut Vec<SkillInfo>, base: &Path) {
    for dir_name in ["commands", "command"] {
        let dir = base.join(dir_name);
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries {
            let Ok(entry) = entry else { continue };
            let path = entry.path();
            if !path.is_file() || path.extension().and_then(|ext| ext.to_str()) != Some("md") {
                continue;
            }
            let Some(name) = path
                .file_stem()
                .and_then(|stem| stem.to_str())
                .map(|value| value.to_string())
            else {
                continue;
            };
            let description = std::fs::read_to_string(&path).ok().and_then(|content| {
                parse_skill_md_description(&content).or_else(|| parse_markdown_heading(&content))
            });
            commands.push(SkillInfo {
                name,
                description,
                source: "opencode".to_string(),
                path: path.to_string_lossy().to_string(),
            });
        }
    }
}

fn parse_markdown_heading(content: &str) -> Option<String> {
    content
        .lines()
        .map(str::trim)
        .find_map(|line| line.strip_prefix("# ").map(str::trim))
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn collect_opencode_config_commands(commands: &mut Vec<SkillInfo>, config_path: &Path) {
    let Ok(raw) = std::fs::read_to_string(config_path) else {
        return;
    };
    let stripped = strip_jsonc_comments(&raw);
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&stripped) else {
        return;
    };
    let Some(command_map) = parsed.get("command").and_then(|value| value.as_object()) else {
        return;
    };
    for (name, value) in command_map {
        let description = value
            .as_object()
            .and_then(|object| object.get("description"))
            .and_then(|value| value.as_str())
            .filter(|value| !value.trim().is_empty())
            .map(|value| value.trim().to_string());
        commands.push(SkillInfo {
            name: name.to_string(),
            description,
            source: "opencode".to_string(),
            path: format!("{}#command.{}", config_path.to_string_lossy(), name),
        });
    }
}

fn strip_jsonc_comments(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    let mut in_string = false;
    let mut escaped = false;
    while let Some(ch) = chars.next() {
        if in_string {
            output.push(ch);
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_string = false;
            }
            continue;
        }
        if ch == '"' {
            in_string = true;
            output.push(ch);
            continue;
        }
        if ch == '/' && chars.peek() == Some(&'/') {
            chars.next();
            for next in chars.by_ref() {
                if next == '\n' {
                    output.push('\n');
                    break;
                }
            }
            continue;
        }
        if ch == '/' && chars.peek() == Some(&'*') {
            chars.next();
            let mut previous = '\0';
            for next in chars.by_ref() {
                if previous == '*' && next == '/' {
                    break;
                }
                previous = next;
            }
            continue;
        }
        output.push(ch);
    }
    output
}

#[tauri::command]
fn read_skill_hub(app: tauri::AppHandle) -> Result<String, String> {
    let path = skill_hub_file(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(content) => Ok(content),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(format!("failed to read skill hub: {error}")),
    }
}

#[tauri::command]
fn write_skill_hub(app: tauri::AppHandle, content: String) -> Result<(), String> {
    let path = skill_hub_file(&app)?;
    std::fs::write(&path, content).map_err(|error| format!("failed to write skill hub: {error}"))
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
            normalize_agent_path(AgentProvider::Claude, Some(" custom-claude ")),
            "custom-claude"
        );
    }

    #[test]
    fn agent_detect_reports_invalid_custom_path_without_spawn() {
        let missing = temp_path("missing-claude.cmd");
        let result = agent_detect(AgentDetectRequest {
            provider: Some(AgentProvider::Claude),
            agent_path: Some(missing.to_string_lossy().to_string()),
            runtime_id: None,
            custom_path: None,
            default_command: None,
            version_args: None,
        });

        assert!(!result.available);
        assert_eq!(result.runtime_id, AgentProvider::Claude);
        assert_eq!(result.diagnostics[0].code, "not_found");
        assert!(result.error.unwrap_or_default().contains("找不到"));
    }

    #[test]
    fn custom_bare_agent_command_skips_pre_spawn_path_validation() {
        let diagnostic = validate_agent_path_before_spawn(
            AgentProvider::Claude,
            Some("custom-claude"),
            "custom-claude",
        );

        assert!(diagnostic.is_none());
    }

    #[test]
    fn classify_spawn_error_handles_permission_denied() {
        let diagnostic = classify_spawn_error(AgentProvider::Claude, "claude.cmd", "拒绝访问。");

        assert_eq!(diagnostic.code, "not_executable");
        assert_eq!(
            diagnostic.fix.as_ref().map(|fix| fix.action.as_str()),
            Some("choose_file")
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn classify_spawn_error_handles_windows_path_lookup_miss() {
        let diagnostic = classify_spawn_error(
            AgentProvider::Opencode,
            "opencode",
            "系统找不到指定的文件。 (os error 2)",
        );

        assert_eq!(diagnostic.code, "windows_path_issue");
    }

    #[test]
    fn classify_spawn_error_falls_back_to_unknown() {
        let diagnostic =
            classify_spawn_error(AgentProvider::Claude, "claude", "something odd happened");

        assert_eq!(diagnostic.code, "unknown");
    }

    #[test]
    fn preview_text_truncates_on_char_boundary() {
        let input = format!("{}{}", "a".repeat(900), "😀");
        let preview = preview_text(&input);

        assert!(preview.chars().count() <= 800);
        assert!(preview.ends_with('😀'));
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn claude_path_defaults_to_path_lookup_on_non_windows() {
        assert_eq!(normalize_agent_path(AgentProvider::Claude, None), "claude");
        assert_eq!(
            normalize_agent_path(AgentProvider::Opencode, None),
            "opencode"
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn claude_path_checks_windows_npm_global_directory() {
        let path = normalize_agent_path(AgentProvider::Claude, None);

        assert!(
            path == "claude"
                || path.ends_with("\\npm\\claude.cmd")
                || path.ends_with("\\npm\\claude.exe")
                || path.ends_with("\\claude.cmd")
                || path.ends_with("\\claude.exe"),
            "unexpected default Claude path: {path}"
        );
        assert!(
            !path.ends_with(".ps1"),
            "Claude should not resolve to PowerShell wrapper: {path}"
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn opencode_path_checks_windows_npm_global_directory_without_ps1() {
        let path = normalize_agent_path(AgentProvider::Opencode, None);

        assert!(
            path == "opencode"
                || path.ends_with("\\npm\\opencode.cmd")
                || path.ends_with("\\npm\\opencode.exe")
                || path.ends_with("\\opencode.cmd")
                || path.ends_with("\\opencode.exe"),
            "unexpected default OpenCode path: {path}"
        );
        assert!(
            !path.ends_with(".ps1"),
            "OpenCode should not resolve to PowerShell wrapper: {path}"
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_cmd_wrapper_resolves_real_target() {
        let root = temp_path("opencode-wrapper");
        let bin_dir = root.join("node_modules").join("opencode-ai").join("bin");
        std::fs::create_dir_all(&bin_dir).unwrap();
        let target = bin_dir.join("opencode.exe");
        std::fs::write(&target, b"").unwrap();
        let wrapper = root.join("opencode.cmd");
        std::fs::write(
            &wrapper,
            "@ECHO off\r\n\"%dp0%\\node_modules\\opencode-ai\\bin\\opencode.exe\"   %*\r\n",
        )
        .unwrap();

        let resolved = resolve_windows_cmd_wrapper_target(&wrapper.to_string_lossy()).unwrap();

        assert_eq!(resolved, target);
        let _ = std::fs::remove_file(wrapper);
        let _ = std::fs::remove_file(target);
        let _ = std::fs::remove_dir_all(root);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_cmd_wrapper_does_not_resolve_node_runtime_only() {
        let root = temp_path("node-wrapper");
        let bin_dir = root.join("node_modules").join("example").join("bin");
        std::fs::create_dir_all(&bin_dir).unwrap();
        let node = root.join("node.exe");
        let script = bin_dir.join("example.js");
        std::fs::write(&node, b"").unwrap();
        std::fs::write(&script, b"").unwrap();
        let wrapper = root.join("example.cmd");
        std::fs::write(
            &wrapper,
            "@ECHO off\r\n\"%dp0%\\node.exe\" \"%dp0%\\node_modules\\example\\bin\\example.js\" %*\r\n",
        )
        .unwrap();

        assert!(resolve_windows_cmd_wrapper_target(&wrapper.to_string_lossy()).is_none());
        let _ = std::fs::remove_file(wrapper);
        let _ = std::fs::remove_file(script);
        let _ = std::fs::remove_file(node);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn claude_headless_args_use_text_stdin_and_stream_json_output() {
        let plugin_dirs = vec![
            "D:\\plugins\\one".to_string(),
            "D:\\plugins\\two".to_string(),
        ];
        let extra_allowed_dirs = vec!["D:\\workspace".to_string()];
        let args = build_claude_headless_args(
            "session-123",
            false,
            Some("sonnet"),
            &plugin_dirs,
            &extra_allowed_dirs,
        );

        assert!(args
            .windows(2)
            .any(|pair| pair == ["--input-format", "text"]));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--output-format", "stream-json"]));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--session-id", "session-123"]));
        assert!(args.windows(2).any(|pair| pair == ["--model", "sonnet"]));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--plugin-dir", "D:\\plugins\\one"]));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--plugin-dir", "D:\\plugins\\two"]));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--add-dir", "D:\\workspace"]));
        assert!(!args.contains(&"--resume".to_string()));
    }

    #[test]
    fn claude_headless_resume_args_reuse_session_uuid() {
        let args = build_claude_headless_args("session-123", true, None, &[], &[]);

        assert!(args
            .windows(2)
            .any(|pair| pair == ["--resume", "session-123"]));
        assert!(!args.contains(&"--session-id".to_string()));
    }

    #[test]
    fn opencode_headless_args_start_without_session_and_use_prompt_arg() {
        let args = build_opencode_headless_args(
            "session-123",
            false,
            Some("anthropic/claude-sonnet-4"),
            Some("D:\\workspace\\.typola-output\\conv-1"),
            &[],
            None,
            "summarize",
        );

        assert_eq!(args.first().map(String::as_str), Some("run"));
        assert!(args.windows(2).any(|pair| pair == ["--format", "json"]));
        assert!(!args.contains(&"--session".to_string()));
        assert!(!args.contains(&"session-123".to_string()));
        assert!(!args.contains(&"--continue".to_string()));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--model", "anthropic/claude-sonnet-4"]));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--dir", "D:\\workspace\\.typola-output\\conv-1"]));
        assert!(args.contains(&"--dangerously-skip-permissions".to_string()));
        assert_eq!(args.last().map(String::as_str), Some("summarize"));
    }

    #[test]
    fn opencode_headless_resume_uses_the_same_session_argument() {
        let args =
            build_opencode_headless_args("session-123", true, None, None, &[], None, "continue");

        assert!(args.contains(&"--continue".to_string()));
        assert!(!args.contains(&"--session".to_string()));
        assert!(!args.contains(&"session-123".to_string()));
        assert!(!args.contains(&"--resume".to_string()));
    }

    #[test]
    fn opencode_headless_args_attach_prompt_context_files() {
        let args = build_opencode_headless_args(
            "session-123",
            false,
            None,
            Some("D:\\workspace\\.typola-output\\conv-1"),
            &[
                "D:\\workspace\\current.md".to_string(),
                "D:\\workspace\\brief.md".to_string(),
            ],
            None,
            "summarize",
        );

        assert!(args
            .windows(2)
            .any(|pair| pair == ["--file", "D:\\workspace\\current.md"]));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--file", "D:\\workspace\\brief.md"]));
        let prompt_index = args
            .iter()
            .position(|arg| arg == "summarize")
            .expect("missing prompt");
        let first_file_index = args
            .iter()
            .position(|arg| arg == "--file")
            .expect("missing --file");
        assert!(prompt_index < first_file_index);
    }

    #[test]
    fn opencode_headless_args_use_command_flag_for_provider_commands() {
        let args = build_opencode_headless_args(
            "session-123",
            false,
            None,
            Some("D:\\workspace"),
            &[],
            Some("/write-report"),
            "use current doc",
        );

        assert!(args
            .windows(2)
            .any(|pair| pair == ["--command", "write-report"]));
        assert_eq!(args.last().map(String::as_str), Some("use current doc"));
    }

    #[test]
    fn agent_headless_command_keeps_claude_on_stdin_and_opencode_on_argv() {
        let claude = build_agent_headless_command(
            AgentProvider::Claude,
            "session-123",
            false,
            None,
            None,
            &[],
            &[],
            &[],
            None,
            "hello",
        );
        let opencode = build_agent_headless_command(
            AgentProvider::Opencode,
            "session-123",
            false,
            None,
            None,
            &[],
            &[],
            &[],
            None,
            "hello",
        );

        assert!(claude.prompt_stdin);
        assert!(!claude.args.contains(&"hello".to_string()));
        assert!(!opencode.prompt_stdin);
        assert_eq!(opencode.args.last().map(String::as_str), Some("hello"));
    }

    #[test]
    fn opencode_headless_command_uses_workspace_as_project_dir() {
        let opencode = build_agent_headless_command(
            AgentProvider::Opencode,
            "session-123",
            false,
            None,
            Some("D:\\workspace\\.typola-output\\conv-1"),
            &[],
            &["D:\\workspace".to_string()],
            &[],
            None,
            "hello",
        );

        assert!(opencode
            .args
            .windows(2)
            .any(|pair| pair == ["--dir", "D:\\workspace"]));
        assert!(!opencode
            .args
            .windows(2)
            .any(|pair| pair == ["--dir", "D:\\workspace\\.typola-output\\conv-1"]));
    }

    #[test]
    fn skill_md_frontmatter_description_basic() {
        let content = "---\nname: my-skill\ndescription: Writes polished docs.\n---\n\n# body\n";
        assert_eq!(
            parse_skill_md_description(content).as_deref(),
            Some("Writes polished docs.")
        );
    }

    #[test]
    fn skill_md_frontmatter_description_quoted() {
        let content = "---\ndescription: \"Multi line \\\"quoted\\\" skill\"\n---\n";
        assert_eq!(
            parse_skill_md_description(content).as_deref(),
            Some("Multi line \\\"quoted\\\" skill")
        );
    }

    #[test]
    fn skill_md_frontmatter_description_missing() {
        assert_eq!(
            parse_skill_md_description("# no frontmatter\n").is_none(),
            true
        );
        assert_eq!(
            parse_skill_md_description("---\nname: x\n---\n").is_none(),
            true
        );
    }

    #[test]
    fn opencode_command_dir_scanner_reads_markdown_commands() {
        let root = temp_path("opencode-commands");
        let commands_dir = root.join("commands");
        std::fs::create_dir_all(&commands_dir).unwrap();
        std::fs::write(commands_dir.join("write-report.md"), "# Write report\nBody").unwrap();

        let mut commands = Vec::new();
        collect_opencode_command_dirs(&mut commands, &root);

        assert_eq!(commands.len(), 1);
        assert_eq!(commands[0].name, "write-report");
        assert_eq!(commands[0].description.as_deref(), Some("Write report"));
        assert_eq!(commands[0].source, "opencode");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn opencode_config_scanner_reads_jsonc_commands() {
        let root = temp_path("opencode-config");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(
            root.join("opencode.jsonc"),
            "{\n  // comment\n  \"command\": { \"ship-it\": { \"description\": \"Ship changes\" } }\n}",
        )
        .unwrap();

        let mut commands = Vec::new();
        collect_opencode_config_commands(&mut commands, &root.join("opencode.jsonc"));

        assert_eq!(commands.len(), 1);
        assert_eq!(commands[0].name, "ship-it");
        assert_eq!(commands[0].description.as_deref(), Some("Ship changes"));
        assert_eq!(commands[0].source, "opencode");
        let _ = std::fs::remove_dir_all(&root);
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

    #[test]
    fn delete_artifact_file_removes_file_in_output_dir() {
        let workspace = temp_path("ws-delete-ok");
        let output_dir = workspace.join(".typola-output");
        std::fs::create_dir_all(&output_dir).unwrap();
        let artifact = output_dir.join("test.md");
        std::fs::write(&artifact, b"content").unwrap();

        let result = delete_artifact_file(DeleteArtifactRequest {
            path: artifact.to_string_lossy().to_string(),
            workspace_root: Some(workspace.to_string_lossy().to_string()),
        });

        assert!(result.is_ok());
        assert!(!artifact.exists());
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn delete_artifact_file_rejects_path_outside_output_dir() {
        let workspace = temp_path("ws-delete-reject");
        let output_dir = workspace.join(".typola-output");
        std::fs::create_dir_all(&output_dir).unwrap();
        let outside_file = workspace.join("important.md");
        std::fs::write(&outside_file, b"keep me").unwrap();

        let result = delete_artifact_file(DeleteArtifactRequest {
            path: outside_file.to_string_lossy().to_string(),
            workspace_root: Some(workspace.to_string_lossy().to_string()),
        });

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("outside .typola-output"));
        assert!(outside_file.exists());
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn delete_artifact_file_can_infer_output_dir_from_path() {
        let workspace = temp_path("ws-delete-infer");
        let output_dir = workspace.join(".typola-output").join("conv");
        std::fs::create_dir_all(&output_dir).unwrap();
        let artifact = output_dir.join("test.html");
        std::fs::write(&artifact, b"content").unwrap();

        let result = delete_artifact_file(DeleteArtifactRequest {
            path: artifact.to_string_lossy().to_string(),
            workspace_root: None,
        });

        assert!(result.is_ok());
        assert!(!artifact.exists());
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn delete_artifact_file_falls_back_when_workspace_changed() {
        let workspace = temp_path("ws-delete-old");
        let other_workspace = temp_path("ws-delete-new");
        let output_dir = workspace.join(".typola-output").join("conv");
        std::fs::create_dir_all(&output_dir).unwrap();
        std::fs::create_dir_all(other_workspace.join(".typola-output")).unwrap();
        let artifact = output_dir.join("test.md");
        std::fs::write(&artifact, b"content").unwrap();

        let result = delete_artifact_file(DeleteArtifactRequest {
            path: artifact.to_string_lossy().to_string(),
            workspace_root: Some(other_workspace.to_string_lossy().to_string()),
        });

        assert!(result.is_ok());
        assert!(!artifact.exists());
        let _ = std::fs::remove_dir_all(&workspace);
        let _ = std::fs::remove_dir_all(&other_workspace);
    }

    #[test]
    fn overwrite_artifact_to_document_creates_backup_and_undo_restores() {
        let workspace = temp_path("ws-overwrite-artifact");
        let output_dir = workspace.join(".typola-output").join("conv");
        std::fs::create_dir_all(&output_dir).unwrap();
        let artifact = output_dir.join("draft.md");
        let target = workspace.join("doc.md");
        let manifest = output_dir.join("artifact.json");
        std::fs::write(&artifact, b"new content").unwrap();
        std::fs::write(&target, b"old content").unwrap();
        std::fs::write(
            &manifest,
            r#"{"id":"a","primaryFile":"draft.md","actions":{}}"#,
        )
        .unwrap();

        overwrite_artifact_to_document(OverwriteArtifactRequest {
            artifact_path: artifact.to_string_lossy().to_string(),
            target_path: target.to_string_lossy().to_string(),
            workspace_root: Some(workspace.to_string_lossy().to_string()),
            expected_document_path: Some(target.to_string_lossy().to_string()),
        })
        .unwrap();

        assert_eq!(std::fs::read_to_string(&target).unwrap(), "new content");
        let manifest_text = std::fs::read_to_string(&manifest).unwrap();
        assert!(manifest_text.contains("backupPath"));

        undo_artifact_overwrite(OverwriteArtifactRequest {
            artifact_path: artifact.to_string_lossy().to_string(),
            target_path: target.to_string_lossy().to_string(),
            workspace_root: Some(workspace.to_string_lossy().to_string()),
            expected_document_path: Some(target.to_string_lossy().to_string()),
        })
        .unwrap();

        assert_eq!(std::fs::read_to_string(&target).unwrap(), "old content");
        let manifest_text = std::fs::read_to_string(&manifest).unwrap();
        assert!(!manifest_text.contains("backupPath"));
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn overwrite_artifact_to_document_rejects_target_outside_allowed_scope() {
        let workspace = temp_path("ws-overwrite-reject");
        let outside = temp_path("ws-overwrite-outside");
        let output_dir = workspace.join(".typola-output").join("conv");
        std::fs::create_dir_all(&output_dir).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        let artifact = output_dir.join("draft.md");
        let target = outside.join("doc.md");
        std::fs::write(&artifact, b"new content").unwrap();
        std::fs::write(&target, b"old content").unwrap();

        let result = overwrite_artifact_to_document(OverwriteArtifactRequest {
            artifact_path: artifact.to_string_lossy().to_string(),
            target_path: target.to_string_lossy().to_string(),
            workspace_root: Some(workspace.to_string_lossy().to_string()),
            expected_document_path: None,
        });

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("allowed document/workspace scope"));
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "old content");
        let _ = std::fs::remove_dir_all(&workspace);
        let _ = std::fs::remove_dir_all(&outside);
    }

    #[test]
    fn undo_artifact_overwrite_rejects_mismatched_target() {
        let workspace = temp_path("ws-undo-reject");
        let output_dir = workspace.join(".typola-output").join("conv");
        std::fs::create_dir_all(&output_dir).unwrap();
        let artifact = output_dir.join("draft.md");
        let target = workspace.join("doc.md");
        let other_target = workspace.join("other.md");
        let manifest = output_dir.join("artifact.json");
        std::fs::write(&artifact, b"new content").unwrap();
        std::fs::write(&target, b"old content").unwrap();
        std::fs::write(&other_target, b"other content").unwrap();
        std::fs::write(
            &manifest,
            r#"{"id":"a","primaryFile":"draft.md","actions":{}}"#,
        )
        .unwrap();

        overwrite_artifact_to_document(OverwriteArtifactRequest {
            artifact_path: artifact.to_string_lossy().to_string(),
            target_path: target.to_string_lossy().to_string(),
            workspace_root: Some(workspace.to_string_lossy().to_string()),
            expected_document_path: Some(target.to_string_lossy().to_string()),
        })
        .unwrap();

        let result = undo_artifact_overwrite(OverwriteArtifactRequest {
            artifact_path: artifact.to_string_lossy().to_string(),
            target_path: other_target.to_string_lossy().to_string(),
            workspace_root: Some(workspace.to_string_lossy().to_string()),
            expected_document_path: Some(other_target.to_string_lossy().to_string()),
        });

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("recorded overwrite target"));
        assert_eq!(
            std::fs::read_to_string(&other_target).unwrap(),
            "other content"
        );
        let _ = std::fs::remove_dir_all(&workspace);
    }
}
