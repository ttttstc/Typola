mod cmd;
mod file;
mod watcher;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            #[cfg(debug_assertions)]
            window.open_devtools();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cmd::get_app_version,
            file::read_file,
            file::write_file,
            file::pick_folder,
            file::list_dir,
            file::create_file,
            file::create_dir,
            file::rename_path,
            file::delete_path,
            file::save_image,
            watcher::start_watching,
            watcher::stop_watching,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
