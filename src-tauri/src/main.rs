#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::{fs, path::{Path, PathBuf}};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{command, api::dialog, Manager, WindowEvent};
use notify::{Watcher, RecursiveMode, Event};

const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024; // 10MB limit
const DEBOUNCE_TIME: u64 = 100; // 100ms
const MAX_WATCH_DEPTH: u32 = 5;
const CHUNK_SIZE: usize = 1_000_000; // 1MB chunks for file streaming

// Resize state management
struct ResizeState {
    last_resize: Instant,
    is_resizing: AtomicBool,
}

impl Default for ResizeState {
    fn default() -> Self {
        Self {
            last_resize: Instant::now(),
            is_resizing: AtomicBool::new(false),
        }
    }
}

#[derive(serde::Serialize)]
struct FileInfo {
    name: String,
    path: String,
    is_directory: bool,
    children: Option<Vec<FileInfo>>
}

struct FSWatcher(Mutex<Option<notify::RecommendedWatcher>>);

struct MemoryMonitor {
    last_cleanup: AtomicU64,
    total_allocated: AtomicU64,
}

impl Default for MemoryMonitor {
    fn default() -> Self {
        Self {
            last_cleanup: AtomicU64::new(0),
            total_allocated: AtomicU64::new(0),
        }
    }
}

impl MemoryMonitor {
    fn check_and_cleanup(&self) -> Result<(), String> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_secs();
        
        let last = self.last_cleanup.load(Ordering::Relaxed);
        if now - last > 300 { // Cleanup every 5 minutes
            self.total_allocated.store(0, Ordering::Relaxed);
            self.last_cleanup.store(now, Ordering::Relaxed);
        }
        Ok(())
    }

    fn allocate(&self, size: u64) -> Result<(), String> {
        let current = self.total_allocated.load(Ordering::Relaxed);
        if current + size > 1024 * 1024 * 1024 { // 1GB limit
            return Err("Memory limit exceeded".to_string());
        }
        self.total_allocated.fetch_add(size, Ordering::Relaxed);
        Ok(())
    }
}

