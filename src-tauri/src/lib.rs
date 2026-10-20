pub mod terminal;
pub mod workspace;

use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, State};
use terminal::{SpawnOptions, Terminals};
use workspace::Entry;

// ---- Arquivos da pasta aberta (a raiz vem do seletor de pasta da interface) ----

#[tauri::command]
fn fs_read_dir(root: String, path: String) -> Result<Vec<Entry>, String> {
    workspace::read_dir(Path::new(&root), &path)
}

#[tauri::command]
fn fs_read_file(root: String, path: String) -> Result<String, String> {
    workspace::read_file(Path::new(&root), &path)
}

#[tauri::command]
fn fs_write_file(root: String, path: String, content: String) -> Result<(), String> {
    workspace::write_file(Path::new(&root), &path, &content)
}

#[tauri::command]
fn fs_mkdir(root: String, path: String) -> Result<(), String> {
    workspace::mkdir(Path::new(&root), &path)
}

#[tauri::command]
fn fs_remove(root: String, path: String) -> Result<(), String> {
    workspace::remove(Path::new(&root), &path)
}

#[tauri::command]
fn fs_rename(root: String, from: String, to: String) -> Result<(), String> {
    workspace::rename(Path::new(&root), &from, &to)
}

#[tauri::command]
fn fs_exists(root: String, path: String) -> Result<bool, String> {
    workspace::exists(Path::new(&root), &path)
}

// ---- Terminal integrado ----

#[derive(Clone, Serialize)]
struct TermData {
    id: u32,
    data: String,
}

#[derive(Clone, Serialize)]
struct TermExit {
    id: u32,
}

#[tauri::command]
fn term_spawn(
    app: AppHandle,
    terms: State<'_, Terminals>,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<u32, String> {
    let data_app = app.clone();
    terms.spawn(
        SpawnOptions { shell: None, cwd: cwd.map(PathBuf::from), cols, rows },
        move |id, data| {
            let _ = data_app.emit("terminal://data", TermData { id, data });
        },
        move |id| {
            let _ = app.emit("terminal://exit", TermExit { id });
        },
    )
}

#[tauri::command]
fn term_write(terms: State<'_, Terminals>, id: u32, data: String) -> Result<(), String> {
    terms.write(id, &data)
}

#[tauri::command]
fn term_resize(terms: State<'_, Terminals>, id: u32, cols: u16, rows: u16) -> Result<(), String> {
    terms.resize(id, cols, rows)
}

#[tauri::command]
fn term_kill(terms: State<'_, Terminals>, id: u32) -> Result<(), String> {
    terms.kill(id)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Terminals::default())
        .invoke_handler(tauri::generate_handler![
            fs_read_dir,
            fs_read_file,
            fs_write_file,
            fs_mkdir,
            fs_remove,
            fs_rename,
            fs_exists,
            term_spawn,
            term_write,
            term_resize,
            term_kill,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a Batide");
}
