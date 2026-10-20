//! Operações de arquivo dentro da pasta do projeto aberta no app desktop.
//! Caminhos chegam da interface como POSIX relativos à raiz ("/src/main.ts").

use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    File,
    Dir,
}

#[derive(Debug, Serialize)]
pub struct Entry {
    pub name: String,
    /// Caminho POSIX relativo à raiz do projeto, ex.: "/src/main.ts".
    pub path: String,
    pub kind: EntryKind,
}

/// Junta o caminho da interface à raiz do projeto, recusando qualquer coisa que saia dela
/// (`..`, letras de unidade do Windows, barras invertidas).
pub fn resolve(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let mut out = root.to_path_buf();
    for part in rel.split('/') {
        match part {
            "" | "." => continue,
            ".." => return Err(format!("caminho fora do projeto: {rel}")),
            p if p.contains(['\\', ':']) => return Err(format!("caminho inválido: {rel}")),
            p => {
                // Defesa extra: o componente precisa ser um nome simples.
                if !matches!(Path::new(p).components().next(), Some(Component::Normal(_))) {
                    return Err(format!("caminho inválido: {rel}"));
                }
                out.push(p)
            }
        }
    }
    Ok(out)
}

fn err(e: std::io::Error) -> String {
    e.to_string()
}

fn join(dir: &str, name: &str) -> String {
    if dir == "/" || dir.is_empty() {
        format!("/{name}")
    } else {
        format!("{}/{name}", dir.trim_end_matches('/'))
    }
}

pub fn read_dir(root: &Path, rel: &str) -> Result<Vec<Entry>, String> {
    let mut entries = Vec::new();
    for item in fs::read_dir(resolve(root, rel)?).map_err(err)? {
        let item = item.map_err(err)?;
        let name = item.file_name().to_string_lossy().into_owned();
        // Segue links simbólicos para saber se é pasta.
        let is_dir = fs::metadata(item.path()).map(|m| m.is_dir()).unwrap_or(false);
        entries.push(Entry {
            path: join(rel, &name),
            name,
            kind: if is_dir { EntryKind::Dir } else { EntryKind::File },
        });
    }
    entries.sort_by(|a, b| {
        (a.kind != EntryKind::Dir)
            .cmp(&(b.kind != EntryKind::Dir))
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

pub fn read_file(root: &Path, rel: &str) -> Result<String, String> {
    let bytes = fs::read(resolve(root, rel)?).map_err(err)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

pub fn write_file(root: &Path, rel: &str, content: &str) -> Result<(), String> {
    let path = resolve(root, rel)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    fs::write(path, content).map_err(err)
}

pub fn mkdir(root: &Path, rel: &str) -> Result<(), String> {
    fs::create_dir_all(resolve(root, rel)?).map_err(err)
}

pub fn remove(root: &Path, rel: &str) -> Result<(), String> {
    let path = resolve(root, rel)?;
    if path == root {
        return Err("não é possível remover a pasta do projeto".into());
    }
    if fs::symlink_metadata(&path).map_err(err)?.is_dir() {
        fs::remove_dir_all(path).map_err(err)
    } else {
        fs::remove_file(path).map_err(err)
    }
}

pub fn rename(root: &Path, from: &str, to: &str) -> Result<(), String> {
    let (from, to) = (resolve(root, from)?, resolve(root, to)?);
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    fs::rename(from, to).map_err(err)
}

pub fn exists(root: &Path, rel: &str) -> Result<bool, String> {
    Ok(resolve(root, rel)?.exists())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn project() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("src")).unwrap();
        fs::write(dir.path().join("src/a.ts"), "a").unwrap();
        fs::write(dir.path().join("README.md"), "# r").unwrap();
        dir
    }

    #[test]
    fn resolve_junta_caminho_posix_a_raiz() {
        let p = project();
        assert_eq!(resolve(p.path(), "/").unwrap(), p.path());
        assert_eq!(resolve(p.path(), "/src/a.ts").unwrap(), p.path().join("src").join("a.ts"));
    }

    #[test]
    fn resolve_recusa_sair_da_pasta_do_projeto() {
        let p = project();
        for evil in ["/../etc/passwd", "/src/../../x", "/..", "../x"] {
            assert!(resolve(p.path(), evil).is_err(), "deveria recusar {evil}");
        }
    }

    #[test]
    fn resolve_recusa_caminho_absoluto_do_sistema_disfarcado() {
        let p = project();
        assert!(resolve(p.path(), "/C:/Windows").is_err());
        assert!(resolve(p.path(), "//etc/passwd").is_ok_and(|x| x.starts_with(p.path())));
    }

    #[test]
    fn lista_pastas_primeiro_e_por_nome() {
        let p = project();
        let entries = read_dir(p.path(), "/").unwrap();
        let names: Vec<_> = entries.iter().map(|e| (e.name.as_str(), e.kind)).collect();
        assert_eq!(names, vec![("src", EntryKind::Dir), ("README.md", EntryKind::File)]);
        assert_eq!(entries[0].path, "/src");
        assert_eq!(read_dir(p.path(), "/src").unwrap()[0].path, "/src/a.ts");
    }

    #[test]
    fn le_escreve_cria_renomeia_e_remove() {
        let p = project();
        write_file(p.path(), "/novo/b.sql", "begin null; end;").unwrap(); // cria a pasta intermediária
        assert_eq!(read_file(p.path(), "/novo/b.sql").unwrap(), "begin null; end;");
        assert!(exists(p.path(), "/novo/b.sql").unwrap());

        mkdir(p.path(), "/lib").unwrap();
        rename(p.path(), "/novo", "/lib/novo").unwrap();
        assert!(!exists(p.path(), "/novo").unwrap());
        assert!(exists(p.path(), "/lib/novo/b.sql").unwrap());

        remove(p.path(), "/lib").unwrap(); // pasta com conteúdo
        assert!(!exists(p.path(), "/lib").unwrap());
        remove(p.path(), "/README.md").unwrap();
        assert!(!exists(p.path(), "/README.md").unwrap());
    }

    #[test]
    fn nao_remove_a_raiz() {
        let p = project();
        assert!(remove(p.path(), "/").is_err());
        assert!(p.path().exists());
    }
}
