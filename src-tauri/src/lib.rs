use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use encoding_rs::{GB18030, GBK};
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
use tauri_plugin_fs::FsExt;

mod export;

#[tauri::command]
fn set_title_bar_color(window: tauri::Window, red: u8, green: u8, blue: u8) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::Graphics::Dwm::{
            DwmSetWindowAttribute, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR,
        };

        let hwnd = window.hwnd().map_err(|error| error.to_string())?.0;
        let caption = u32::from(red) | (u32::from(green) << 8) | (u32::from(blue) << 16);
        let luminance = 0.2126 * f64::from(red) + 0.7152 * f64::from(green) + 0.0722 * f64::from(blue);
        let text: u32 = if luminance > 145.0 { 0x000000 } else { 0xFFFFFF };
        unsafe {
            let caption_result = DwmSetWindowAttribute(
                hwnd,
                DWMWA_CAPTION_COLOR as u32,
                (&caption as *const u32).cast(),
                std::mem::size_of::<u32>() as u32,
            );
            if caption_result < 0 {
                return Err(format!("DwmSetWindowAttribute caption failed: {caption_result}"));
            }
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_TEXT_COLOR as u32,
                (&text as *const u32).cast(),
                std::mem::size_of::<u32>() as u32,
            );
        }
    }
    #[cfg(not(target_os = "windows"))]
    let _ = (window, red, green, blue);
    Ok(())
}

#[cfg(target_os = "windows")]
pub mod windows_runtime {
    use std::{
        env,
        os::windows::process::CommandExt,
        path::{Path, PathBuf},
        process::Command,
    };

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    const WEBVIEW2_INSTALL_URL: &str = "https://developer.microsoft.com/microsoft-edge/webview2/";

    pub fn ensure_webview2_runtime() {
        if has_webview2_runtime() {
            return;
        }

        if let Some(setup) = find_webview2_setup() {
            show_webview2_installing_message();
            let _ = Command::new(&setup)
                .args(["/silent", "/install"])
                .creation_flags(CREATE_NO_WINDOW)
                .status();

            if has_webview2_runtime() {
                return;
            }
        }

        show_webview2_missing_message();
        let _ = Command::new("cmd")
            .args(["/C", "start", "", WEBVIEW2_INSTALL_URL])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
        std::process::exit(1);
    }

    fn has_webview2_runtime() -> bool {
        [
            (
                r"HKCU\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
                "pv",
            ),
            (
                r"HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
                "pv",
            ),
            (
                r"HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
                "pv",
            ),
        ]
        .iter()
        .any(|(key, value)| registry_value_exists(key, value))
    }

    /// 直接读注册表 API(进程内,微秒级),替代每次 spawn reg.exe(3 次串行约 150ms)。
    /// 兼容保留 reg.exe 路径:API 失败(权限等)时回退,确保检测永不漏报。
    fn registry_value_exists(key: &str, value: &str) -> bool {
        use windows_sys::Win32::System::Registry;
        use std::ffi::c_void;

        let (hive, subkey) = match key.split_once('\\') {
            Some(("HKCU", rest)) => (Registry::HKEY_CURRENT_USER, rest),
            Some(("HKLM", rest)) => (Registry::HKEY_LOCAL_MACHINE, rest),
            _ => return registry_value_exists_via_reg(key, value),
        };

        let mut hkey: *mut c_void = std::ptr::null_mut();
        // KEY_QUERY_VALUE 足够读 pv;WOW6432Node 由系统按视图解析,无需显式 KEY_WOW64_32KEY
        let open_result = unsafe {
            Registry::RegOpenKeyExW(hive, to_wide(subkey).as_ptr(), 0, Registry::KEY_QUERY_VALUE, &mut hkey)
        };
        if open_result != 0 {
            return registry_value_exists_via_reg(key, value);
        }
        let mut value_words = [0u16; 64];
        let mut value_size = (value_words.len() * 2) as u32;
        let mut value_type = 0;
        let query_result = unsafe {
            Registry::RegQueryValueExW(
                hkey,
                to_wide(value).as_ptr(),
                std::ptr::null_mut(),
                &mut value_type,
                value_words.as_mut_ptr().cast::<u8>(),
                &mut value_size,
            )
        };
        unsafe { Registry::RegCloseKey(hkey) };
        if query_result != 0 {
            return registry_value_exists_via_reg(key, value);
        }
        // pv 是 REG_SZ,按 UTF-16 解码后检查版本号非 0.0.0.0(与 reg.exe 输出判定一致)
        let readable_words = (value_size as usize / 2).min(value_words.len());
        let decoded = String::from_utf16_lossy(&value_words[..readable_words]);
        decoded.trim_end_matches('\0').split('.').any(|part| part != "0")
    }

    fn to_wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn registry_value_exists_via_reg(key: &str, value: &str) -> bool {
        Command::new("reg")
            .args(["query", key, "/v", value])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map(|output| {
                output.status.success()
                    && String::from_utf8_lossy(&output.stdout)
                        .lines()
                        .any(|line| line.contains(value) && !line.contains("0.0.0.0"))
            })
            .unwrap_or(false)
    }

    fn find_webview2_setup() -> Option<PathBuf> {
        let exe_dir = env::current_exe()
            .ok()
            .and_then(|path| path.parent().map(Path::to_path_buf));

        let mut candidates = Vec::new();
        if let Some(dir) = exe_dir {
            candidates.push(dir.join("MicrosoftEdgeWebview2Setup.exe"));
            candidates.push(dir.join("resources").join("MicrosoftEdgeWebview2Setup.exe"));
        }
        if let Ok(resource_dir) = env::var("TAURI_RESOURCE_DIR") {
            candidates.push(PathBuf::from(resource_dir).join("MicrosoftEdgeWebview2Setup.exe"));
        }

        candidates.into_iter().find(|path| path.is_file())
    }

    fn show_webview2_missing_message() {
        let message = concat!(
            "Typola needs Microsoft Edge WebView2 Runtime to start.\n\n",
            "Typola tried to install the bundled WebView2 bootstrapper, but the runtime is still unavailable.\n",
            "This usually means the computer is offline, the installer was blocked, or the installation failed.\n\n",
            "Please connect to the internet and install or repair Microsoft Edge WebView2 Runtime first, then launch Typola again.\n",
            "The official download page will be opened now."
        );
        let title = "Typola startup dependency missing";
        show_message_box(title, message, "Error");
    }

    fn show_webview2_installing_message() {
        let message = concat!(
            "Typola needs Microsoft Edge WebView2 Runtime to start.\n\n",
            "It is missing on this computer, so Typola will run the bundled Microsoft installer now.\n",
            "If the installer cannot download the runtime, Typola will show the official installation page."
        );
        let title = "Typola is preparing WebView2";
        show_message_box(title, message, "Information");
    }

    fn show_message_box(title: &str, message: &str, icon: &str) {
        let _ = Command::new("powershell")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &format!(
                    "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show({}, {}, 'OK', {}) | Out-Null",
                    powershell_quote(message),
                    powershell_quote(title),
                    powershell_quote(icon)
                ),
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }

    fn powershell_quote(value: &str) -> String {
        format!("'{}'", value.replace('\'', "''"))
    }
}

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

