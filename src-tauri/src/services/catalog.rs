//! Indexado de la biblioteca local.
//!
//! La extraccion de metadatos se hace con el ffmpeg que ya viaja dentro de la
//! aplicacion, de modo que no hace falta anadir dependencias de decodificacion.
//! Para cada archivo se lanza `ffmpeg -i <ruta>` (que escribe la informacion en
//! stderr y termina con codigo 1 al no haber salida) y se parsea el bloque
//! Metadata + la linea Duration.
//!
//! El escaneo se paraleliza en varios hilos y emite progreso a la interfaz.

use super::store::Track;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "flac", "opus", "m4a", "wav", "ogg", "oga", "aac", "wma", "aiff", "aif", "alac", "m4b",
];

pub fn is_audio_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .map(|e| AUDIO_EXTENSIONS.contains(&e.as_str()))
        .unwrap_or(false)
}

fn silent(exe: &str) -> std::process::Command {
    let mut cmd = std::process::Command::new(exe);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

#[derive(Debug, Default, Clone)]
pub struct ProbeInfo {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub date: Option<String>,
    pub duration: Option<f64>,
    pub bitrate_kbps: Option<u32>,
    pub has_cover: bool,
}

/// Identificador estable derivado de la ruta (FNV-1a de 64 bits).
/// Evita duplicar pistas cuando se re-escanea la misma carpeta.
pub fn stable_id(path: &Path) -> String {
    let normalized = path
        .to_string_lossy()
        .replace('\\', "/")
        .to_ascii_lowercase();
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in normalized.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("loc-{hash:016x}")
}

fn parse_duration(raw: &str) -> Option<f64> {
    // Formato: HH:MM:SS.cc
    let cleaned = raw.trim().trim_end_matches(',');
    let parts: Vec<&str> = cleaned.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let hours: f64 = parts[0].parse().ok()?;
    let minutes: f64 = parts[1].parse().ok()?;
    let seconds: f64 = parts[2].parse().ok()?;
    Some(hours * 3600.0 + minutes * 60.0 + seconds)
}

/// Lee metadatos de un archivo de audio usando ffmpeg.
pub fn probe(ffmpeg: &str, path: &Path) -> ProbeInfo {
    let mut info = ProbeInfo::default();
    if ffmpeg.is_empty() {
        return info;
    }

    let output = silent(ffmpeg)
        .args(["-hide_banner", "-nostdin", "-i"])
        .arg(path)
        .output();

    let output = match output {
        Ok(o) => o,
        Err(_) => return info,
    };

    let text = String::from_utf8_lossy(&output.stderr);
    let mut in_metadata = false;
    let mut in_streams = false;

    for line in text.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with("Duration:") {
            if let Some(rest) = trimmed.strip_prefix("Duration:") {
                let duration_part = rest.split(',').next().unwrap_or("").trim();
                info.duration = parse_duration(duration_part);
            }
            if let Some(idx) = trimmed.find("bitrate:") {
                let rest = &trimmed[idx + "bitrate:".len()..];
                if let Some(value) = rest.split_whitespace().next() {
                    info.bitrate_kbps = value.parse().ok();
                }
            }
            in_metadata = false;
            continue;
        }

        if trimmed.starts_with("Stream #") {
            in_streams = true;
            in_metadata = false;
            if trimmed.contains("Video:") {
                info.has_cover = true;
            }
            continue;
        }

        if trimmed == "Metadata:" {
            in_metadata = true;
            continue;
        }

        if in_streams && !line.starts_with(' ') {
            in_streams = false;
        }

        if in_metadata {
            // Las entradas de metadatos van sangradas y usan "clave : valor".
            if !line.starts_with(' ') {
                in_metadata = false;
                continue;
            }
            if let Some(idx) = line.find(':') {
                let key = line[..idx].trim().to_ascii_lowercase();
                let value = line[idx + 1..].trim().to_string();
                if value.is_empty() {
                    continue;
                }
                match key.as_str() {
                    "title" | "tit2" => info.title = Some(value),
                    "artist" | "tpe1" | "album_artist" => {
                        if info.artist.is_none() || key == "artist" || key == "tpe1" {
                            info.artist = Some(value);
                        }
                    }
                    "album" | "talb" => info.album = Some(value),
                    "date" | "year" | "tdrc" => info.date = Some(value),
                    _ => {}
                }
            }
        }
    }

    info
}

