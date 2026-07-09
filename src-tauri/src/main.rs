// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  #[cfg(target_os = "windows")]
  app_lib::windows_runtime::ensure_webview2_runtime();

  app_lib::run();
}