#[derive(Debug, Default, Deserialize)]
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
    Codex,
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
            Self::Codex => default_agent_command("codex"),
        }
    }

    fn detect_args(self) -> Vec<String> {
        match self {
            Self::Claude => vec!["--version".to_string()],
            Self::Opencode => vec!["--version".to_string()],
            Self::Codex => vec!["--version".to_string()],
        }
    }

    fn display_name(self) -> &'static str {
        match self {
            Self::Claude => "Claude",
            Self::Opencode => "OpenCode",
            Self::Codex => "Codex",
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentSessionStartRequest {
    provider: Option<AgentProvider>,
    conversation_id: String,
    session_uuid: Option<String>,
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
    /// 用户自定义落盘名（不含扩展名也可，扩展名强制沿用原文件）。
    target_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScanArtifactsRequest {
    output_root: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScannedArtifactFile {
    path: String,
    manifest_path: String,
    manifest_json: Option<String>,
    modified_at: Option<u128>,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WriteOpenedDocumentRequest {
    path: String,
    content: String,
    encoding: String,
    has_bom: bool,
    line_ending: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DocumentFingerprint {
    size: u64,
    modified_at: Option<u128>,
    hash: String,
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

/// 批量版:16ms 窗口内攒行合并 emit,stream-json 高频输出时把每行一次 IPC
/// 收敛为每帧一次(前端 onAgentStdout 拆回逐行,消费者不变)。
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AgentStdoutBatchPayload {
    run_id: String,
    conversation_id: String,
    session_uuid: String,
    lines: Vec<String>,
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

fn distribution_kind_for_executable(executable: &Path) -> &'static str {
    let is_portable = executable
        .parent()
        .map(|directory| directory.join(".typola-portable").is_file())
        .unwrap_or(false);
    if is_portable { "portable" } else { "installed" }
}

#[tauri::command]
fn get_distribution_kind() -> String {
    std::env::current_exe()
        .map(|path| distribution_kind_for_executable(&path).to_string())
        .unwrap_or_else(|_| "installed".to_string())
}

// 动态把目录加入 asset protocol scope:每次打开/另存文档时调,允许 webview 通过
// convertFileSrc() 读取该目录(递归)的本地图片。幂等;重复 allow 无害。
#[tauri::command]
fn allow_asset_directory(app: tauri::AppHandle, dir: String) -> Result<(), String> {
    app.asset_protocol_scope()
        .allow_directory(dir, true)
        .map_err(|error| format!("failed to allow asset directory: {error}"))
}

// 将用户当前工作区的产物目录动态加入 fs scope。工作区由用户显式选择，
// 目录内的候选稿、检视结果及 HTML 产物均需由 plugin-fs 读写。
#[tauri::command]
fn allow_fs_directory(app: tauri::AppHandle, dir: String) -> Result<(), String> {
    app.fs_scope()
        .allow_directory(&dir, true)
        .map_err(|error| format!("failed to allow html preview directory: {error}"))
}

// 用系统默认应用打开本地文件。绕开 tauri-plugin-opener 的 opener:scope,
// 因为它的 Scope::is_path_allowed 用 std::fs::canonicalize 把绝对路径变成
// \\?\D:\... 这种 Windows device path 形式,跟 capabilities 里声明的
// $HOME / $DESKTOP 等 glob 永远匹配不上。open crate 直接走 ShellExecuteW,
// 路径写法对与错都不影响。我们只对用户主动「在浏览器/系统默认打开」的本地
// 文件做这件事 — 这些路径都已经经过 plugin-fs 读取验证,不是用户输入。
#[tauri::command]
fn open_path_external(path: String) -> Result<(), String> {
    tauri_plugin_opener::open_path(&path, None::<&str>)
        .map_err(|error| format!("failed to open path externally: {error}"))
}

#[tauri::command]
async fn read_opened_document(path: String) -> Result<Vec<u8>, String> {
    // spawn_blocking:同步 fs 读挪出主线程(Tauri 2 同步命令占主线程,大文件会卡 UI)
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(path);
        if !is_openable_document_path(&path) {
            return Err("unsupported document type".into());
        }
        std::fs::read(&path).map_err(|error| format!("failed to read document: {error}"))
    })
    .await
    .map_err(|error| format!("read task failed: {error}"))?
}

fn document_hash(bytes: &[u8]) -> String {
    let mut hash = 14_695_981_039_346_656_037u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(1_099_511_628_211);
    }
    format!("{hash:016x}")
}

fn document_fingerprint(path: &Path) -> Result<DocumentFingerprint, String> {
    let metadata = std::fs::metadata(path)
        .map_err(|error| format!("failed to stat document: {error}"))?;
    let bytes = std::fs::read(path)
        .map_err(|error| format!("failed to read document for fingerprint: {error}"))?;
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis());
    Ok(DocumentFingerprint {
        size: metadata.len(),
        modified_at,
        hash: document_hash(&bytes),
    })
}

fn normalize_line_endings(content: &str, line_ending: &str) -> String {
    let normalized = content.replace("\r\n", "\n");
    if line_ending == "CRLF" {
        normalized.replace('\n', "\r\n")
    } else {
        normalized
    }
}

fn encode_document(request: &WriteOpenedDocumentRequest) -> Result<Vec<u8>, String> {
    let content = normalize_line_endings(&request.content, &request.line_ending);
    let (encoded, had_errors) = match request.encoding.as_str() {
        "UTF-8" => (content.as_bytes().to_vec(), false),
        "GBK" => {
            let (bytes, _, had_errors) = GBK.encode(&content);
            (bytes.into_owned(), had_errors)
        }
        "GB18030" => {
            let (bytes, _, had_errors) = GB18030.encode(&content);
            (bytes.into_owned(), had_errors)
        }
        other => return Err(format!("unsupported document encoding: {other}")),
    };
    if had_errors {
        return Err(format!("document contains characters not representable in {}", request.encoding));
    }

    if request.has_bom && request.encoding == "UTF-8" {
        let mut with_bom = Vec::with_capacity(encoded.len() + 3);
        with_bom.extend_from_slice(&[0xef, 0xbb, 0xbf]);
        with_bom.extend_from_slice(&encoded);
        return Ok(with_bom);
    }
    Ok(encoded)
}

fn atomic_replace_file(temp: &Path, target: &Path) -> std::io::Result<()> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{
            MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
        };
        let source: Vec<u16> = temp.as_os_str().encode_wide().chain(Some(0)).collect();
        let destination: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
        let result = unsafe {
            MoveFileExW(
                source.as_ptr(),
                destination.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        };
        if result == 0 {
            return Err(std::io::Error::last_os_error());
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        std::fs::rename(temp, target)
    }
}

/// rename 后同步父目录元数据，确保掉电场景下目录项持久化。
/// Windows 由 MoveFileExW 的 MOVEFILE_WRITE_THROUGH 保证，无需额外处理。
#[cfg(unix)]
fn sync_parent_directory(path: &Path) -> std::io::Result<()> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    std::fs::File::open(parent)?.sync_all()
}

#[cfg(not(unix))]
fn sync_parent_directory(_path: &Path) -> std::io::Result<()> {
    Ok(())
}

fn atomic_write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::fs::OpenOptions;

    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let file_name = path
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or("document");
    let mut temp_file = None;
    let mut temp_path = PathBuf::new();
    for attempt in 0..10 {
        temp_path = parent.join(format!(
            ".{file_name}.typola-{}-{attempt}.tmp",
            std::process::id()
        ));
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
        {
            Ok(file) => {
                temp_file = Some(file);
                break;
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        }
    }
    let mut file = temp_file.ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::AlreadyExists, "temporary document path is busy")
    })?;

    #[cfg(unix)]
    match std::fs::metadata(path) {
        Ok(metadata) => {
            use std::os::unix::fs::PermissionsExt;
            if let Err(error) = file.set_permissions(std::fs::Permissions::from_mode(
                metadata.permissions().mode(),
            )) {
                drop(file);
                let _ = std::fs::remove_file(&temp_path);
                return Err(error);
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            drop(file);
            let _ = std::fs::remove_file(&temp_path);
            return Err(error);
        }
    }

    let write_result = (|| {
        file.write_all(bytes)?;
        file.sync_all()
    })();
    drop(file);
    if let Err(error) = write_result {
        let _ = std::fs::remove_file(&temp_path);
        return Err(error);
    }

    let result = atomic_replace_file(&temp_path, path)
        .and_then(|()| sync_parent_directory(path));
    if result.is_err() {
        let _ = std::fs::remove_file(&temp_path);
    }
    result
}

#[tauri::command]
async fn stat_opened_document(path: String) -> Result<DocumentFingerprint, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(path);
        if !is_openable_document_path(&path) {
            return Err("unsupported document type".into());
        }
        document_fingerprint(&path)
    })
    .await
    .map_err(|error| format!("stat task failed: {error}"))?
}

#[tauri::command]
async fn write_opened_document(request: WriteOpenedDocumentRequest) -> Result<DocumentFingerprint, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(&request.path);
        if !is_writable_document_path(&path) {
            return Err("unsupported document type".into());
        }

        let bytes = encode_document(&request)?;
        atomic_write(&path, &bytes)
            .map_err(|error| format!("failed to atomically write document: {error}"))?;
        // 写后指纹:直接用刚写入的 bytes 算 hash+stat,不再整文件读回
        // (旧实现 document_fingerprint 会 fs::read 一遍刚写完的文件,大文档保存翻倍 IO)
        let metadata = std::fs::metadata(&path)
            .map_err(|error| format!("failed to stat document: {error}"))?;
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis());
        Ok(DocumentFingerprint {
            size: metadata.len(),
            modified_at,
            hash: document_hash(&bytes),
        })
    })
    .await
    .map_err(|error| format!("write task failed: {error}"))?
}