/// Extrae la caratula incrustada a la cache de caratulas.
pub fn extract_cover(ffmpeg: &str, source: &Path, covers_dir: &Path) -> Option<PathBuf> {
    if ffmpeg.is_empty() {
        return None;
    }
    let id = stable_id(source);
    let target = covers_dir.join(format!("{id}.jpg"));
    if target.is_file() {
        return Some(target);
    }
    std::fs::create_dir_all(covers_dir).ok()?;

    let status = silent(ffmpeg)
        .args([
            "-hide_banner",
            "-nostdin",
            "-loglevel",
            "error",
            "-y",
            "-i",
        ])
        .arg(source)
        .args([
            "-map",
            "0:v:0",
            "-frames:v",
            "1",
            "-q:v",
            "3",
            "-f",
            "image2",
        ])
        .arg(&target)
        .status();

    match status {
        Ok(s) if s.success() && target.is_file() => Some(target),
        _ => {
            let _ = std::fs::remove_file(&target);
            None
        }
    }
}

pub struct ScanOutcome {
    pub tracks: Vec<Track>,
}

/// Recorre una carpeta y construye las pistas con metadatos reales.
pub fn scan(
    ffmpeg: &str,
    dir: &Path,
    recursive: bool,
    covers_dir: &Path,
    on_progress: impl Fn(usize, usize) + Send + Sync + 'static,
) -> ScanOutcome {
    let mut files: Vec<PathBuf> = Vec::new();
    let depth = if recursive { usize::MAX } else { 1 };

    for entry in walkdir::WalkDir::new(dir)
        .max_depth(depth)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
    {
        if entry.file_type().is_file() && is_audio_file(entry.path()) {
            files.push(entry.path().to_path_buf());
        }
    }

    let total = files.len();
    if total == 0 {
        return ScanOutcome {
            tracks: Vec::new(),
        };
    }

    let queue = Arc::new(Mutex::new(files));
    let results: Arc<Mutex<Vec<Track>>> = Arc::new(Mutex::new(Vec::with_capacity(total)));
    let done = Arc::new(AtomicUsize::new(0));
    let on_progress = Arc::new(on_progress);

    // El probe con ffmpeg es costoso: se usa un pool de hilos acotado.
    let workers = std::thread::available_parallelism()
        .map(|n| n.get().clamp(2, 6))
        .unwrap_or(4);

    let mut handles = Vec::new();
    for _ in 0..workers {
        let queue = Arc::clone(&queue);
        let results = Arc::clone(&results);
        let done = Arc::clone(&done);
        let on_progress = Arc::clone(&on_progress);
        let ffmpeg = ffmpeg.to_string();
        let covers_dir = covers_dir.to_path_buf();

        handles.push(std::thread::spawn(move || {
            loop {
                let next = {
                    let mut guard = queue.lock().unwrap_or_else(|e| e.into_inner());
                    guard.pop()
                };
                let Some(path) = next else { break };

                let info = probe(&ffmpeg, &path);
                let metadata = std::fs::metadata(&path).ok();
                let size = metadata.as_ref().map(|m| m.len());
                let added_at = metadata
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as i64);

                let extension = path
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_ascii_uppercase();

                let file_stem = path
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default();

                let cover_path = if info.has_cover {
                    extract_cover(&ffmpeg, &path, &covers_dir)
                } else {
                    None
                };

                let track = Track {
                    id: stable_id(&path),
                    title: info.title.clone().unwrap_or_else(|| file_stem.clone()),
                    artist: info
                        .artist
                        .clone()
                        .unwrap_or_else(|| "Artista desconocido".to_string()),
                    album: info.album.clone(),
                    duration_seconds: info.duration,
                    path: Some(path.to_string_lossy().to_string()),
                    youtube_id: None,
                    downloaded: true,
                    is_favorite: false,
                    artwork_url: None,
                    file_size_bytes: size,
                    format: Some(extension),
                    added_at,
                    playlist_url: None,
                    cover_path: cover_path.map(|p| p.to_string_lossy().to_string()),
                };

                results
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .push(track);

                let processed = done.fetch_add(1, Ordering::Relaxed) + 1;
                on_progress(processed, total);
            }
        }));
    }

    for handle in handles {
        let _ = handle.join();
    }

    let mut tracks = Arc::try_unwrap(results)
        .map(|m| m.into_inner().unwrap_or_else(|e| e.into_inner()))
        .unwrap_or_default();
    tracks.sort_by(|a, b| b.added_at.unwrap_or(0).cmp(&a.added_at.unwrap_or(0)));

    ScanOutcome { tracks }
}
