mod updater;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use uuid::Uuid;

fn data_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("failed to get app data dir")
}

fn projects_dir(app: &tauri::AppHandle) -> PathBuf {
    data_dir(app).join("projects")
}

fn ensure_dirs(app: &tauri::AppHandle) {
    let dir = projects_dir(app);
    if !dir.exists() {
        fs::create_dir_all(&dir).ok();
    }
}

// ── Data types ──────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    pub last_project_id: Option<String>,
    #[serde(default)]
    pub theme: Option<String>,
    #[serde(default)]
    pub snap_enabled: Option<bool>,
    #[serde(default)]
    pub snap_distance: Option<u32>,
    #[serde(default)]
    pub animate_gifs: Option<bool>,
    #[serde(default)]
    pub rounded_corners: Option<bool>,
    #[serde(default)]
    pub sidebar_collapsed: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub last_opened_vibe_id: Option<String>,
    pub vibes: Vec<Vibe>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Vibe {
    pub id: String,
    pub name: String,
    pub elements: Vec<CanvasElement>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CanvasElement {
    pub id: String,
    #[serde(rename = "type")]
    pub element_type: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub z_index: i32,
    pub data: serde_json::Value,
}

// ── Commands ────────────────────────────────────────────────

#[allow(dead_code)]
fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

#[tauri::command]
fn get_app_state(app: tauri::AppHandle) -> AppState {
    let path = data_dir(&app).join("app-state.json");
    if path.exists() {
        let data = fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        AppState::default()
    }
}

#[tauri::command]
fn save_app_state(app: tauri::AppHandle, state: AppState) -> Result<(), String> {
    ensure_dirs(&app);
    let path = data_dir(&app).join("app-state.json");
    let json = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_projects(app: tauri::AppHandle) -> Vec<Project> {
    ensure_dirs(&app);
    let dir = projects_dir(&app);
    let mut projects: Vec<Project> = Vec::new();

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let project_file = entry.path().join("project.json");
            if project_file.exists() {
                if let Ok(data) = fs::read_to_string(&project_file) {
                    if let Ok(project) = serde_json::from_str::<Project>(&data) {
                        projects.push(project);
                    }
                }
            }
        }
    }

    projects.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    projects
}