// v1:仅列目录下一层的 Markdown / HTML / Word 文档(flat,不递归,跳过隐藏文件 / node_modules / dist / target / .git 与子目录)。
// 与 list_directory_entries 同款过滤;仅支持单个目录,多目录由前端循环调用。
#[tauri::command]
fn read_first_level_openable(dir: String) -> Result<Vec<String>, String> {
    let root = PathBuf::from(dir);
    if !root.is_dir() {
        return Err("directory not found".into());
    }
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&root).map_err(|error| format!("failed to read directory: {error}"))? {
        let entry = entry.map_err(|error| format!("failed to read directory entry: {error}"))?;
        let path = entry.path();
        if path.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.')
            || matches!(name.as_str(), "node_modules" | "dist" | "target" | ".git")
        {
            continue;
        }
        if is_openable_document_path(&path) {
            out.push(path.to_string_lossy().to_string());
        }
    }
    out.sort();
    Ok(out)
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
async fn agent_detect(request: AgentDetectRequest) -> AgentDetectResult {
    // spawn_blocking:detect_agent_runtime 内含最长 5s 的 wait_timeout 子进程探测,
    // 绝不能占主线程(同步版会让整个 UI 冻住 5s)
    match tauri::async_runtime::spawn_blocking(move || detect_agent_runtime(request)).await {
        Ok(result) => result,
        Err(error) => {
            log::warn!("agent detect task failed: {error}");
            detect_agent_runtime(AgentDetectRequest::default())
        }
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
    let original_name = artifact_path
        .file_name()
        .and_then(OsStr::to_str)
        .ok_or_else(|| "invalid artifact file name".to_string())?;
    let file_name = match request.target_name.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(custom) => {
            // 清洗路径分隔符与非法字符,扩展名强制沿用原文件,防止用户改名改丢类型。
            let stem = custom
                .chars()
                .map(|ch| if "/\\:*?\"<>|".contains(ch) || ch.is_control() { '-' } else { ch })
                .collect::<String>()
                .trim()
                .trim_end_matches('.')
                .to_string();
            if stem.is_empty() {
                return Err("invalid target name".into());
            }
            let stem = stem.strip_suffix(&format!(".{}", artifact_path.extension().and_then(OsStr::to_str).unwrap_or(""))).unwrap_or(&stem).to_string();
            match artifact_path.extension().and_then(OsStr::to_str) {
                Some(ext) if !ext.is_empty() => format!("{stem}.{ext}"),
                _ => stem,
            }
        }
        None => original_name.to_string(),
    };
    let target = unique_file_path(&workspace_root, &file_name);
    std::fs::rename(&artifact_path, &target)
        .map_err(|error| format!("failed to archive artifact: {error}"))?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
async fn scan_artifacts(request: ScanArtifactsRequest) -> Result<Vec<ScannedArtifactFile>, String> {
    // spawn_blocking:递归扫盘(深度5)是纯 IO,挪出主线程避免卡 UI
    tauri::async_runtime::spawn_blocking(move || {
        let output_root = PathBuf::from(request.output_root);
        if !output_root.exists() {
            return Ok(Vec::new());
        }
        let output_root = canonical_output_dir(&output_root)?;
        let mut files = Vec::new();
        scan_artifact_files(&output_root, 0, &mut files)?;
        // 已归档制品的主文件已 move 到工作区,文件驱动扫描找不到,按 manifest 补回,
        // 让制品中心能保留「已归档」卡片(点击打开的是工作区里的新路径)。
        collect_archived_manifests(&output_root, 0, &mut files)?;
        Ok(files)
    })
    .await
    .map_err(|error| format!("scan task failed: {error}"))?
}

fn collect_archived_manifests(
    root: &Path,
    depth: usize,
    output: &mut Vec<ScannedArtifactFile>,
) -> Result<(), String> {
    if depth > 5 {
        return Ok(());
    }
    let manifest_path = root.join("artifact.json");
    if let Ok(json) = std::fs::read_to_string(&manifest_path) {
        let manifest_path_str = manifest_path.to_string_lossy().to_string();
        let already = output.iter().any(|file| file.manifest_path == manifest_path_str);
        if !already {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&json) {
                let archived = value.get("status").and_then(|s| s.as_str()) == Some("archived");
                let primary = value.get("primaryFile").and_then(|s| s.as_str());
                if archived {
                    if let Some(primary) = primary {
                        output.push(ScannedArtifactFile {
                            path: primary.to_string(),
                            manifest_path: manifest_path_str,
                            manifest_json: Some(json),
                            modified_at: None,
                        });
                    }
                }
            }
        }
    }
    let entries = std::fs::read_dir(root)
        .map_err(|error| format!("failed to read artifact directory: {error}"))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("failed to read artifact entry: {error}"))?;
        let path = entry.path();
        if path.is_dir() && path.file_name().and_then(OsStr::to_str) != Some("backups") {
            collect_archived_manifests(&path, depth + 1, output)?;
        }
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConversationOutputRequest {
    /// .typola-output 根目录（canonical 校验必须叫 .typola-output）。
    output_root: String,
    /// 会话目录名（conv-N）。仅允许单层目录名,防路径穿越。
    conversation_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConversationOutputStatus {
    exists: bool,
    artifact_count: usize,
    backup_count: usize,
}

/// 解析并校验 <output_root>/<conversation_id>,拒绝路径穿越与根目录外路径。
fn resolve_conversation_dir(request: &ConversationOutputRequest) -> Result<PathBuf, String> {
    let output_root = canonical_output_dir(Path::new(&request.output_root))?;
    let id = request.conversation_id.trim();
    if id.is_empty()
        || id.starts_with('.')
        || !id.chars().all(|ch: char| ch.is_alphanumeric() || ch == '-' || ch == '_')
    {
        return Err("invalid conversation id".into());
    }
    let dir = output_root.join(id);
    // 目录可能不存在（尚未生成任何制品）,无法 canonicalize 时用拼接路径做前缀校验。
    let canonical = dir.canonicalize().unwrap_or(dir);
    if !canonical.starts_with(&output_root) {
        return Err("refused: path is outside .typola-output directory".into());
    }
    Ok(canonical)
}

fn count_output_files(root: &Path, artifact_count: &mut usize, backup_count: &mut usize, in_backups: bool) {
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let is_backups = path.file_name().and_then(OsStr::to_str) == Some("backups");
            count_output_files(&path, artifact_count, backup_count, in_backups || is_backups);
        } else if path.is_file() {
            let name = path.file_name().and_then(OsStr::to_str).unwrap_or("");
            if name.eq_ignore_ascii_case("artifact.json") {
                continue;
            }
            if in_backups {
                *backup_count += 1;
            } else {
                *artifact_count += 1;
            }
        }
    }
}

#[tauri::command]
fn conversation_output_status(request: ConversationOutputRequest) -> Result<ConversationOutputStatus, String> {
    let dir = resolve_conversation_dir(&request)?;
    if !dir.is_dir() {
        return Ok(ConversationOutputStatus { exists: false, artifact_count: 0, backup_count: 0 });
    }
    let mut status = ConversationOutputStatus { exists: true, artifact_count: 0, backup_count: 0 };
    count_output_files(&dir, &mut status.artifact_count, &mut status.backup_count, false);
    Ok(status)
}

#[tauri::command]
fn cleanup_conversation_output(request: ConversationOutputRequest) -> Result<(), String> {
    let dir = resolve_conversation_dir(&request)?;
    if !dir.exists() {
        return Ok(());
    }
    // 删除前复查:目标必须仍是 .typola-output 下的单层会话目录。
    let canonical = dir
        .canonicalize()
        .map_err(|error| format!("failed to resolve conversation directory: {error}"))?;
    let parent = canonical
        .parent()
        .ok_or_else(|| "invalid conversation directory".to_string())?;
    if parent.file_name().and_then(OsStr::to_str) != Some(".typola-output") {
        return Err("refused: not a conversation output directory".into());
    }
    std::fs::remove_dir_all(&canonical)
        .map_err(|error| format!("failed to cleanup conversation output: {error}"))?;
    Ok(())
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

fn canonical_output_dir(output_root: &Path) -> Result<PathBuf, String> {
    let canonical = output_root
        .canonicalize()
        .map_err(|error| format!("failed to resolve .typola-output directory: {error}"))?;
    if canonical
        .file_name()
        .and_then(OsStr::to_str)
        .is_some_and(|name| name == ".typola-output")
    {
        return Ok(canonical);
    }
    Err("refused: artifact scan root must be a .typola-output directory".into())
}

fn is_artifact_candidate(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(OsStr::to_str) else {
        return false;
    };
    if name.eq_ignore_ascii_case("artifact.json") {
        return false;
    }
    let Some(extension) = path
        .extension()
        .and_then(OsStr::to_str)
        .map(|value| value.to_ascii_lowercase())
    else {
        return false;
    };
    matches!(
        extension.as_str(),
        "md" | "markdown"
            | "html"
            | "htm"
            | "txt"
            | "json"
            | "csv"
            | "tsv"
            | "png"
            | "jpg"
            | "jpeg"
            | "gif"
            | "webp"
            | "svg"
    )
}

fn system_time_millis(value: SystemTime) -> Option<u128> {
    value
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis())
}

