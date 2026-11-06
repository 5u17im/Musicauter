//! Chequeo de integridad del sistema.
//!
//! Cada comprobacion devuelve un resultado con estado (`ok`, `warn`, `error`),
//! un detalle legible y, si procede, una accion de reparacion que la interfaz
//! puede lanzar con `repair`.

use super::{paths, store::Store, yt};
use serde::Serialize;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::path::Path;
use std::time::Duration;
use tauri::AppHandle;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheck {
    pub id: &'static str,
    pub label: &'static str,
    /// `ok`, `warn` o `error`.
    pub status: &'static str,
    pub detail: String,
    /// Texto del boton de reparacion, si existe una accion automatica.
    pub repair: Option<&'static str>,
}

fn check(
    id: &'static str,
    label: &'static str,
    status: &'static str,
    detail: impl Into<String>,
    repair: Option<&'static str>,
) -> HealthCheck {
    HealthCheck {
        id,
        label,
        status,
        detail: detail.into(),
        repair,
    }
}

fn format_bytes(bytes: u64) -> String {
    const UNITS: [&str; 4] = ["B", "KB", "MB", "GB"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} B")
    } else {
        format!("{value:.1} {}", UNITS[unit])
    }
}

// ---------------------------------------------------------------------------
// Comprobaciones individuales
// ---------------------------------------------------------------------------

fn check_ytdlp(app: &AppHandle) -> HealthCheck {
    let path = paths::ytdlp(app);
    if path.is_empty() || !Path::new(&path).is_file() {
        return check(
            "ytdlp",
            "Extractor yt-dlp",
            "error",
            "No se encuentra yt-dlp.exe. Sin el no se puede buscar ni descargar. Reinstala Audionave o ejecuta scripts/fetch-binaries.ps1.",
            None,
        );
    }
    match yt::ytdlp_version(&path) {
        Some(version) => check("ytdlp", "Extractor yt-dlp", "ok", format!("Version {version}"), None),
        None => check(
            "ytdlp",
            "Extractor yt-dlp",
            "error",
            "yt-dlp existe pero no se ejecuta (archivo danado o bloqueado por el antivirus).",
            None,
        ),
    }
}

fn check_ffmpeg(app: &AppHandle) -> HealthCheck {
    let path = paths::ffmpeg(app);
    if path.is_empty() || !Path::new(&path).is_file() {
        return check(
            "ffmpeg",
            "Conversor ffmpeg",
            "error",
            "No se encuentra ffmpeg.exe. Hace falta para convertir audio y leer metadatos.",
            None,
        );
    }
    let mut command = std::process::Command::new(&path);
    command.arg("-version");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    match command.output() {
        Ok(output) if output.status.success() => {
            let first = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or("ffmpeg")
                .to_string();
            check("ffmpeg", "Conversor ffmpeg", "ok", first, None)
        }
        Ok(output) => check(
            "ffmpeg",
            "Conversor ffmpeg",
            "error",
            format!("ffmpeg termino con error (codigo {:?}).", output.status.code()),
            None,
        ),
        Err(error) => check(
            "ffmpeg",
            "Conversor ffmpeg",
            "error",
            format!("ffmpeg no se pudo ejecutar: {error}"),
            None,
        ),
    }
}

fn check_data_files(store: &Store) -> HealthCheck {
    let mut problems = Vec::new();
    let mut total_bytes = 0u64;

    for (name, path) in store.data_files() {
        match std::fs::read_to_string(path) {
            Ok(raw) => {
                total_bytes += raw.len() as u64;
                if serde_json::from_str::<serde_json::Value>(&raw).is_err() {
                    problems.push(format!("{name} esta corrupto"));
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                problems.push(format!("{name} no existe en disco"));
            }
            Err(error) => problems.push(format!("{name} no se puede leer: {error}")),
        }
    }

    if problems.is_empty() {
        check(
            "data-files",
            "Archivos de datos",
            "ok",
            format!("library, downloads y settings legibles ({})", format_bytes(total_bytes)),
            None,
        )
    } else {
        check(
            "data-files",
            "Archivos de datos",
            "error",
            format!("{}. El estado en memoria es correcto y se puede reescribir.", problems.join("; ")),
            Some("Reescribir desde memoria"),
        )
    }
}

fn check_missing_files(store: &Store) -> HealthCheck {
    let missing = store.missing_files();
    if missing.is_empty() {
        let total = store.tracks().iter().filter(|t| t.downloaded).count();
        return check(
            "missing-files",
            "Archivos de la biblioteca",
            "ok",
            format!("{total} pistas descargadas, todas presentes en disco"),
            None,
        );
    }
    let sample: Vec<String> = missing.iter().take(3).map(|t| t.title.clone()).collect();
    check(
        "missing-files",
        "Archivos de la biblioteca",
        "warn",
        format!(
            "{} pistas apuntan a archivos que ya no existen (p. ej. {}). Pasaran a streaming si vienen de YouTube; el resto se quita del indice.",
            missing.len(),
            sample.join(", ")
        ),
        Some("Depurar pistas sin archivo"),
    )
}

#[cfg(target_os = "windows")]
fn free_space(path: &Path) -> Option<u64> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut available = 0u64;
    unsafe {
        GetDiskFreeSpaceExW(PCWSTR(wide.as_ptr()), Some(&mut available), None, None).ok()?;
    }
    Some(available)
}

