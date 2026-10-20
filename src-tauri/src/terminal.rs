//! Terminais de verdade (pseudoterminal) para o painel do app desktop.

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

pub struct SpawnOptions {
    /// Programa do shell; sem valor usa o padrão do sistema.
    pub shell: Option<String>,
    pub cwd: Option<PathBuf>,
    pub cols: u16,
    pub rows: u16,
}

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

/// Sessões de terminal abertas, por id.
#[derive(Default)]
pub struct Terminals {
    sessions: Arc<Mutex<HashMap<u32, Session>>>,
    next: AtomicU32,
}

pub fn default_shell() -> String {
    if cfg!(windows) {
        "powershell.exe".into()
    } else {
        std::env::var("SHELL").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| {
            if std::path::Path::new("/bin/bash").exists() { "/bin/bash".into() } else { "/bin/sh".into() }
        })
    }
}

impl Terminals {
    /// Abre um shell num pseudoterminal. `on_data` recebe (id, saída em UTF-8) e
    /// `on_exit` recebe o id quando o processo termina. O id já vale na primeira saída.
    pub fn spawn(
        &self,
        opts: SpawnOptions,
        on_data: impl Fn(u32, String) + Send + 'static,
        on_exit: impl FnOnce(u32) + Send + 'static,
    ) -> Result<u32, String> {
        let pair = native_pty_system()
            .openpty(PtySize { rows: opts.rows, cols: opts.cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())?;
        let mut cmd = CommandBuilder::new(opts.shell.unwrap_or_else(default_shell));
        if let Some(cwd) = opts.cwd {
            cmd.cwd(cwd);
        }
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
        drop(pair.slave);

        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        let killer = child.clone_killer();
        let id = self.next.fetch_add(1, Ordering::Relaxed) + 1;
        self.sessions.lock().unwrap().insert(id, Session { master: pair.master, writer, killer });

        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            let mut utf8 = Utf8Stream::default();
            while let Ok(n) = reader.read(&mut buf) {
                if n == 0 {
                    break;
                }
                let text = utf8.push(&buf[..n]);
                if !text.is_empty() {
                    on_data(id, text);
                }
            }
        });

        let sessions = self.sessions.clone();
        std::thread::spawn(move || {
            let _ = child.wait();
            sessions.lock().unwrap().remove(&id);
            on_exit(id);
        });
        Ok(id)
    }

    fn with<T>(&self, id: u32, f: impl FnOnce(&mut Session) -> Result<T, String>) -> Result<T, String> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions.get_mut(&id).ok_or_else(|| format!("terminal {id} não existe"))?;
        f(session)
    }

    pub fn write(&self, id: u32, data: &str) -> Result<(), String> {
        self.with(id, |s| {
            s.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
            s.writer.flush().map_err(|e| e.to_string())
        })
    }

    pub fn resize(&self, id: u32, cols: u16, rows: u16) -> Result<(), String> {
        self.with(id, |s| {
            s.master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }).map_err(|e| e.to_string())
        })
    }

    pub fn kill(&self, id: u32) -> Result<(), String> {
        let mut session =
            self.sessions.lock().unwrap().remove(&id).ok_or_else(|| format!("terminal {id} não existe"))?;
        session.killer.kill().map_err(|e| e.to_string())
    }
}

/// Decodifica UTF-8 em pedaços, guardando os bytes de um caractere que chegou incompleto.
#[derive(Default)]
pub struct Utf8Stream {
    pending: Vec<u8>,
}

