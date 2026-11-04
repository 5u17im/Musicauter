//! Motor de extraccion y descarga basado en yt-dlp + ffmpeg.
//!
//! Diferencias clave frente a la version anterior:
//!  * El progreso es REAL: se pide a yt-dlp una plantilla de progreso legible
//!    (`--progress-template`) y se emite un evento por cada actualizacion.
//!  * La ruta final del archivo la devuelve yt-dlp
//!    (`--print after_move:filepath`), no una heuristica de "archivo mas
//!    reciente", que con descargas en paralelo asignaba rutas equivocadas.
//!  * Las descargas se pueden cancelar (se mata el arbol de procesos).
//!  * No hay tiempo de espera artificial: antes se abortaba a los 45 segundos
//!    y cualquier descarga real fallaba.

use super::store::Store;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const PROGRESS_PREFIX: &str = "AUDIONAVE_PROGRESS|";
const FILE_PREFIX: &str = "AUDIONAVE_FILE|";

fn silent(exe: &str) -> Command {
    let mut cmd = Command::new(exe);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

// ---------------------------------------------------------------------------
// Estado del motor
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct DownloadEngine {
    /// id de descarga -> pid del proceso yt-dlp
    running: Mutex<HashMap<String, u32>>,
    cancelled: Mutex<HashSet<String>>,
}

impl DownloadEngine {
    fn register(&self, id: &str, pid: u32) {
        self.running
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(id.to_string(), pid);
    }

    fn unregister(&self, id: &str) {
        self.running
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(id);
    }

    fn clear_cancel(&self, id: &str) {
        self.cancelled
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(id);
    }

    fn is_cancelled(&self, id: &str) -> bool {
        self.cancelled
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .contains(id)
    }

    /// Marca como cancelada y mata el arbol de procesos si sigue vivo.
    pub fn cancel(&self, id: &str) -> bool {
        self.cancelled
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(id.to_string());

        let pid = self
            .running
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(id)
            .copied();

        match pid {
            Some(pid) => {
                // /T mata tambien los procesos hijo (ffmpeg).
                let _ = silent("taskkill")
                    .args(["/PID", &pid.to_string(), "/T", "/F"])
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status();
                true
            }
            None => false,
        }
    }

    /// Devuelve true si habia procesos activos.
    pub fn cancel_all(&self) -> bool {
        let ids: Vec<String> = self
            .running
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .keys()
            .cloned()
            .collect();
        let had = !ids.is_empty();
        for id in ids {
            self.cancel(&id);
        }
        had
    }
}

// ---------------------------------------------------------------------------
// Tipos compartidos con el frontend
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct BackendStatus {
    pub ok: bool,
    pub message: String,
    pub has_ytdlp: bool,
    pub has_ffmpeg: bool,
    pub ytdlp_version: Option<String>,
    pub music_dir: String,
    pub data_dir: String,
    pub tracks_count: usize,
    /// Base del servidor de medios local: http://127.0.0.1:<puerto>
    pub media_base: String,
    /// Token de sesion exigido por el servidor de medios.
    pub media_token: String,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DownloadRequest {
    pub id: String,
    pub url: String,
    #[serde(default)]
    pub output_dir: Option<String>,
    #[serde(default)]
    pub format: Option<String>,
    #[serde(default)]
    pub auth: Option<String>,
    #[serde(default)]
    pub browser: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub id: String,
    pub stage: String,
    pub percent: f64,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed: Option<String>,
    pub eta: Option<String>,
    pub message: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DownloadOutcome {
    pub id: String,
    pub ok: bool,
    pub cancelled: bool,
    pub file_path: Option<String>,
    pub error: Option<String>,
}

fn human_bytes(bytes: f64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut value = bytes;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    format!("{value:.1} {}", UNITS[unit])
}

fn human_speed(bytes_per_second: f64) -> String {
    format!("{}/s", human_bytes(bytes_per_second))
}

fn human_eta(seconds: f64) -> String {
    if !seconds.is_finite() || seconds < 0.0 {
        return String::new();
    }
    let total = seconds as u64;
    format!("{:02}:{:02}", total / 60, total % 60)
}

fn parse_number(raw: &str) -> Option<f64> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("NA") || trimmed.eq_ignore_ascii_case("none") {
        return None;
    }
    trimmed.parse::<f64>().ok()
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

pub fn ytdlp_version(ytdlp: &str) -> Option<String> {
    if ytdlp.is_empty() {
        return None;
    }
    let output = silent(ytdlp).arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if version.is_empty() {
        None
    } else {
        Some(version)
    }
}

/// Actualiza yt-dlp en su sitio. Funciona porque el binario vive en
/// %APPDATA% (escribible) y no en la carpeta de instalacion.
pub fn update_ytdlp(ytdlp: &str) -> Result<String, String> {
    if ytdlp.is_empty() {
        return Err("No se encontro yt-dlp".into());
    }
    let output = silent(ytdlp)
        .arg("-U")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("No se pudo ejecutar la actualizacion: {e}"))?;

    let mut text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        text = String::from_utf8_lossy(&output.stderr).trim().to_string();
    }
    if output.status.success() {
        Ok(if text.is_empty() {
            "yt-dlp ya esta en la ultima version".into()
        } else {
            text
        })
    } else {
        Err(if text.is_empty() {
            "La actualizacion de yt-dlp fallo".into()
        } else {
            text
        })
    }
}

fn run_ytdlp_json(ytdlp: &str, args: &[String]) -> Result<String, String> {
    let output = silent(ytdlp)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("No se pudo ejecutar yt-dlp: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    if output.status.success() && !stdout.trim().is_empty() {
        return Ok(stdout);
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(if stderr.is_empty() {
        "yt-dlp no devolvio informacion".to_string()
    } else {
        stderr
    })
}

/// Obtiene la URL directa del stream de audio para reproduccion inmediata.
pub fn get_stream_url(ytdlp: &str, url: &str) -> Result<String, String> {
    if ytdlp.is_empty() {
        return Err("Motor de extraccion no disponible".into());
    }
    let args = vec![
        "-g".to_string(),
        "-f".to_string(),
        "bestaudio/best".to_string(),
        "--no-warnings".to_string(),
        "--no-playlist".to_string(),
        url.to_string(),
    ];
    let stdout = run_ytdlp_json(ytdlp, &args)?;
    stdout
        .lines()
        .map(str::trim)
        .find(|line| line.starts_with("http://") || line.starts_with("https://"))
        .map(str::to_string)
        .ok_or_else(|| "YouTube no devolvio una URL de audio reproducible".to_string())
}

fn cookie_args(auth: Option<&str>, browser: Option<&str>) -> Vec<String> {
    match (auth, browser) {
        (Some("browser"), Some(b)) if !b.is_empty() => {
            vec!["--cookies-from-browser".to_string(), b.to_string()]
        }
        _ => Vec::new(),
    }
}

/// Inspecciona una playlist o un video concreto.
pub fn scan_playlist(
    ytdlp: &str,
    url: &str,
    auth: Option<&str>,
    browser: Option<&str>,
    limit: usize,
) -> Result<String, String> {
    if ytdlp.is_empty() {
        return Err("Motor de extraccion no disponible".into());
    }

    let base_args = |with_cookies: bool| {
        let mut args = vec![
            "--dump-single-json".to_string(),
            "--no-warnings".to_string(),
            "--quiet".to_string(),
            "--flat-playlist".to_string(),
            "--playlist-items".to_string(),
            format!("1-{limit}"),
        ];
        if with_cookies {
            args.extend(cookie_args(auth, browser));
        }
        args.push(url.to_string());
        args
    };

    let use_cookies = auth == Some("browser");
    match run_ytdlp_json(ytdlp, &base_args(use_cookies)) {
        Ok(json) => Ok(json),
        Err(first_error) => {
            if use_cookies {
                // Reintento sin cookies: muchos perfiles estan bloqueados por el
                // navegador abierto y el error no es accionable para el usuario.
                if let Ok(json) = run_ytdlp_json(ytdlp, &base_args(false)) {
                    return Ok(json);
                }
            }
            Err(first_error)
        }
    }
}

/// Busca en YouTube.
pub fn search(ytdlp: &str, query: &str, limit: usize) -> Result<String, String> {
    if ytdlp.is_empty() {
        return Err("Motor de extraccion no disponible".into());
    }
    let args = vec![
        format!("ytsearch{limit}:{}", query.trim()),
        "--flat-playlist".to_string(),
        "--dump-single-json".to_string(),
        "--no-warnings".to_string(),
        "--quiet".to_string(),
    ];
    run_ytdlp_json(ytdlp, &args)
}

/// Mezcla automatica de YouTube ("mix") a partir de un video.
/// Es una recomendacion real de YouTube, no una lista inventada.
pub fn mix(ytdlp: &str, video_id: &str, limit: usize) -> Result<String, String> {
    let url = format!("https://www.youtube.com/watch?v={video_id}&list=RD{video_id}");
    scan_playlist(ytdlp, &url, None, None, limit)
}

// ---------------------------------------------------------------------------
// Descarga con progreso real y cancelacion
// ---------------------------------------------------------------------------

pub struct DownloadOutcomeInternal {
    pub ok: bool,
    pub cancelled: bool,
    pub file_path: Option<String>,
    pub error: Option<String>,
}

#[allow(clippy::too_many_arguments)]
pub fn download(
    app: &AppHandle,
    engine: &DownloadEngine,
    store: &Store,
    ytdlp: &str,
    ffmpeg: &str,
    request: &DownloadRequest,
) -> DownloadOutcomeInternal {
    let id = request.id.clone();
    if ytdlp.is_empty() {
        return DownloadOutcomeInternal {
            ok: false,
            cancelled: false,
            file_path: None,
            error: Some("Motor de extraccion no disponible".into()),
        };
    }

    let target_dir: PathBuf = match request.output_dir.as_deref() {
        Some(dir) if !dir.trim().is_empty() => super::paths::normalize_user_path(dir),
        _ => store.music_dir(),
    };

    if let Err(e) = super::shell::ensure_dir(&target_dir) {
        return DownloadOutcomeInternal {
            ok: false,
            cancelled: false,
            file_path: None,
            error: Some(e),
        };
    }

    let audio_format = request
        .format
        .clone()
        .filter(|f| !f.trim().is_empty())
        .unwrap_or_else(|| "mp3".to_string());

    let target_slash = target_dir.to_string_lossy().replace('\\', "/");

    let mut args: Vec<String> = vec![
        "-x".into(),
        "--audio-format".into(),
        audio_format,
        "--audio-quality".into(),
        "0".into(),
        "--embed-thumbnail".into(),
        "--embed-metadata".into(),
        "--no-playlist".into(),
        "--newline".into(),
        "--no-simulate".into(),
        "--progress".into(),
        "--progress-template".into(),
        format!(
            "download:{PROGRESS_PREFIX}%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s"
        ),
        "--print".into(),
        format!("after_move:{FILE_PREFIX}%(filepath)s"),
        "--print".into(),
        format!("{FILE_PREFIX}%(filepath)s"),
        "--windows-filenames".into(),
        "--no-warnings".into(),
        "--socket-timeout".into(),
        "20".into(),
        "--retries".into(),
        "5".into(),
        "--fragment-retries".into(),
        "5".into(),
        "--concurrent-fragments".into(),
        "4".into(),
        "-o".into(),
        format!("{target_slash}/%(title)s.%(ext)s"),
    ];

    if !ffmpeg.is_empty() {
        if let Some(parent) = Path::new(ffmpeg).parent() {
            args.push("--ffmpeg-location".into());
            args.push(parent.to_string_lossy().to_string());
        }
    }
    args.extend(cookie_args(
        request.auth.as_deref(),
        request.browser.as_deref(),
    ));
    args.push(request.url.clone());

    let emit = |progress: DownloadProgress| {
        let _ = app.emit("download://progress", progress);
    };

    emit(DownloadProgress {
        id: id.clone(),
        stage: "starting".into(),
        percent: 0.0,
        downloaded_bytes: 0,
        total_bytes: 0,
        speed: None,
        eta: None,
        message: Some("Conectando con YouTube".into()),
    });

    engine.clear_cancel(&id);

    let mut child = match silent(ytdlp)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(e) => {
            return DownloadOutcomeInternal {
                ok: false,
                cancelled: false,
                file_path: None,
                error: Some(format!("No se pudo iniciar la descarga: {e}")),
            }
        }
    };

    let pid = child.id();
    engine.register(&id, pid);

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    // stderr se drena en un hilo aparte para evitar interbloqueo si se llena.
    let err_handle = stderr.map(|stderr| {
        std::thread::spawn(move || {
            let mut buffer = String::new();
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                buffer.push_str(&line);
                buffer.push('\n');
            }
            buffer
        })
    });

    let mut final_path: Option<String> = None;
    let mut last_emit = std::time::Instant::now();
    let mut last_percent = -1.0_f64;
    let mut reached_end = false;

    if let Some(stdout) = stdout {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Some(rest) = line.strip_prefix(PROGRESS_PREFIX) {
                let parts: Vec<&str> = rest.split('|').collect();
                let downloaded = parts.first().and_then(|v| parse_number(v)).unwrap_or(0.0);
                let total_explicit = parts.get(1).and_then(|v| parse_number(v));
                let total_estimate = parts.get(2).and_then(|v| parse_number(v));
                let speed = parts.get(3).and_then(|v| parse_number(v));
                let eta = parts.get(4).and_then(|v| parse_number(v));

                let total = total_explicit.or(total_estimate).unwrap_or(0.0);
                let percent = if total > 0.0 {
                    (downloaded / total * 100.0).clamp(0.0, 100.0)
                } else {
                    0.0
                };

                if percent >= 99.5 && total > 0.0 {
                    reached_end = true;
                }

                // Limitamos la frecuencia de eventos para no saturar el WebView.
                let should_emit = last_percent < 0.0
                    || (percent - last_percent).abs() >= 0.5
                    || last_emit.elapsed().as_millis() >= 400
                    || percent >= 100.0;

                if should_emit {
                    last_emit = std::time::Instant::now();
                    last_percent = percent;
                    emit(DownloadProgress {
                        id: id.clone(),
                        stage: if reached_end && percent >= 100.0 {
                            "converting".into()
                        } else {
                            "downloading".into()
                        },
                        percent,
                        downloaded_bytes: downloaded as u64,
                        total_bytes: total as u64,
                        speed: speed.map(human_speed),
                        eta: eta.map(human_eta).filter(|s| !s.is_empty()),
                        message: None,
                    });
                }
            } else if let Some(rest) = line.strip_prefix(FILE_PREFIX) {
                let candidate = rest.trim().to_string();
                if !candidate.is_empty() && Path::new(&candidate).is_file() {
                    final_path = Some(candidate);
                }
            }
        }
    }

    let status = child.wait();
    let stderr_text = err_handle
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default();

    engine.unregister(&id);

    if engine.is_cancelled(&id) {
        engine.clear_cancel(&id);
        emit(DownloadProgress {
            id: id.clone(),
            stage: "cancelled".into(),
            percent: 0.0,
            downloaded_bytes: 0,
            total_bytes: 0,
            speed: None,
            eta: None,
            message: Some("Descarga cancelada".into()),
        });
        return DownloadOutcomeInternal {
            ok: false,
            cancelled: true,
            file_path: None,
            error: None,
        };
    }

    let success = matches!(&status, Ok(s) if s.success());

    if success {
        // Red de seguridad: si --print no emitio nada, se busca un archivo
        // creado recientemente y que coincida con el formato pedido.
        if final_path.is_none() {
            final_path = newest_audio_since(&target_dir, std::time::SystemTime::now());
        }

        emit(DownloadProgress {
            id: id.clone(),
            stage: "finished".into(),
            percent: 100.0,
            downloaded_bytes: 0,
            total_bytes: 0,
            speed: None,
            eta: None,
            message: Some("Descarga completada".into()),
        });

        DownloadOutcomeInternal {
            ok: true,
            cancelled: false,
            file_path: final_path,
            error: None,
        }
    } else {
        let clean = stderr_text.trim();
        let error = if clean.is_empty() {
            "yt-dlp no pudo completar la descarga".to_string()
        } else {
            // Se conservan las ultimas lineas, que son las que explican el fallo.
            clean
                .lines()
                .rev()
                .take(6)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join("\n")
        };

        emit(DownloadProgress {
            id: id.clone(),
            stage: "error".into(),
            percent: 0.0,
            downloaded_bytes: 0,
            total_bytes: 0,
            speed: None,
            eta: None,
            message: Some(error.clone()),
        });

        DownloadOutcomeInternal {
            ok: false,
            cancelled: false,
            file_path: None,
            error: Some(error),
        }
    }
}

/// Ultimo archivo de audio creado en la carpeta desde el instante indicado.
fn newest_audio_since(dir: &Path, since: std::time::SystemTime) -> Option<String> {
    let mut best: Option<(std::time::SystemTime, String)> = None;
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() || !super::catalog::is_audio_file(&path) {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let Ok(modified) = meta.modified() else { continue };
        if modified < since {
            continue;
        }
        match &best {
            Some((best_time, _)) if *best_time >= modified => {}
            _ => best = Some((modified, path.to_string_lossy().to_string())),
        }
    }
    best.map(|(_, path)| path)
}