#[tauri::command]
fn read_project(app: tauri::AppHandle, id: String) -> Result<Project, String> {
    let path = projects_dir(&app).join(&id).join("project.json");
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_project(app: tauri::AppHandle, project: Project) -> Result<(), String> {
    ensure_dirs(&app);
    let project_dir = projects_dir(&app).join(&project.id);
    if !project_dir.exists() {
        fs::create_dir_all(&project_dir).map_err(|e| e.to_string())?;
    }
    let images_dir = project_dir.join("images");
    if !images_dir.exists() {
        fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;
    }

    let path = project_dir.join("project.json");
    let json = serde_json::to_string_pretty(&project).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_project(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let project_dir = projects_dir(&app).join(&id);
    if project_dir.exists() {
        fs::remove_dir_all(&project_dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn copy_image(
    app: tauri::AppHandle,
    source_path: String,
    project_id: String,
) -> Result<String, String> {
    let source = PathBuf::from(&source_path);
    if !source.exists() {
        return Err("Source file does not exist".to_string());
    }

    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();

    let allowed = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif"];
    if !allowed.contains(&ext.as_str()) {
        return Err(format!("Unsupported image format: {}", ext));
    }

    let filename = format!("{}.{}", Uuid::new_v4(), ext);
    let dest_dir = projects_dir(&app).join(&project_id).join("images");
    if !dest_dir.exists() {
        fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    }

    let dest = dest_dir.join(&filename);
    fs::copy(&source, &dest).map_err(|e| e.to_string())?;

    Ok(filename)
}

#[tauri::command]
fn delete_image(
    app: tauri::AppHandle,
    project_id: String,
    filename: String,
) -> Result<(), String> {
    let path = projects_dir(&app)
        .join(&project_id)
        .join("images")
        .join(&filename);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_image_path(app: tauri::AppHandle, project_id: String, filename: String) -> String {
    projects_dir(&app)
        .join(&project_id)
        .join("images")
        .join(&filename)
        .to_string_lossy()
        .to_string()
}

#[tauri::command]
fn get_image_base64(app: tauri::AppHandle, project_id: String, filename: String) -> Result<String, String> {
    let path = projects_dir(&app)
        .join(&project_id)
        .join("images")
        .join(&filename);
    if !path.exists() {
        return Err("Image not found".to_string());
    }
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("png").to_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "avif" => "image/avif",
        _ => "image/png",
    };
    Ok(format!("data:{};base64,{}", mime, B64.encode(&bytes)))
}

// ── .moo export/import ──────────────────────────────────────

/// A .moo file is a JSON bundle containing the project data + base64-encoded images.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MooFile {
    version: u32,
    project: Project,
    /// Map of filename -> base64-encoded image data
    images: std::collections::HashMap<String, String>,
}

#[tauri::command]
fn export_moo(app: tauri::AppHandle, project_id: String, dest_path: String) -> Result<(), String> {
    let project_dir = projects_dir(&app).join(&project_id);
    let project_file = project_dir.join("project.json");
    let data = fs::read_to_string(&project_file).map_err(|e| e.to_string())?;
    let project: Project = serde_json::from_str(&data).map_err(|e| e.to_string())?;

    // Collect all image filenames used in the project
    let mut images = std::collections::HashMap::new();
    let images_dir = project_dir.join("images");

    for vibe in &project.vibes {
        for element in &vibe.elements {
            if element.element_type == "image" {
                if let Some(filename) = element.data.get("filename").and_then(|v| v.as_str()) {
                    let img_path = images_dir.join(filename);
                    if img_path.exists() {
                        let img_bytes = fs::read(&img_path).map_err(|e| e.to_string())?;
                        let encoded = B64.encode(&img_bytes);
                        images.insert(filename.to_string(), encoded);
                    }
                }
            }
        }
    }

    let moo = MooFile {
        version: 1,
        project,
        images,
    };

    let json = serde_json::to_string(&moo).map_err(|e| e.to_string())?;
    fs::write(&dest_path, json).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn import_moo(app: tauri::AppHandle, source_path: String) -> Result<Project, String> {
    let data = fs::read_to_string(&source_path).map_err(|e| e.to_string())?;
    let moo: MooFile = serde_json::from_str(&data).map_err(|e| e.to_string())?;

    // Create new project with a fresh ID to avoid conflicts
    let new_id = Uuid::new_v4().to_string();
    let mut project = moo.project;
    project.id = new_id.clone();

    // Save project
    ensure_dirs(&app);
    let project_dir = projects_dir(&app).join(&new_id);
    fs::create_dir_all(&project_dir).map_err(|e| e.to_string())?;

    let images_dir = project_dir.join("images");
    fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;

    // Write images from base64
    for (filename, encoded) in &moo.images {
        let bytes = B64.decode(encoded).map_err(|e| e.to_string())?;
        fs::write(images_dir.join(filename), bytes).map_err(|e| e.to_string())?;
    }

    // Save project JSON
    let json = serde_json::to_string_pretty(&project).map_err(|e| e.to_string())?;
    fs::write(project_dir.join("project.json"), json).map_err(|e| e.to_string())?;

    Ok(project)
}

// ── Desktop file install (Linux) ────────────────────────────

#[tauri::command]
fn install_desktop_file(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let exe_path = std::env::var("APPIMAGE")
            .unwrap_or_else(|_| std::env::current_exe()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default());

        if exe_path.is_empty() {
            return Err("Could not determine executable path".to_string());
        }

        // Save embedded icon to a stable location
        let icon_dir = dirs::data_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("/tmp"))
            .join("simple-moodboard");
        fs::create_dir_all(&icon_dir).ok();
        let icon_path = icon_dir.join("icon.png");

        // Embed the 128x128 icon at compile time
        let icon_bytes = include_bytes!("../icons/128x128.png");
        fs::write(&icon_path, icon_bytes).ok();

        let desktop_content = format!(
            "[Desktop Entry]\n\
             Name=Simple Moodboard\n\
             Comment=Cross-platform moodboard application\n\
             Exec={exe}\n\
             Icon={icon}\n\
             Terminal=false\n\
             Type=Application\n\
             Categories=Graphics;\n\
             StartupNotify=true\n",
            exe = exe_path,
            icon = icon_path.to_string_lossy(),
        );

        let desktop_dir = dirs::home_dir()
            .ok_or("Could not find home dir")?
            .join(".local/share/applications");
        fs::create_dir_all(&desktop_dir).map_err(|e| e.to_string())?;

        let desktop_path = desktop_dir.join("simple-moodboard.desktop");
        fs::write(&desktop_path, &desktop_content).map_err(|e| e.to_string())?;

        // Update desktop database silently
        std::process::Command::new("update-desktop-database")
            .arg(&desktop_dir)
            .output()
            .ok();

        return Ok(format!("Installed to {}", desktop_path.to_string_lossy()));
    }

    #[cfg(not(target_os = "linux"))]
    {
        Err("Desktop file install is only available on Linux".to_string())
    }
}

// ── App setup ───────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(target_os = "linux")]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    let icon_bytes = include_bytes!("../icons/128x128.png");
                    let img = tauri::image::Image::from_bytes(icon_bytes).unwrap();
                    let _ = window.set_icon(img);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_state,
            save_app_state,
            list_projects,
            read_project,
            save_project,
            delete_project,
            copy_image,
            delete_image,
            get_image_path,
            get_image_base64,
            export_moo,
            import_moo,
            updater::check_for_updates,
            updater::download_and_apply_update,
            install_desktop_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