fn scan_artifact_files(
    root: &Path,
    depth: usize,
    output: &mut Vec<ScannedArtifactFile>,
) -> Result<(), String> {
    if depth > 5 {
        return Ok(());
    }
    let entries = std::fs::read_dir(root)
        .map_err(|error| format!("failed to read artifact directory: {error}"))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("failed to read artifact entry: {error}"))?;
        let path = entry.path();
        if path.is_dir() {
            if path.file_name().and_then(OsStr::to_str) == Some("backups") {
                continue;
            }
            scan_artifact_files(&path, depth + 1, output)?;
            continue;
        }
        if !path.is_file() || !is_artifact_candidate(&path) {
            continue;
        }
        let parent = path
            .parent()
            .ok_or_else(|| "invalid artifact parent".to_string())?;
        let manifest_path = parent.join("artifact.json");
        let manifest_json = std::fs::read_to_string(&manifest_path).ok();
        let modified_at = std::fs::metadata(&path)
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .and_then(system_time_millis);
        output.push(ScannedArtifactFile {
            path: path.to_string_lossy().to_string(),
            manifest_path: manifest_path.to_string_lossy().to_string(),
            manifest_json,
            modified_at,
        });
    }
    Ok(())
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

// Issue #283:工作区文件树右键「删除」—— 永久删除(remove_file / remove_dir_all)。
// 安全边界:目标必须 canonicalize 后位于工作区根目录内,且不等于根目录本身,
// 拦下 `..`、符号链接逃逸与误删整个工作区。
#[derive(Debug, Deserialize)]
struct DeleteWorkspaceEntryRequest {
    path: String,
    workspace_root: String,
}

#[tauri::command]
fn delete_workspace_entry(request: DeleteWorkspaceEntryRequest) -> Result<(), String> {
    let target = PathBuf::from(&request.path);
    let root = PathBuf::from(&request.workspace_root);
    if !root.is_dir() {
        return Err("workspace root is not a directory".into());
    }
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("failed to resolve workspace root: {error}"))?;
    // PR #284 review:符号链接(含 Windows junction)只删除链接本身 —— canonicalize 会把
    // 链接解析成真实目标,直接对解析结果 remove_dir_all 会清空目标目录而留下断链;
    // 因此用 symlink_metadata(不 follow)区分链接,边界校验基于「链接所在目录规范化
    // + 文件名」的未解析组合,删除也作用于该未解析路径而非 canonicalize 结果。
    let metadata = std::fs::symlink_metadata(&target)
        .map_err(|error| format!("failed to resolve path: {error}"))?;
    let file_type = metadata.file_type();
    let target_name = target
        .file_name()
        .ok_or_else(|| "refusing to delete the workspace root".to_string())?
        .to_owned();
    let canonical_parent = target
        .parent()
        .ok_or_else(|| "refusing to delete the workspace root".to_string())?
        .canonicalize()
        .map_err(|error| format!("failed to resolve parent directory: {error}"))?;
    let unresolved_target = canonical_parent.join(&target_name);
    if unresolved_target == canonical_root {
        return Err("refusing to delete the workspace root".into());
    }
    if !unresolved_target.starts_with(&canonical_root) {
        return Err("path is outside the workspace".into());
    }
    if file_type.is_symlink() {
        // 只删除链接本身,目标内容不动。remove_file 对 unix symlink 与 Windows
        // 文件类 symlink 生效;Windows junction 是目录类 reparse point,需要
        // remove_dir 才能只移除链接(两者都不递归进真实目标)。
        std::fs::remove_file(&unresolved_target)
            .or_else(|_| std::fs::remove_dir(&unresolved_target))
            .map_err(|error| format!("failed to delete symlink: {error}"))
    } else if file_type.is_dir() {
        std::fs::remove_dir_all(&unresolved_target)
            .map_err(|error| format!("failed to delete folder: {error}"))
    } else if file_type.is_file() {
        std::fs::remove_file(&unresolved_target)
            .map_err(|error| format!("failed to delete file: {error}"))
    } else {
        Err("workspace entry not found".into())
    }
}

// PR #284 review:「用 Typola 打开」的目录分流不能按扩展名反推 —— 名为 notes.md 的
// 目录会被前端误判为文档而走打开文档失败。前端用真实文件系统元数据判断。
#[derive(Debug, Deserialize)]
struct PathIsDirectoryRequest {
    path: String,
}

#[tauri::command]
fn path_is_directory(request: PathIsDirectoryRequest) -> Result<bool, String> {
    Ok(PathBuf::from(&request.path).is_dir())
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
async fn list_directory_entries(
    request: DirectoryListRequest,
) -> Result<Vec<DirectoryEntryPayload>, String> {
    tauri::async_runtime::spawn_blocking(move || {
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
    })
    .await
    .map_err(|error| format!("list task failed: {error}"))?
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
    // 防抖:atomic_write 的 temp 写入+rename+目录 sync 会在极短时间内触发
    // modify(rename)+modify(rename) 连发,前端每个事件都要 stat+指纹比对;
    // 120ms 合并窗口把连发收敛为一次 emit(前端 stat 时文件已是最终态)。
    let pending = std::sync::Arc::new(std::sync::Mutex::new(None::<std::time::Instant>));
    let pending_for_cb = pending.clone();
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
            // 已有待发事件则跳过(窗口内合并);否则登记时间并在 120ms 后发出
            let mut slot = match pending_for_cb.lock() {
                Ok(slot) => slot,
                Err(_) => return,
            };
            if slot.is_some() {
                return;
            }
            *slot = Some(std::time::Instant::now());
            drop(slot);
            let app = emit_app.clone();
            let path = emit_path.clone();
            let pending = pending_for_cb.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(120));
                if let Ok(mut slot) = pending.lock() {
                    *slot = None;
                }
                let _ = app.emit(
                    "file-changed",
                    FileChangedPayload {
                        path: path.clone(),
                    },
                );
            });
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

/// 变更事件是否应上报:必须在监听根内,且根的相对路径部分不命中忽略规则。
/// 忽略规则只作用于「根以内」的路径——监听根本身可以是点开头目录
/// (.typola-output 制品目录兜底监听),对绝对路径整体判 ignore 会把根下所有事件全部滤掉。
fn is_visible_workspace_change(candidate: &Path, root: &Path) -> bool {
    if !candidate.starts_with(root) {
        return false;
    }
    let relative = candidate.strip_prefix(root).unwrap_or(candidate);
    !should_ignore_workspace_path(relative)
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
                .filter(|candidate| is_visible_workspace_change(candidate, &root_for_filter))
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
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
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
            set_title_bar_color,
            pending_opened_paths,
            force_close_main_window,
            get_distribution_kind,
            allow_asset_directory,
            allow_fs_directory,
            open_path_external,
            read_first_level_openable,
            read_opened_document,
            stat_opened_document,
            write_opened_document,
            rename_opened_document,
            archive_artifact_to_workspace,
            scan_artifacts,
            conversation_output_status,
            cleanup_conversation_output,
            overwrite_artifact_to_document,
            undo_artifact_overwrite,
            delete_artifact_file,
            delete_workspace_entry,
            path_is_directory,
            write_attachment_file,
            process_inserted_image,
            upload_image_via_command,
            export::export_pdf_file,
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
    // Issue #283:目录也放行 —— Explorer「用 Typola 打开」文件夹时前端以工作区方式打开。
    if !is_openable_document_path(&path) && !path.is_dir() {
        return None;
    }

    path.into_os_string().into_string().ok()
}