// File Reading and Directory Functions
#[command]
async fn read_file(path: String) -> Result<String, String> {
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    if metadata.len() > MAX_FILE_SIZE {
        return Err("File too large to read".to_string());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[command]
async fn select_folder() -> Result<String, String> {
    let folder = dialog::blocking::FileDialogBuilder::new()
        .pick_folder()
        .ok_or("No folder selected")?;
    Ok(folder.to_string_lossy().into_owned())
}

#[command]
fn list_files(path: String) -> Result<Vec<FileInfo>, String> {
    read_dir_recursive(Path::new(&path), 0)
}

fn read_dir_recursive(path: &Path, depth: u32) -> Result<Vec<FileInfo>, String> {
    if depth > MAX_WATCH_DEPTH {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;
    let mut directories: Vec<FileInfo> = Vec::new();
    let mut files: Vec<FileInfo> = Vec::new();

    for entry in entries.filter_map(Result::ok) {
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        let path_buf = entry.path();
        let name = path_buf.file_name()
            .ok_or("Invalid filename")?
            .to_string_lossy()
            .into_owned();

        if file_type.is_dir() {
            directories.push(FileInfo {
                name,
                path: path_buf.to_string_lossy().into_owned(),
                is_directory: true,
                children: Some(read_dir_recursive(&path_buf, depth + 1)?)
            });
        } else {
            files.push(FileInfo {
                name,
                path: path_buf.to_string_lossy().into_owned(),
                is_directory: false,
                children: None
            });
        }
    }

    directories.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    let mut result = Vec::with_capacity(directories.len() + files.len());
    result.extend(directories);
    result.extend(files);
    Ok(result)
}

// Explorer Integration Functions
#[command]
async fn open_in_explorer(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let path_str = path.as_str();
        let metadata = std::fs::metadata(path_str).map_err(|e| e.to_string())?;
        
        if metadata.is_dir() {
            Command::new("explorer.exe")
                .arg(path_str)
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            Command::new("explorer.exe")
                .args(["/select,", path_str])
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
        
        if metadata.is_dir() {
            Command::new("open")
                .arg(&path)
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            Command::new("open")
                .args(["-R", &path])
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        let file_manager = if Command::new("xdg-open").output().is_ok() {
            "xdg-open"
        } else if Command::new("nautilus").output().is_ok() {
            "nautilus"
        } else if Command::new("dolphin").output().is_ok() {
            "dolphin"
        } else {
            return Err("No supported file manager found".to_string());
        };

        Command::new(file_manager)
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

// File Watcher Functions
#[command]
async fn watch_directory(path: String, window: tauri::Window) -> Result<(), String> {
    let watcher_state = window.state::<FSWatcher>();
    let mut watcher = watcher_state.0.lock().map_err(|e| e.to_string())?;

    // Clean up old watcher
    if watcher.is_some() {
        *watcher = None;
    }

    let window_clone = window.clone();
    let mut new_watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        match res {
            Ok(event) => {
                let event_type = match event.kind {
                    notify::EventKind::Create(_) => "fs-created",
                    notify::EventKind::Modify(_) => "fs-modified",
                    notify::EventKind::Remove(_) => "fs-deleted",
                    _ => return,
                };
                
                // Debounce events
                static LAST_EVENT: AtomicU64 = AtomicU64::new(0);
                let now = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as u64;
                
                let last = LAST_EVENT.load(Ordering::Relaxed);
                if now - last < DEBOUNCE_TIME {
                    return;
                }
                
                LAST_EVENT.store(now, Ordering::Relaxed);
                window_clone.emit(event_type, ()).ok();
            }
            Err(e) => eprintln!("Watch error: {:?}", e),
        }
    }).map_err(|e| e.to_string())?;

    // Instead of using Config, we'll use watch() directly with RecursiveMode
    new_watcher.watch(path.as_ref(), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    *watcher = Some(new_watcher);
    Ok(())
}

#[command]
async fn stop_watching(window: tauri::Window) -> Result<(), String> {
    let watcher_state = window.state::<FSWatcher>();
    let mut watcher = watcher_state.0.lock().map_err(|e| e.to_string())?;
    *watcher = None;
    Ok(())
}

// History Functions
#[command]
async fn write_history(path: String, content: String, window: tauri::Window) -> Result<(), String> {
    let memory_monitor = window.state::<MemoryMonitor>();
    memory_monitor.check_and_cleanup()?;
    memory_monitor.allocate(content.len() as u64)?;

    let app_dir = tauri::api::path::app_data_dir(&tauri::Config::default())
        .ok_or("Could not get app directory")?;
    let full_path = app_dir.join(path);
    
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    fs::write(full_path, content).map_err(|e| e.to_string())
}

#[command]
async fn delete_history_file(path: String) -> Result<(), String> {
    fs::remove_file(&path).map_err(|e| e.to_string())?;
    
    if let Some(parent) = Path::new(&path).parent() {
        if parent.exists() {
            let is_empty = fs::read_dir(parent)
                .map_err(|e| e.to_string())?
                .next()
                .is_none();
            
            if is_empty {
                fs::remove_dir_all(parent).map_err(|e| e.to_string())?;
            }
        }
    }
    
    Ok(())
}

#[command]
fn get_app_data_dir() -> Result<String, String> {
    tauri::api::path::app_data_dir(&tauri::Config::default())
        .ok_or("Could not get app directory".to_string())
        .map(|path| path.to_string_lossy().into_owned())
}

#[command]
async fn create_file_window(
    window: tauri::Window, 
    title: String, 
    content: String, 
    theme: Option<String>
) -> Result<(), String> {
    let memory_monitor = window.state::<MemoryMonitor>();
    memory_monitor.check_and_cleanup()?;
    
    if content.len() as u64 > MAX_FILE_SIZE {
        return Err("File too large to display".to_string());
    }

    memory_monitor.allocate(content.len() as u64)?;
    
    let app_handle = window.app_handle();
    
    let file_viewer = if let Some(file_viewer) = app_handle.get_window("file-viewer") {
        file_viewer.emit("clear-content", ()).map_err(|e| e.to_string())?;
        file_viewer
    } else {
        tauri::WindowBuilder::new(
            &app_handle,
            "file-viewer",
            tauri::WindowUrl::App("file-viewer.html".into())
        )
        .title("File Viewer")
        .visible(false)
        .decorations(false)
        .resizable(true)
        .transparent(true)
        .skip_taskbar(true)
        .build()
        .map_err(|e| e.to_string())?
    };

    let main_window = window;
    let main_position = main_window.outer_position().map_err(|e| e.to_string())?;
    let main_size = main_window.outer_size().map_err(|e| e.to_string())?;
    
    file_viewer.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
        x: main_position.x + main_size.width as i32,
        y: main_position.y,
    })).map_err(|e| e.to_string())?;
    
    file_viewer.set_size(tauri::Size::Physical(tauri::PhysicalSize {
        width: 1600,
        height: main_size.height,
    })).map_err(|e| e.to_string())?;

    file_viewer.show().map_err(|e| e.to_string())?;
    
    if content.len() > CHUNK_SIZE {
        for chunk in content.as_bytes().chunks(CHUNK_SIZE) {
            if let Ok(chunk_str) = String::from_utf8(chunk.to_vec()) {
                file_viewer.emit("append-content", serde_json::json!({
                    "content": chunk_str,
                    "filePath": &title,
                    "theme": &theme
                })).map_err(|e| e.to_string())?;
            }
        }
    } else {
        file_viewer.emit("set-content", serde_json::json!({
            "content": content,
            "filePath": title,
            "theme": theme
        })).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[command]
async fn list_history_files(path: String) -> Result<Vec<String>, String> {
    let app_dir = tauri::api::path::app_data_dir(&tauri::Config::default())
        .ok_or("Could not get app directory")?;
    let dir_path = app_dir.join(path);
if !dir_path.exists() {
        return Ok(vec![]);
    }

    let mut files = Vec::new();
    list_json_files_recursive(&dir_path, &mut files)?;
    Ok(files)
}

fn list_json_files_recursive(dir: &PathBuf, files: &mut Vec<String>) -> Result<(), String> {
    if dir.is_dir() {
        for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            
            if path.is_dir() {
                list_json_files_recursive(&path, files)?;
            } else if path.extension().and_then(|ext| ext.to_str()) == Some("json") {
                files.push(path.to_string_lossy().into_owned());
            }
        }
    }
    Ok(())
}

fn handle_window_event(event: &WindowEvent, window: &tauri::Window) -> Result<(), Box<dyn std::error::Error>> {
    match event {
        WindowEvent::CloseRequested { api, .. } => {
            if window.label() == "file-viewer" {
                let app_handle = window.app_handle();
                app_handle.emit_all("file-viewer-closed", ())?;
                window.hide()?;
                api.prevent_close();
            }
        }
        WindowEvent::Focused(focused) => {
            if *focused {
                let app_handle = window.app_handle();
                
                if window.label() == "main" {
                    if let Some(file_viewer) = app_handle.get_window("file-viewer") {
                        if file_viewer.is_visible()? {
                            window.set_always_on_top(true)?;
                            file_viewer.set_always_on_top(true)?;
                            file_viewer.unminimize()?;
                            window.set_always_on_top(false)?;
                            file_viewer.set_always_on_top(false)?;
                        }
                    }
                } else if window.label() == "file-viewer" {
                    if let Some(main_window) = app_handle.get_window("main") {
                        window.set_always_on_top(true)?;
                        main_window.set_always_on_top(true)?;
                        main_window.unminimize()?;
                        window.set_always_on_top(false)?;
                        main_window.set_always_on_top(false)?;
                    }
                }
            }
        }
        WindowEvent::Moved(position) => {
            if window.label() == "main" {
                let app_handle = window.app_handle();
                if let Some(file_viewer) = app_handle.get_window("file-viewer") {
                    if file_viewer.is_visible()? {
                        if let Ok(main_size) = window.outer_size() {
                            file_viewer.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                                x: position.x + main_size.width as i32,
                                y: position.y,
                            }))?;
                        }
                    }
                }
            } else if window.label() == "file-viewer" {
                let app_handle = window.app_handle();
                if let Some(main_window) = app_handle.get_window("main") {
                    if let Ok(file_viewer_pos) = window.outer_position() {
                        if let Ok(main_size) = main_window.outer_size() {
                            let new_main_x = file_viewer_pos.x - main_size.width as i32;
                            main_window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                                x: new_main_x,
                                y: position.y,
                            }))?;
                        }
                    }
                }
            }
        }
        _ => {}
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(FSWatcher(Mutex::new(None)))
        .manage(Mutex::new(ResizeState::default()))
        .manage(MemoryMonitor::default())
        .on_window_event(|event| {
            if let Err(e) = handle_window_event(event.event(), event.window()) {
                eprintln!("Error handling window event: {:?}", e);
            }
        })
        .invoke_handler(tauri::generate_handler![
            select_folder,
            list_files,
            read_file,
            open_in_explorer,
            watch_directory,
            stop_watching,
            write_history,
            list_history_files,
            create_file_window,
            delete_history_file,
            get_app_data_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}