impl Utf8Stream {
    pub fn push(&mut self, bytes: &[u8]) -> String {
        self.pending.extend_from_slice(bytes);
        let mut out = String::new();
        loop {
            match std::str::from_utf8(&self.pending) {
                Ok(s) => {
                    out.push_str(s);
                    self.pending.clear();
                    return out;
                }
                Err(e) => {
                    let valid = e.valid_up_to();
                    out.push_str(std::str::from_utf8(&self.pending[..valid]).unwrap());
                    match e.error_len() {
                        // Sequência inválida: troca pelo caractere de substituição e segue.
                        Some(len) => {
                            out.push(char::REPLACEMENT_CHARACTER);
                            self.pending.drain(..valid + len);
                        }
                        // Caractere incompleto no fim: espera o próximo pedaço.
                        None => {
                            self.pending.drain(..valid);
                            return out;
                        }
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::Duration;

    /// Abre um terminal e devolve (id, receptor da saída, receptor do fim).
    fn open(terms: &Terminals, shell: &str, cwd: &std::path::Path) -> (u32, mpsc::Receiver<String>, mpsc::Receiver<()>) {
        let (tx, rx) = mpsc::channel();
        let (etx, erx) = mpsc::channel();
        let id = terms
            .spawn(
                SpawnOptions { shell: Some(shell.into()), cwd: Some(cwd.to_path_buf()), cols: 80, rows: 24 },
                move |_id, data| {
                    let _ = tx.send(data);
                },
                move |_id| {
                    let _ = etx.send(());
                },
            )
            .unwrap();
        (id, rx, erx)
    }

    fn read_until(rx: &mpsc::Receiver<String>, needle: &str) -> String {
        let mut out = String::new();
        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        while !out.contains(needle) {
            let left = deadline.saturating_duration_since(std::time::Instant::now());
            match rx.recv_timeout(left) {
                Ok(chunk) => out.push_str(&chunk),
                Err(_) => panic!("não chegou {needle:?}; saída até agora: {out:?}"),
            }
        }
        out
    }

    #[cfg(unix)]
    #[test]
    fn abre_o_shell_na_pasta_do_projeto_e_executa_comandos() {
        let dir = tempfile::tempdir().unwrap();
        let terms = Terminals::default();
        let (id, rx, exited) = open(&terms, "/bin/sh", dir.path());
        terms.write(id, "echo batide-$((40+2)); pwd\n").unwrap();
        let cwd = dir.path().canonicalize().unwrap();
        let cwd = cwd.to_str().unwrap();
        let mut out = read_until(&rx, "batide-42");
        if !out.contains(cwd) {
            out.push_str(&read_until(&rx, cwd));
        }
        assert!(out.contains("batide-42") && out.contains(cwd));

        terms.write(id, "exit\n").unwrap();
        exited.recv_timeout(Duration::from_secs(10)).expect("o fim do terminal deveria ser avisado");
    }

    #[cfg(unix)]
    #[test]
    fn redimensiona_e_encerra() {
        let dir = tempfile::tempdir().unwrap();
        let terms = Terminals::default();
        let (id, rx, exited) = open(&terms, "/bin/sh", dir.path());
        terms.resize(id, 120, 40).unwrap();
        terms.write(id, "stty size\n").unwrap();
        read_until(&rx, "40 120");

        terms.kill(id).unwrap();
        exited.recv_timeout(Duration::from_secs(10)).unwrap();
        assert!(terms.write(id, "echo x\n").is_err(), "terminal encerrado não aceita mais entrada");
    }

    #[test]
    fn id_desconhecido_da_erro() {
        let terms = Terminals::default();
        assert!(terms.write(99, "x").is_err());
        assert!(terms.resize(99, 1, 1).is_err());
        assert!(terms.kill(99).is_err());
    }

    #[test]
    fn shell_padrao_existe() {
        assert!(!default_shell().is_empty());
    }

    #[test]
    fn utf8_dividido_entre_pedacos_nao_vira_lixo() {
        let bytes = "ação ✓".as_bytes();
        let mut dec = Utf8Stream::default();
        let mut out = String::new();
        for chunk in bytes.chunks(1) {
            out.push_str(&dec.push(chunk));
        }
        assert_eq!(out, "ação ✓");
    }
}