#[cfg(not(target_os = "windows"))]
fn free_space(_path: &Path) -> Option<u64> {
    None
}

fn check_music_dir(store: &Store) -> HealthCheck {
    let dir = store.music_dir();
    if !dir.is_dir() {
        return check(
            "music-dir",
            "Carpeta de musica",
            "error",
            format!("{} no existe.", dir.display()),
            Some("Crear la carpeta"),
        );
    }

    let probe = dir.join(".audionave-write-test");
    let writable = std::fs::write(&probe, b"ok").is_ok();
    let _ = std::fs::remove_file(&probe);
    if !writable {
        return check(
            "music-dir",
            "Carpeta de musica",
            "error",
            format!("No se puede escribir en {}. Las descargas fallaran.", dir.display()),
            None,
        );
    }

    match free_space(&dir) {
        Some(bytes) if bytes < 100 * 1024 * 1024 => check(
            "music-dir",
            "Carpeta de musica",
            "error",
            format!("Solo quedan {} libres en el disco.", format_bytes(bytes)),
            None,
        ),
        Some(bytes) if bytes < 1024 * 1024 * 1024 => check(
            "music-dir",
            "Carpeta de musica",
            "warn",
            format!("Quedan {} libres en el disco.", format_bytes(bytes)),
            None,
        ),
        Some(bytes) => check(
            "music-dir",
            "Carpeta de musica",
            "ok",
            format!("{} - {} libres", dir.display(), format_bytes(bytes)),
            None,
        ),
        None => check("music-dir", "Carpeta de musica", "ok", dir.display().to_string(), None),
    }
}

fn check_media_server(port: u16, token: &str) -> HealthCheck {
    if port == 0 || token.is_empty() {
        return check(
            "media-server",
            "Servidor de audio local",
            "error",
            "El servidor no arranco: las pistas locales no se podran reproducir.",
            None,
        );
    }

    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let result = TcpStream::connect_timeout(&address, Duration::from_millis(800)).and_then(|mut stream| {
        stream.set_read_timeout(Some(Duration::from_millis(800)))?;
        stream.write_all(
            format!("HEAD /{token}/__health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n").as_bytes(),
        )?;
        let mut buffer = [0u8; 64];
        let read = stream.read(&mut buffer)?;
        Ok(String::from_utf8_lossy(&buffer[..read]).to_string())
    });

    match result {
        // 404 = el servidor responde y valida el token; el archivo no existe.
        Ok(head) if head.starts_with("HTTP/1.1 404") || head.starts_with("HTTP/1.1 200") => check(
            "media-server",
            "Servidor de audio local",
            "ok",
            format!("Responde en 127.0.0.1:{port}"),
            None,
        ),
        Ok(head) => check(
            "media-server",
            "Servidor de audio local",
            "error",
            format!("Respuesta inesperada: {}", head.lines().next().unwrap_or("vacia")),
            None,
        ),
        Err(error) => check(
            "media-server",
            "Servidor de audio local",
            "error",
            format!("No responde en el puerto {port}: {error}. Reinicia Audionave."),
            None,
        ),
    }
}

fn check_network() -> HealthCheck {
    let reachable = "www.youtube.com:443"
        .to_socket_addrs()
        .ok()
        .and_then(|mut addrs| addrs.next())
        .map(|address| TcpStream::connect_timeout(&address, Duration::from_secs(3)).is_ok())
        .unwrap_or(false);

    if reachable {
        check("network", "Conexion a YouTube", "ok", "www.youtube.com accesible", None)
    } else {
        check(
            "network",
            "Conexion a YouTube",
            "warn",
            "Sin acceso a YouTube. La musica local funciona; la busqueda, el streaming y las descargas no.",
            None,
        )
    }
}

// ---------------------------------------------------------------------------
// API publica
// ---------------------------------------------------------------------------

/// Ejecuta todas las comprobaciones. Bloqueante: llamar desde `spawn_blocking`.
pub fn run(app: &AppHandle, store: &Store, media_port: u16, media_token: &str) -> Vec<HealthCheck> {
    vec![
        check_ytdlp(app),
        check_ffmpeg(app),
        check_data_files(store),
        check_missing_files(store),
        check_music_dir(store),
        check_media_server(media_port, media_token),
        check_network(),
    ]
}

/// Aplica la reparacion asociada a una comprobacion. Devuelve un resumen.
pub fn repair(id: &str, store: &Store) -> Result<String, String> {
    match id {
        "data-files" => {
            store.persist_all()?;
            Ok("Archivos de datos reescritos desde la memoria".into())
        }
        "missing-files" => {
            let (demoted, removed) = store.prune_missing_files()?;
            Ok(format!(
                "{demoted} pistas pasadas a streaming y {removed} eliminadas del indice"
            ))
        }
        "music-dir" => {
            let dir = store.music_dir();
            std::fs::create_dir_all(&dir)
                .map_err(|e| format!("No se pudo crear {}: {e}", dir.display()))?;
            Ok(format!("Carpeta creada: {}", dir.display()))
        }
        other => Err(format!("La comprobacion '{other}' no tiene reparacion automatica")),
    }
}

