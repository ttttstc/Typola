use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;
use std::thread;
use std::time::{Duration, Instant};

// ── Path helpers ───────────────────────────────────────────────────────────

fn encode_file_url_path(path: &str) -> String {
    let mut encoded = String::new();
    for byte in path.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' | b':' => {
                encoded.push(*byte as char)
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}

fn file_url_from_path(path: &Path) -> String {
    let normalized = path.to_string_lossy().replace('\\', "/");
    let absolute = if normalized.len() >= 2 && normalized.as_bytes()[1] == b':' {
        format!("/{normalized}")
    } else if normalized.starts_with('/') {
        normalized
    } else {
        format!("/{normalized}")
    };
    format!("file://{}", encode_file_url_path(&absolute))
}

// ── Browser PDF renderer ───────────────────────────────────────────────────

fn browser_pdf_arguments(source: &Path, target: &Path, profile: &Path) -> Vec<String> {
    vec![
        "--headless=new".to_string(),
        "--disable-gpu".to_string(),
        "--no-sandbox".to_string(),
        "--allow-file-access-from-files".to_string(),
        "--disable-background-networking".to_string(),
        "--disable-component-update".to_string(),
        "--disable-extensions".to_string(),
        "--no-first-run".to_string(),
        "--no-default-browser-check".to_string(),
        format!("--user-data-dir={}", profile.display()),
        "--no-pdf-header-footer".to_string(),
        format!("--print-to-pdf={}", target.display()),
        file_url_from_path(source),
    ]
}

fn find_executable(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        #[cfg(target_os = "windows")]
        {
            let exe = dir.join(format!("{name}.exe"));
            if exe.is_file() {
                return Some(exe);
            }
        }
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn pdf_renderer_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    #[cfg(target_os = "windows")]
    {
        for var in ["ProgramFiles", "ProgramFiles(x86)", "LocalAppData"] {
            if let Some(base) = std::env::var_os(var) {
                let base = PathBuf::from(base);
                candidates.extend([
                    base.join("Google/Chrome/Application/chrome.exe"),
                    base.join("Chromium/Application/chrome.exe"),
                    base.join("Microsoft/Edge/Application/msedge.exe"),
                ]);
            }
        }
    }

    for name in [
        "google-chrome-stable",
        "google-chrome",
        "chromium",
        "chromium-browser",
        "microsoft-edge",
        "microsoft-edge-stable",
        "msedge",
    ] {
        if let Some(p) = find_executable(name) {
            candidates.push(p);
        }
    }

    candidates
}

fn find_pdf_renderer() -> Option<PathBuf> {
    static PDF_RENDERER: OnceLock<Option<PathBuf>> = OnceLock::new();
    PDF_RENDERER
        .get_or_init(|| pdf_renderer_candidates().into_iter().find(|p| p.is_file()))
        .clone()
}

fn pdf_output_file_size(path: &Path) -> Option<u64> {
    fs::metadata(path).ok().map(|m| m.len()).filter(|s| *s > 0)
}

fn run_pdf_renderer(binary: &Path, args: &[String], target: &Path) -> Result<bool, String> {
    use std::process::Stdio;

    let mut child = Command::new(binary)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to launch PDF renderer: {e}"))?;

    let started = Instant::now();
    let timeout = Duration::from_secs(45);
    let poll = Duration::from_millis(100);
    let stable_duration = Duration::from_millis(350);
    let mut last_size = 0u64;
    let mut stable_since: Option<Instant> = None;

    loop {
        if let Some(exit_status) = child.try_wait().map_err(|e| e.to_string())? {
            if !exit_status.success() {
                let mut stderr_buf = String::new();
                if let Some(ref mut stderr) = child.stderr {
                    let _ = std::io::Read::read_to_string(stderr, &mut stderr_buf);
                }
                let msg = stderr_buf.trim().to_string();
                if !msg.is_empty() {
                    return Err(format!("PDF 渲染器异常退出: {msg}"));
                }
            }
            return Ok(exit_status.success());
        }

        let now = Instant::now();
        if let Some(size) = pdf_output_file_size(target) {
            if size == last_size {
                let since = stable_since.get_or_insert(now);
                if now.duration_since(*since) >= stable_duration {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Ok(true);
                }
            } else {
                last_size = size;
                stable_since = Some(now);
            }
        }

        if now.duration_since(started) >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Ok(false);
        }

        thread::sleep(poll);
    }
}

fn unique_temp_dir(prefix: &str) -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("{prefix}-{}-{nanos}", std::process::id()))
}

// ── PDF export (system browser) ────────────────────────────────────────────

fn export_pdf_blocking(path: String, html: String) -> Result<(), String> {
    if html.trim().is_empty() {
        return Err("PDF export HTML is empty".to_string());
    }

    let renderer = find_pdf_renderer().ok_or_else(|| {
        "PDF 导出需要安装 Google Chrome、Chromium 或 Microsoft Edge 浏览器".to_string()
    })?;

    let target = PathBuf::from(&path);
    let temp_root = unique_temp_dir("typola-pdf-export");
    let source_path = temp_root.join("index.html");
    let output_path = temp_root.join("output.pdf");
    let profile_path = temp_root.join("profile");

    fs::create_dir_all(&profile_path).map_err(|e| e.to_string())?;
    fs::write(&source_path, &html).map_err(|e| e.to_string())?;

    let result = (|| {
        let args = browser_pdf_arguments(&source_path, &output_path, &profile_path);
        if !run_pdf_renderer(&renderer, &args, &output_path)? {
            return Err("PDF 渲染器执行失败".to_string());
        }
        if pdf_output_file_size(&output_path).is_none() {
            return Err("PDF 渲染器未生成有效的输出文件".to_string());
        }
        fs::copy(&output_path, &target).map_err(|e| e.to_string())?;
        Ok(())
    })();

    let _ = fs::remove_dir_all(&temp_root);
    result
}

// ── Tauri commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn export_pdf_file(path: String, html: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || export_pdf_blocking(path, html))
        .await
        .map_err(|e| format!("PDF 导出任务失败: {e}"))?
}