fn watch_path_key(path: &Path) -> String {
    let resolved = path
        .canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .to_string();
    // canonicalize 在 Windows 上返回 \\?\ verbatim 前缀路径,前端按普通路径做
    // 前缀匹配会全部落空(制品 watcher 静默失效的根因之一),统一剥掉。
    resolved
        .strip_prefix(r"\\?\")
        .map(str::to_string)
        .unwrap_or(resolved)
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

// `stream_json_stdin` used to mean "keep stdin open and feed stream-json
// user/tool_result messages mid-turn". That transport was retired with the
// submit_tool_result command (PR #128) — we now feed tool results through
// the structured chat surface and Claude naturally ends its turn when no
// mid-turn tool callback is available. The field is preserved (rather
// than deleted) so existing call sites compile, but the semantic is now
// "does this provider emit stream-json output" rather than anything about
// stdin. New call sites should treat the field as output-format only.
struct AgentCommandSpec {
    args: Vec<String>,
    prompt_stdin: bool,
    // No production reads after the stdin transport was retired; kept for
    // API stability and consumed by tests. Safe to remove in a follow-up.
    #[allow(dead_code)]
    stream_json_stdin: bool,
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

fn resolve_agent_session(
    registry: &mut AgentHeadlessRegistry,
    conversation_id: &str,
    requested_session_uuid: Option<&str>,
    prefer_resume: bool,
) -> (String, bool) {
    let existing = registry.sessions.get(conversation_id).cloned().or_else(|| {
        requested_session_uuid
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    });
    if prefer_resume {
        if let Some(session_uuid) = existing {
            registry
                .sessions
                .insert(conversation_id.to_string(), session_uuid.clone());
            return (session_uuid, true);
        }
    }
    let session_uuid = uuid::Uuid::new_v4().to_string();
    registry
        .sessions
        .insert(conversation_id.to_string(), session_uuid.clone());
    (session_uuid, false)
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
    if provider == AgentProvider::Codex {
        return Err("Codex CLI 当前仅用于检测，暂不支持 AI 工作台发送。".into());
    }
    let agent_path = normalize_agent_path(provider, request.agent_path.as_deref());
    let run_id = uuid::Uuid::new_v4().to_string();
    let (session_uuid, resumed) = {
        let mut registry = state
            .0
            .lock()
            .map_err(|_| "agent headless store poisoned".to_string())?;
        resolve_agent_session(
            &mut registry,
            conversation_id,
            request.session_uuid.as_deref(),
            prefer_resume,
        )
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

    // Stdin is single-shot: we hand the initial prompt (plain text, regardless
    // of whether output uses stream-json) and close it. Mid-turn tool
    // callbacks used to be written here too; submit_tool_result was removed in
    // PR #128 so the long-lived Arc<Mutex<Option<ChildStdin>>> chain is no
    // longer needed.
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
    // Claude is invoked in headless mode with stream-json output and a
    // single-shot plain-text stdin prompt. The mid-turn tool_use path used to
    // keep stdin open and stream JSON user/tool_result messages back into the
    // process; that wiring was removed (PR #128 dropped submit_tool_result)
    // because we now feed tool results through the structured chat surface
    // instead. `--input-format text` is the CLI default, so the flag is
    // omitted entirely.
    let mut args = vec![
        "-p".to_string(),
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
        "--permission-mode".to_string(),
        "bypassPermissions".to_string(),
        "--disallowedTools".to_string(),
        "AskUserQuestion".to_string(),
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
            // See AgentCommandSpec doc: now means "Claude emits stream-json
            // output" (the stdin half of the old semantic is gone).
            stream_json_stdin: true,
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
            stream_json_stdin: false,
        },
        AgentProvider::Codex => AgentCommandSpec {
            args: Vec::new(),
            prompt_stdin: true,
            stream_json_stdin: false,
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
        let mut batch: Vec<String> = Vec::new();
        let mut last_flush = std::time::Instant::now();
        for line in reader.lines() {
            let Ok(line) = line else { break };
            batch.push(line);
            // 16ms(一帧)或 64 行即刷:交互延迟无感,IPC 次数收敛 10-100x
            if batch.len() >= 64 || last_flush.elapsed() >= std::time::Duration::from_millis(16) {
                let _ = app.emit(
                    "agent-stdout",
                    AgentStdoutBatchPayload {
                        run_id: run_id.clone(),
                        conversation_id: conversation_id.clone(),
                        session_uuid: session_uuid.clone(),
                        lines: std::mem::take(&mut batch),
                    },
                );
                last_flush = std::time::Instant::now();
            }
        }
        if !batch.is_empty() {
            let _ = app.emit(
                "agent-stdout",
                AgentStdoutBatchPayload {
                    run_id,
                    conversation_id,
                    session_uuid,
                    lines: batch,
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
        AgentProvider::Codex => Ok(Vec::new()),
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

        let bytes = tauri::async_runtime::block_on(read_opened_document(path.to_string_lossy().to_string())).unwrap();

        assert_eq!(bytes, b"# opened");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn distribution_kind_uses_portable_marker_next_to_executable() {
        let directory = temp_path("portable-distribution");
        std::fs::create_dir_all(&directory).unwrap();
        let executable = directory.join("Typola.exe");

        assert_eq!(distribution_kind_for_executable(&executable), "installed");
        std::fs::write(directory.join(".typola-portable"), b"2.0.5\n").unwrap();
        assert_eq!(distribution_kind_for_executable(&executable), "portable");

        let _ = std::fs::remove_dir_all(directory);
    }

    #[test]
    fn read_opened_document_rejects_unsupported_extensions() {
        let path = temp_path("secret.txt");
        std::fs::write(&path, b"secret").unwrap();

        let error = tauri::async_runtime::block_on(read_opened_document(path.to_string_lossy().to_string())).unwrap_err();

        assert!(error.contains("unsupported document type"));
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn write_opened_document_writes_supported_text_documents() {
        let path = temp_path("saved.html");
        std::fs::write(&path, b"before").unwrap();

        tauri::async_runtime::block_on(write_opened_document(WriteOpenedDocumentRequest {
            path: path.to_string_lossy().to_string(),
            content: "<h1>after</h1>".into(),
            encoding: "UTF-8".into(),
            has_bom: false,
            line_ending: "LF".into(),
        }))
        .unwrap();

        assert_eq!(std::fs::read_to_string(&path).unwrap(), "<h1>after</h1>");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn write_opened_document_rejects_docx() {
        let path = temp_path("saved.docx");
        std::fs::write(&path, b"before").unwrap();

        let error = tauri::async_runtime::block_on(write_opened_document(WriteOpenedDocumentRequest {
            path: path.to_string_lossy().to_string(),
            content: "after".into(),
            encoding: "UTF-8".into(),
            has_bom: false,
            line_ending: "LF".into(),
        }))
        .unwrap_err();

        assert!(error.contains("unsupported document type"));
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn write_opened_document_preserves_encoding_bom_and_line_endings() {
        for encoding in ["GBK", "GB18030"] {
            let path = temp_path(&format!("saved-{encoding}.md"));
            tauri::async_runtime::block_on(write_opened_document(WriteOpenedDocumentRequest {
                path: path.to_string_lossy().to_string(),
                content: "中文\n第二行".into(),
                encoding: encoding.into(),
                has_bom: false,
                line_ending: "CRLF".into(),
            }))
            .unwrap();

            let bytes = std::fs::read(&path).unwrap();
            let decoded = if encoding == "GBK" {
                GBK.decode(&bytes).0.into_owned()
            } else {
                GB18030.decode(&bytes).0.into_owned()
            };
            assert_eq!(decoded, "中文\r\n第二行");
            let _ = std::fs::remove_file(path);
        }

        let path = temp_path("saved-bom.md");
        tauri::async_runtime::block_on(write_opened_document(WriteOpenedDocumentRequest {
            path: path.to_string_lossy().to_string(),
            content: "第一行\n第二行".into(),
            encoding: "UTF-8".into(),
            has_bom: true,
            line_ending: "CRLF".into(),
        }))
        .unwrap();
        let bytes = std::fs::read(&path).unwrap();
        assert_eq!(&bytes[..3], &[0xef, 0xbb, 0xbf]);
        assert_eq!(String::from_utf8(bytes[3..].to_vec()).unwrap(), "第一行\r\n第二行");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn atomic_write_failure_keeps_existing_target_unchanged() {
        let root = tempfile::tempdir().unwrap();
        let target = root.path().join("document.md");
        std::fs::create_dir(&target).unwrap();
        let result = atomic_write(&target, b"new content");
        assert!(result.is_err());
        assert!(target.is_dir());
        assert!(!root
            .path()
            .read_dir()
            .unwrap()
            .any(|entry| entry.unwrap().file_name().to_string_lossy().contains("typola-")));
    }

    #[cfg(unix)]
    #[test]
    fn atomic_write_preserves_existing_unix_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let root = tempfile::tempdir().unwrap();
        let target = root.path().join("private.md");
        std::fs::write(&target, b"before").unwrap();
        std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o600)).unwrap();

        atomic_write(&target, b"after").unwrap();

        let mode = std::fs::metadata(&target).unwrap().permissions().mode() & 0o7777;
        assert_eq!(mode, 0o600);
        assert_eq!(std::fs::read(&target).unwrap(), b"after");
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
        let result = tauri::async_runtime::block_on(agent_detect(AgentDetectRequest {
            provider: Some(AgentProvider::Claude),
            agent_path: Some(missing.to_string_lossy().to_string()),
            runtime_id: None,
            custom_path: None,
            default_command: None,
            version_args: None,
        }));

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
    fn claude_headless_args_use_stream_json_output_and_text_stdin() {
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

        // Mid-turn stream-json stdin transport was removed with submit_tool_result
        // (PR #128), so --input-format is no longer pinned here. Text is the CLI
        // default and we hand the prompt in as a single write.
        assert!(!args.contains(&"--input-format".to_string()));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--output-format", "stream-json"]));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--disallowedTools", "AskUserQuestion"]));
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
    fn restored_conversation_reuses_persisted_session_uuid() {
        let mut registry = AgentHeadlessRegistry::default();

        let (session_uuid, resumed) =
            resolve_agent_session(&mut registry, "conv-7", Some("session-7"), true);

        assert_eq!(session_uuid, "session-7");
        assert!(resumed);
        assert_eq!(
            registry.sessions.get("conv-7").map(String::as_str),
            Some("session-7")
        );
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
    fn agent_headless_command_uses_stream_json_output_for_claude_and_argv_for_opencode() {
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

        // Claude still consumes the prompt via stdin, but as plain text in a
        // single write. stream_json_stdin now signals "stream-json output
        // format" (see AgentCommandSpec doc); it is no longer about stdin
        // transport.
        assert!(claude.prompt_stdin);
        assert!(claude.stream_json_stdin);
        assert!(!claude.args.contains(&"hello".to_string()));
        assert!(!claude.args.contains(&"--input-format".to_string()));
        assert!(!opencode.prompt_stdin);
        assert!(!opencode.stream_json_stdin);
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

    // Issue #283:「用 Typola 打开」文件夹 —— argv 中的真实目录被保留,前端分流为工作区;
    // 无扩展名的普通文件仍被过滤。
    #[test]
    fn opened_paths_from_args_keeps_directories() {
        let cwd = std::env::temp_dir();
        let paths = opened_paths_from_args(
            vec![
                "typola.exe".into(),
                cwd.to_string_lossy().to_string(),
                cwd.join("plain-no-ext").to_string_lossy().to_string(),
            ],
            cwd.to_string_lossy().as_ref(),
        );

        assert_eq!(paths.len(), 1);
        assert!(paths.iter().any(|path| *path == cwd.to_string_lossy().to_string()));
    }

    // PR #284 review 回归:delete_workspace_entry 的安全边界。
    #[test]
    fn delete_workspace_entry_removes_file_inside_workspace() {
        let workspace = temp_path("ws-entry-file");
        std::fs::create_dir_all(&workspace).unwrap();
        let file = workspace.join("note.md");
        std::fs::write(&file, b"content").unwrap();

        delete_workspace_entry(DeleteWorkspaceEntryRequest {
            path: file.to_string_lossy().to_string(),
            workspace_root: workspace.to_string_lossy().to_string(),
        })
        .unwrap();

        assert!(!file.exists());
        assert!(workspace.exists());
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn delete_workspace_entry_rejects_target_outside_workspace() {
        let workspace = temp_path("ws-entry-inside");
        let outside = temp_path("ws-entry-outside-file");
        std::fs::create_dir_all(&workspace).unwrap();
        std::fs::write(&outside, b"keep").unwrap();

        let result = delete_workspace_entry(DeleteWorkspaceEntryRequest {
            path: outside.to_string_lossy().to_string(),
            workspace_root: workspace.to_string_lossy().to_string(),
        });

        assert!(result.is_err());
        assert!(outside.exists());
        let _ = std::fs::remove_dir_all(&workspace);
        let _ = std::fs::remove_file(&outside);
    }

    #[test]
    fn delete_workspace_entry_refuses_workspace_root() {
        let workspace = temp_path("ws-entry-root");
        std::fs::create_dir_all(&workspace).unwrap();

        let result = delete_workspace_entry(DeleteWorkspaceEntryRequest {
            path: workspace.to_string_lossy().to_string(),
            workspace_root: workspace.to_string_lossy().to_string(),
        });

        assert_eq!(result.unwrap_err(), "refusing to delete the workspace root");
        assert!(workspace.exists());
        let _ = std::fs::remove_dir_all(&workspace);
    }

    // PR #284 review 回归:删除符号链接只删除链接本身,目标目录内容必须原样保留。
    // Windows 用 junction(无需特权,同为 reparse point),unix 用 symlink_dir。
    #[test]
    fn delete_workspace_entry_removes_only_the_link_not_its_target() {
        let workspace = temp_path("ws-entry-link");
        let real_dir = workspace.join("real");
        std::fs::create_dir_all(&real_dir).unwrap();
        std::fs::write(real_dir.join("keep.md"), b"must survive").unwrap();
        let link = workspace.join("alias");

        #[cfg(unix)]
        std::os::unix::fs::symlink(&real_dir, &link).unwrap();
        #[cfg(windows)]
        {
            let output = std::process::Command::new("cmd")
                .args([
                    "/C",
                    "mklink",
                    "/J",
                    &link.to_string_lossy().to_string(),
                    &real_dir.to_string_lossy().to_string(),
                ])
                .output()
                .expect("failed to spawn cmd for mklink /J");
            assert!(
                output.status.success(),
                "mklink /J failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }

        delete_workspace_entry(DeleteWorkspaceEntryRequest {
            path: link.to_string_lossy().to_string(),
            workspace_root: workspace.to_string_lossy().to_string(),
        })
        .unwrap();

        assert!(!link.exists(), "链接本身应被删除");
        assert!(real_dir.is_dir(), "真实目标目录必须保留");
        assert!(
            real_dir.join("keep.md").exists(),
            "目标目录内容必须原样保留,不得递归删除"
        );
        let _ = std::fs::remove_dir_all(&workspace);
    }

    // PR #284 review 回归:path_is_directory 用真实元数据判断,供目录分流。
    #[test]
    fn path_is_directory_matches_real_metadata() {
        let workspace = temp_path("ws-entry-isdir");
        std::fs::create_dir_all(&workspace).unwrap();
        let file = workspace.join("note.md");
        std::fs::write(&file, b"content").unwrap();
        let md_named_dir = workspace.join("notes.md");
        std::fs::create_dir_all(&md_named_dir).unwrap();

        let check = |path: &Path| {
            path_is_directory(PathIsDirectoryRequest {
                path: path.to_string_lossy().to_string(),
            })
            .unwrap()
        };

        assert!(check(&workspace));
        assert!(check(&md_named_dir), "带 .md 扩展名的目录也必须识别为目录");
        assert!(!check(&file));
        assert!(!check(&workspace.join("missing.md")));

        let _ = std::fs::remove_dir_all(&workspace);
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
    fn scan_artifacts_reads_files_under_output_dir() {
        let workspace = temp_path("ws-scan-artifacts");
        let output_dir = workspace.join(".typola-output").join("conv");
        std::fs::create_dir_all(&output_dir).unwrap();
        let artifact = output_dir.join("draft.md");
        let manifest = output_dir.join("artifact.json");
        std::fs::write(&artifact, b"content").unwrap();
        std::fs::write(&manifest, r#"{"id":"a","title":"Draft","kind":"markdown","status":"done","primaryFile":"draft.md","createdAt":"2026-06-27T00:00:00.000Z","source":{"type":"unknown"}}"#).unwrap();

        let result = tauri::async_runtime::block_on(scan_artifacts(ScanArtifactsRequest {
            output_root: workspace
                .join(".typola-output")
                .to_string_lossy()
                .to_string(),
        }))
        .unwrap();

        assert_eq!(result.len(), 1);
        assert!(PathBuf::from(&result[0].path)
            .ends_with(Path::new(".typola-output").join("conv").join("draft.md")));
        assert!(PathBuf::from(&result[0].manifest_path).ends_with(
            Path::new(".typola-output")
                .join("conv")
                .join("artifact.json")
        ));
        assert!(result[0]
            .manifest_json
            .as_deref()
            .unwrap_or("")
            .contains("\"Draft\""));
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn scan_artifacts_rejects_non_output_root() {
        let workspace = temp_path("ws-scan-reject");
        std::fs::create_dir_all(&workspace).unwrap();

        let result = tauri::async_runtime::block_on(scan_artifacts(ScanArtifactsRequest {
            output_root: workspace.to_string_lossy().to_string(),
        }));

        assert!(result.is_err());
        assert!(result.unwrap_err().contains(".typola-output"));
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

    fn tempdir() -> std::io::Result<tempfile::TempDir> {
        tempfile::tempdir()
    }

    #[test]
    fn read_first_level_openable_skips_node_modules_and_hidden_dirs() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        std::fs::write(root.join("note.md"), b"# hello").unwrap();
        std::fs::create_dir(root.join("node_modules")).unwrap();
        std::fs::write(root.join("node_modules").join("nested.md"), b"x").unwrap();
        std::fs::create_dir(root.join("dist")).unwrap();
        std::fs::write(root.join("dist").join("artifact.md"), b"x").unwrap();
        std::fs::create_dir(root.join(".git")).unwrap();
        std::fs::write(root.join(".hidden.md"), b"x").unwrap();
        std::fs::write(root.join("secret.txt"), b"x").unwrap();

        let mut paths = read_first_level_openable(root.to_string_lossy().to_string()).unwrap();
        paths.sort();
        assert_eq!(paths, vec![root.join("note.md").to_string_lossy().to_string()]);
    }

    #[test]
    fn read_first_level_openable_rejects_unsupported_directory() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("does_not_exist");
        let error = read_first_level_openable(path.to_string_lossy().to_string()).unwrap_err();
        assert!(error.contains("directory not found"));
    }

    // ===== 核心安全函数回归测试（CHANGELOG §文件可靠性 / PR #258）=====

    #[test]
    fn is_openable_document_path_accepts_supported_extensions_case_insensitive() {
        assert!(is_openable_document_path(Path::new("/x/a.md")));
        assert!(is_openable_document_path(Path::new("/x/a.markdown")));
        assert!(is_openable_document_path(Path::new("/x/a.html")));
        assert!(is_openable_document_path(Path::new("/x/a.htm")));
        assert!(is_openable_document_path(Path::new("/x/a.docx")));
        // 简单小写：MD / HTML / DOCX 都识别
        assert!(is_openable_document_path(Path::new("/x/a.MD")));
        // mixed-case (MdOx) 实际上不识别（实现用 to_ascii_lowercase 仅作用于 char）
        // 这是一个潜在改进点：当前只能识别全部小写的扩展
        assert!(!is_openable_document_path(Path::new("/x/a.MdOx")));
        assert!(!is_openable_document_path(Path::new("/x/a.MD_mixed")));
    }

    #[test]
    fn is_openable_document_path_rejects_unsupported_extensions() {
        assert!(!is_openable_document_path(Path::new("/x/a.txt")));
        assert!(!is_openable_document_path(Path::new("/x/a.exe")));
        assert!(!is_openable_document_path(Path::new("/x/a")));
        assert!(!is_openable_document_path(Path::new("/x/.hidden")));
    }

    #[test]
    fn is_writable_document_path_excludes_docx() {
        // docx 仅可读，不可写（避免破坏 Word 文件）
        assert!(is_openable_document_path(Path::new("/x/a.docx")));
        assert!(!is_writable_document_path(Path::new("/x/a.docx")));
        // md / html 可写
        assert!(is_writable_document_path(Path::new("/x/a.md")));
        assert!(is_writable_document_path(Path::new("/x/a.html")));
        assert!(is_writable_document_path(Path::new("/x/a.htm")));
        assert!(is_writable_document_path(Path::new("/x/a.MD")));
        // 不可写扩展
        assert!(!is_writable_document_path(Path::new("/x/a.txt")));
        assert!(!is_writable_document_path(Path::new("/x/a")));
    }

    #[test]
    fn sanitize_attachment_file_name_replaces_invalid_chars() {
        // Windows 路径语义：Path::new 提取最后一个分隔符之后的 basename。
        // 输入 "a/b\\c:d*e?f\"g<h>i|j.png" → 取 basename "c:d*e?f\"g<h>i|j.png"
        // → 替换非法字符为 '-' → "c-d-e-f-g-h-i-j.png"
        let result = sanitize_attachment_file_name("a/b\\c:d*e?f\"g<h>i|j.png");
        assert_eq!(result, "c-d-e-f-g-h-i-j.png");
        // 没有分隔符的输入，basename 全部保留
        assert_eq!(sanitize_attachment_file_name("normal.png"), "normal.png");
    }

    #[test]
    fn sanitize_attachment_file_name_strips_path_components() {
        // 只保留 basename，不允许 ../ 越权
        assert_eq!(sanitize_attachment_file_name("../../etc/passwd"), "passwd");
        assert_eq!(sanitize_attachment_file_name("/abs/path/file.png"), "file.png");
        // Windows 反斜杠同样识别为路径分隔符
        assert_eq!(sanitize_attachment_file_name("C:\\Windows\\System32\\evil.exe"), "evil.exe");
    }

    #[test]
    fn sanitize_attachment_file_name_trims_dots_and_spaces() {
        assert_eq!(sanitize_attachment_file_name("...file.png"), "file.png");
        assert_eq!(sanitize_attachment_file_name("   spaces.png   "), "spaces.png");
        assert_eq!(sanitize_attachment_file_name(".hidden"), "hidden");
    }

    #[test]
    fn sanitize_attachment_file_name_truncates_long_names() {
        // 实现：candidate.trim_matches(['.', ' ']).trim() 后再 take(96)
        // 输入 200 'a' + ".png" → candidate "aaaa...aaa.png" → trim_matches 不动 → take(96)
        // → "aaaa...(96 字符).png" 不再以 .png 结尾（因为 .png 在第 197 字节）
        let long_name = format!("{}.png", "a".repeat(200));
        let result = sanitize_attachment_file_name(&long_name);
        assert_eq!(result.len(), 96);
        assert!(result.starts_with("aaaaa"));
    }

    #[test]
    fn sanitize_attachment_file_name_falls_back_to_default_for_invalid_input() {
        // 空字符串 / 全空白 / 全 . 在 trim_matches 后变空 → 回退默认名
        assert_eq!(sanitize_attachment_file_name(""), "pasted-image.png");
        assert_eq!(sanitize_attachment_file_name("..."), "pasted-image.png");
        assert_eq!(sanitize_attachment_file_name("   "), "pasted-image.png");
        // 4 个 / 在 Windows 上 Path::new("////").file_name() 返回 None → unwrap_or 默认
        assert_eq!(sanitize_attachment_file_name("////"), "pasted-image.png");
        // "\0" 不被 trim_matches 当作 '.' 或 ' '，原样返回
        let null_result = sanitize_attachment_file_name("\0");
        assert_eq!(null_result, "\0");
    }

    #[test]
    fn sanitize_relative_dir_filters_dot_and_dotdot_components() {
        let result = sanitize_relative_dir("assets/../etc");
        // .. 被过滤，etc 保留，但最终相对路径不应包含 ..
        assert!(!result.to_string_lossy().contains(".."));
        let s = result.to_string_lossy();
        assert!(s.contains("assets"));
        assert!(s.contains("etc"));
    }

    #[test]
    fn sanitize_relative_dir_normalizes_backslashes() {
        // sanitize_attachment_file_name 把整个字符串当文件名处理（不识别 \\ 为路径分隔符），
        // split('/') 后只有一段，路径用原始形式返回
        let result = sanitize_relative_dir("a\\b\\c");
        let s = result.to_string_lossy();
        assert_eq!(s, "a\\b\\c");
        // 显式用 / 分隔的输入会被 normalize；Windows PathBuf 内部用 \ 表示
        let forward = sanitize_relative_dir("a/b/c");
        let forward_s = forward.to_string_lossy();
        #[cfg(windows)]
        assert_eq!(forward_s, "a\\b\\c");
        #[cfg(not(windows))]
        assert_eq!(forward_s, "a/b/c");
    }

    #[test]
    fn sanitize_relative_dir_filters_only_dotdot_segments() {
        // 多个 .. 全部被过滤，剩余有效段保留
        let result = sanitize_relative_dir("assets/../../etc/passwd");
        let s = result.to_string_lossy();
        assert!(!s.contains(".."));
        assert!(s.contains("assets"));
        assert!(s.contains("etc"));
        assert!(s.contains("passwd"));
    }

    // ===== atomic_write 写入原子性回归测试 =====

    #[test]
    fn atomic_write_creates_file_with_content() {
        let dir = tempdir().unwrap();
        let target = dir.path().join("document.md");
        atomic_write(&target, b"# hello world\n").unwrap();
        let content = std::fs::read(&target).unwrap();
        assert_eq!(content, b"# hello world\n");
    }

    #[test]
    fn atomic_write_overwrites_existing_file() {
        let dir = tempdir().unwrap();
        let target = dir.path().join("document.md");
        std::fs::write(&target, b"old content").unwrap();
        atomic_write(&target, b"new content").unwrap();
        let content = std::fs::read(&target).unwrap();
        assert_eq!(content, b"new content");
    }

    #[test]
    fn conversation_output_status_counts_artifacts_and_backups() {
        let dir = tempdir().unwrap();
        let output_root = dir.path().join(".typola-output");
        let conv = output_root.join("conv-3");
        std::fs::create_dir_all(conv.join("backups")).unwrap();
        std::fs::write(conv.join("report.html"), b"<html/>").unwrap();
        std::fs::write(conv.join("notes.md"), b"# hi").unwrap();
        std::fs::write(conv.join("artifact.json"), b"{}").unwrap();
        std::fs::write(conv.join("backups").join("doc.md.bak"), b"backup").unwrap();

        let status = conversation_output_status(ConversationOutputRequest {
            output_root: output_root.to_string_lossy().to_string(),
            conversation_id: "conv-3".into(),
        })
        .unwrap();

        assert!(status.exists);
        assert_eq!(status.artifact_count, 2, "artifact.json 不计入制品数");
        assert_eq!(status.backup_count, 1);
    }

    #[test]
    fn conversation_output_status_missing_dir_reports_not_exists() {
        let dir = tempdir().unwrap();
        let output_root = dir.path().join(".typola-output");
        std::fs::create_dir_all(&output_root).unwrap();

        let status = conversation_output_status(ConversationOutputRequest {
            output_root: output_root.to_string_lossy().to_string(),
            conversation_id: "conv-9".into(),
        })
        .unwrap();

        assert!(!status.exists);
        assert_eq!(status.artifact_count, 0);
        assert_eq!(status.backup_count, 0);
    }

    #[test]
    fn conversation_output_rejects_path_traversal() {
        let dir = tempdir().unwrap();
        let output_root = dir.path().join(".typola-output");
        std::fs::create_dir_all(&output_root).unwrap();

        for bad in ["../escape", "..\\escape", "a/b", ".hidden", "con v"] {
            let result = conversation_output_status(ConversationOutputRequest {
                output_root: output_root.to_string_lossy().to_string(),
                conversation_id: bad.into(),
            });
            assert!(result.is_err(), "应拒绝非法会话 id: {bad}");
        }
    }

    #[test]
    fn cleanup_conversation_output_removes_only_conv_dir() {
        let dir = tempdir().unwrap();
        let output_root = dir.path().join(".typola-output");
        let conv = output_root.join("conv-1");
        let sibling = output_root.join("conv-2");
        std::fs::create_dir_all(&conv).unwrap();
        std::fs::create_dir_all(&sibling).unwrap();
        std::fs::write(conv.join("report.html"), b"<html/>").unwrap();
        std::fs::write(sibling.join("keep.md"), b"keep").unwrap();

        cleanup_conversation_output(ConversationOutputRequest {
            output_root: output_root.to_string_lossy().to_string(),
            conversation_id: "conv-1".into(),
        })
        .unwrap();

        assert!(!conv.exists());
        assert!(sibling.join("keep.md").is_file(), "兄弟会话目录不受影响");
    }

    #[test]
    fn cleanup_conversation_output_missing_dir_is_noop() {
        let dir = tempdir().unwrap();
        let output_root = dir.path().join(".typola-output");
        std::fs::create_dir_all(&output_root).unwrap();

        cleanup_conversation_output(ConversationOutputRequest {
            output_root: output_root.to_string_lossy().to_string(),
            conversation_id: "conv-7".into(),
        })
        .unwrap();
    }

    #[test]
    fn scan_artifacts_includes_archived_manifest_without_local_primary() {
        let dir = tempdir().unwrap();
        let output_root = dir.path().join(".typola-output");
        let conv = output_root.join("conv-1");
        std::fs::create_dir_all(&conv).unwrap();
        // 已归档:主文件已 move 走,只剩 manifest。
        std::fs::write(
            conv.join("artifact.json"),
            r#"{"id":"a1","title":"季度汇报","kind":"html","status":"archived","primaryFile":"D:\\workspace\\季度汇报.html","createdAt":"2026-01-01T00:00:00Z","source":{"type":"flow_generation"}}"#,
        )
        .unwrap();

        let files = tauri::async_runtime::block_on(scan_artifacts(ScanArtifactsRequest {
            output_root: output_root.to_string_lossy().to_string(),
        }))
        .unwrap();

        assert_eq!(files.len(), 1, "archived manifest 应被补回");
        assert!(files[0].path.ends_with("季度汇报.html"));
        assert!(files[0].manifest_json.is_some());
    }

    #[test]
    fn archive_artifact_to_workspace_applies_custom_target_name() {
        let dir = tempdir().unwrap();
        let output_root = dir.path().join(".typola-output");
        let conv = output_root.join("conv-1");
        std::fs::create_dir_all(&conv).unwrap();
        let artifact = conv.join("report.html");
        std::fs::write(&artifact, b"<html/>").unwrap();

        let archived = archive_artifact_to_workspace(ArchiveArtifactRequest {
            artifact_path: artifact.to_string_lossy().to_string(),
            workspace_root: dir.path().to_string_lossy().to_string(),
            target_name: Some("季度汇报图表".into()),
        })
        .unwrap();

        assert!(archived.ends_with("季度汇报图表.html"), "自定义名 + 原扩展名: {archived}");
        assert!(!artifact.exists(), "归档是 move,原文件应消失");
    }

    #[test]
    fn watch_path_key_strips_windows_verbatim_prefix() {
        let dir = tempdir().unwrap();
        let key = watch_path_key(dir.path());
        assert!(!key.starts_with(r"\\?\"), "verbatim 前缀应被剥掉: {key}");
    }

    #[test]
    fn workspace_change_filter_applies_ignore_rules_relative_to_root() {
        let root = PathBuf::from("D:\\ws\\.typola-output");
        // 监听根本身是点开头目录:根内事件不应被 ignore 全灭(制品兜底监听的核心前提)。
        assert!(is_visible_workspace_change(&root.join("conv-1").join("report.html"), &root));
        // 根内的忽略目录仍被过滤。
        assert!(!is_visible_workspace_change(&root.join("node_modules").join("x.js"), &root));
        assert!(!is_visible_workspace_change(&root.join(".git").join("HEAD"), &root));
        // 根外路径不上报。
        assert!(!is_visible_workspace_change(Path::new("D:\\other\\file.md"), &root));
        // 工作区树根路径含点开头组件时,根内普通文件照常上报。
        let dotted_root = PathBuf::from("D:\\.config\\proj");
        assert!(is_visible_workspace_change(&dotted_root.join("doc.md"), &dotted_root));
    }

    #[test]
    fn archive_artifact_to_workspace_sanitizes_illegal_chars() {
        let dir = tempdir().unwrap();
        let output_root = dir.path().join(".typola-output");
        let conv = output_root.join("conv-1");
        std::fs::create_dir_all(&conv).unwrap();
        let artifact = conv.join("report.md");
        std::fs::write(&artifact, b"# hi").unwrap();

        let archived = archive_artifact_to_workspace(ArchiveArtifactRequest {
            artifact_path: artifact.to_string_lossy().to_string(),
            workspace_root: dir.path().to_string_lossy().to_string(),
            target_name: Some("a/b:c*?".into()),
        })
        .unwrap();

        assert!(archived.ends_with("a-b-c--.md"), "非法字符清洗为 -: {archived}");
    }

    #[test]
    fn atomic_write_creates_nonexistent_directory_returns_error() {
        let dir = tempdir().unwrap();
        let target = dir.path().join("nonexistent_subdir").join("document.md");
        // 父目录不存在时 atomic_write 应返回错误
        let result = atomic_write(&target, b"content");
        assert!(result.is_err());
    }

    #[test]
    fn atomic_write_cleans_up_temp_file_on_overwrite_failure() {
        // 模拟 atomic_write 写入路径：写入内容 + 验证目录中无残留 temp 文件
        let dir = tempdir().unwrap();
        let target = dir.path().join("document.md");
        atomic_write(&target, b"original").unwrap();

        let before_count = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| {
                let name = e.file_name();
                let s = name.to_string_lossy();
                s.contains(".typola-") && s.ends_with(".tmp")
            })
            .count();
        assert_eq!(before_count, 0, "成功后不应残留临时文件");

        // 再写一次，验证多次写入也无残留
        atomic_write(&target, b"second").unwrap();
        let after_count = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| {
                let name = e.file_name();
                let s = name.to_string_lossy();
                s.contains(".typola-") && s.ends_with(".tmp")
            })
            .count();
        assert_eq!(after_count, 0, "多次写入后仍不应残留临时文件");
    }

    #[test]
    fn atomic_write_preserves_unix_permissions_when_replacing() {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let dir = tempdir().unwrap();
            let target = dir.path().join("script.md");
            std::fs::write(&target, b"old").unwrap();
            std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o600)).unwrap();

            atomic_write(&target, b"new").unwrap();

            let metadata = std::fs::metadata(&target).unwrap();
            assert_eq!(metadata.permissions().mode() & 0o777, 0o600);
        }
    }
}
