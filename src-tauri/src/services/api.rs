// Audionave - Comandos Tauri v2
// Binarios internalizados: se resuelven automáticamente desde el directorio de recursos
// de la aplicación empaquetada (resource_dir). Fallback a rutas relativas para modo dev.
// Operaciones 100% asíncronas en hilos de trabajo independientes (spawn_blocking)
// con supresión total de consolas de comando (CREATE_NO_WINDOW) y streaming de audio en vivo.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Serialize, Deserialize, Clone)]
pub struct BackendStatus {
    pub ok: bool,
    pub msg: String,
    pub has_ytdlp: bool,
    pub has_ffmpeg: bool,
    pub default_music_dir: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DownloadResult {
    pub ok: bool,
    pub file_path: Option<String>,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct LocalAudioFile {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub extension: String,
}

/// Configura un proceso Command para ejecutarse completamente oculto sin ventana CMD
fn create_silent_command(exe: &str) -> Command {
    let mut cmd = Command::new(exe);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Resuelve la ruta a un binario auxiliar empaquetado dentro de la aplicación.
/// 1. Intenta resolver desde el directorio de recursos de Tauri (producción / instalador).
/// 2. Fallback a rutas relativas al CWD (modo desarrollo).
/// 3. Fallback al directorio del propio ejecutable (portable sin instalar).
/// Nunca produce errores en consola: todos los caminos se verifican silenciosamente.
fn resolve_binary(app: &tauri::AppHandle, bin_name: &str) -> String {
    // 1. Resolver desde resource_dir de Tauri (funciona en producción)
    if let Ok(resource_dir) = app.path().resource_dir() {
        let resource_path = resource_dir.join("binaries").join(bin_name);
        if resource_path.exists() {
            return resource_path.to_string_lossy().to_string();
        }
        // También buscar directamente en resource_dir (por si resources se aplana)
        let flat_path = resource_dir.join(bin_name);
        if flat_path.exists() {
            return flat_path.to_string_lossy().to_string();
        }
    }

    // 2. Resolver desde el directorio del ejecutable actual (modo portable)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let beside_exe = exe_dir.join("binaries").join(bin_name);
            if beside_exe.exists() {
                return beside_exe.to_string_lossy().to_string();
            }
            let flat_beside = exe_dir.join(bin_name);
            if flat_beside.exists() {
                return flat_beside.to_string_lossy().to_string();
            }
        }
    }

    // 3. Fallback a rutas relativas (modo desarrollo con cargo/npm)
    let dev_candidates = [
        format!("binaries/{}", bin_name),
        format!("src-tauri/binaries/{}", bin_name),
        format!("../src-tauri/binaries/{}", bin_name),
    ];
    for candidate in &dev_candidates {
        let path = Path::new(candidate);
        if path.exists() {
            return path.canonicalize()
                .unwrap_or_else(|_| path.to_path_buf())
                .to_string_lossy()
                .to_string();
        }
    }

    // Vacío si no se encontró (se maneja en cada comando sin panic)
    String::new()
}

#[tauri::command]
pub fn status(app: tauri::AppHandle) -> BackendStatus {
    let ytdlp_path = resolve_binary(&app, "yt-dlp.exe");
    let ffmpeg_path = resolve_binary(&app, "ffmpeg.exe");
    let music_dir = get_default_music_dir();

    BackendStatus {
        ok: !ytdlp_path.is_empty(),
        msg: if !ytdlp_path.is_empty() {
            "Motor de audio integrado y verificado".to_string()
        } else {
            "Componente de extracción no disponible".to_string()
        },
        has_ytdlp: !ytdlp_path.is_empty(),
        has_ffmpeg: !ffmpeg_path.is_empty(),
        default_music_dir: music_dir,
    }
}

/// Obtiene la URL directa del stream de audio para reproducción instantánea con sonido real
#[tauri::command]
pub async fn get_stream_url(app: tauri::AppHandle, url: String) -> Result<String, String> {
    let exe = resolve_binary(&app, "yt-dlp.exe");
    if exe.is_empty() {
        return Err("Motor de extracción no disponible".to_string());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let args = vec![
            "-g".to_string(),
            "-f".to_string(),
            "bestaudio/best".to_string(),
            "--no-warnings".to_string(),
            "--quiet".to_string(),
            url,
        ];

        let mut cmd = create_silent_command(&exe);
        match cmd.args(&args)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output()
        {
            Ok(o) => {
                if o.status.success() {
                    let out = String::from_utf8_lossy(&o.stdout).trim().to_string();
                    let stream_url = out.lines().next().unwrap_or("").trim().to_string();
                    if !stream_url.is_empty() {
                        Ok(stream_url)
                    } else {
                        Err("URL de stream vacía".to_string())
                    }
                } else {
                    let err = String::from_utf8_lossy(&o.stderr).trim().to_string();
                    Err(if err.is_empty() {
                        "No se pudo obtener el stream de audio".to_string()
                    } else {
                        err
                    })
                }
            }
            Err(e) => Err(format!("Error al ejecutar extractor: {}", e)),
        }
    })
    .await
    .unwrap_or_else(|e| Err(format!("Error interno: {}", e)))
}

/// Inspecciona una playlist o canción de manera 100% asíncrona sin bloquear la UI
#[tauri::command]
pub async fn scan_playlist(app: tauri::AppHandle, url: String, auth: String, browser: String) -> String {
    let exe = resolve_binary(&app, "yt-dlp.exe");
    if exe.is_empty() {
        return "{\"error\":\"Motor de extracción no disponible\"}".to_string();
    }

    tauri::async_runtime::spawn_blocking(move || {
        let run_scan = |use_cookies: bool| -> (bool, String, String) {
            let mut args = vec![
                "--dump-single-json".to_string(),
                "--no-warnings".to_string(),
                "--quiet".to_string(),
                "--flat-playlist".to_string(),
                "--playlist-items".to_string(),
                "1-300".to_string(),
            ];
            if use_cookies && auth == "browser" && !browser.is_empty() {
                args.push("--cookies-from-browser".to_string());
                args.push(browser.clone());
            }
            args.push(url.clone());

            let mut cmd = create_silent_command(&exe);
            match cmd.args(&args)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .output()
            {
                Ok(o) => {
                    let stdout = String::from_utf8_lossy(&o.stdout).to_string();
                    let stderr = String::from_utf8_lossy(&o.stderr).to_string();
                    (o.status.success(), stdout, stderr)
                }
                Err(e) => (false, String::new(), e.to_string()),
            }
        };

        // Intento 1
        let (ok, stdout, stderr) = run_scan(auth == "browser");
        if ok && !stdout.is_empty() {
            return stdout;
        }

        // Si falló por cookies de navegador bloqueadas, reintentar sin cookies
        if auth == "browser" {
            let (ok_retry, stdout_retry, stderr_retry) = run_scan(false);
            if ok_retry && !stdout_retry.is_empty() {
                return stdout_retry;
            }
            return format!("{{\"error\":{:?}}}", stderr_retry);
        }

        format!(
            "{{\"error\":{:?}}}",
            if stderr.is_empty() {
                "No se pudo obtener información del enlace".to_string()
            } else {
                stderr
            }
        )
    })
    .await
    .unwrap_or_else(|e| format!("{{\"error\":{:?}}}", e.to_string()))
}

/// Busca canciones en YouTube de forma asíncrona en segundo plano sin congelar la aplicación
#[tauri::command]
pub async fn search_youtube(app: tauri::AppHandle, query: String) -> String {
    let exe = resolve_binary(&app, "yt-dlp.exe");
    if exe.is_empty() || query.trim().is_empty() {
        return "{\"entries\":[]}".to_string();
    }

    tauri::async_runtime::spawn_blocking(move || {
        let search_term = format!("ytsearch12:{}", query.trim());
        let args = vec![
            search_term,
            "--flat-playlist".to_string(),
            "--dump-single-json".to_string(),
            "--no-warnings".to_string(),
            "--quiet".to_string(),
            "--default-search".to_string(),
            "ytsearch".to_string(),
        ];

        let mut cmd = create_silent_command(&exe);
        let out = cmd.args(&args)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output();
        match out {
            Ok(o) => {
                if o.status.success() {
                    String::from_utf8_lossy(&o.stdout).to_string()
                } else {
                    "{\"entries\":[]}".to_string()
                }
            }
            Err(_) => "{\"entries\":[]}".to_string(),
        }
    })
    .await
    .unwrap_or_else(|_| "{\"entries\":[]}".to_string())
}

/// Descarga una pista en un hilo de trabajo asíncrono dedicado
#[tauri::command]
pub async fn download_track(
    app: tauri::AppHandle,
    url: String,
    output_dir: Option<String>,
    format: Option<String>,
    auth: Option<String>,
    browser: Option<String>,
) -> DownloadResult {
    let ytdlp_exe = resolve_binary(&app, "yt-dlp.exe");
    if ytdlp_exe.is_empty() {
        return DownloadResult {
            ok: false,
            file_path: None,
            error: Some("Motor de extracción no disponible".to_string()),
        };
    }

    let ffmpeg_exe = resolve_binary(&app, "ffmpeg.exe");

    tauri::async_runtime::spawn_blocking(move || {
        let target_dir = output_dir.unwrap_or_else(get_default_music_dir);
        let _ = fs::create_dir_all(&target_dir);

        let audio_format = format.unwrap_or_else(|| "mp3".to_string());

        let run_download = |use_cookies: bool| -> (bool, String) {
            let mut args = vec![
                "-x".to_string(),
                "--audio-format".to_string(),
                audio_format.clone(),
                "--audio-quality".to_string(),
                "0".to_string(),
                "--embed-thumbnail".to_string(),
                "--embed-metadata".to_string(),
                "--concurrent-fragments".to_string(),
                "4".to_string(),
                "--no-playlist".to_string(),
                "--socket-timeout".to_string(),
                "15".to_string(),
                "--retries".to_string(),
                "2".to_string(),
                "--fragment-retries".to_string(),
                "2".to_string(),
                "--no-warnings".to_string(),
                "--quiet".to_string(),
                "-o".to_string(),
                format!("{}/%(title)s.%(ext)s", target_dir.replace('\\', "/")),
            ];

            if !ffmpeg_exe.is_empty() {
                if let Some(parent) = Path::new(&ffmpeg_exe).parent() {
                    args.push("--ffmpeg-location".to_string());
                    args.push(parent.to_string_lossy().to_string());
                }
            }

            if use_cookies {
                if let (Some(a), Some(b)) = (&auth, &browser) {
                    if a == "browser" && !b.is_empty() {
                        args.push("--cookies-from-browser".to_string());
                        args.push(b.clone());
                    }
                }
            }

            args.push(url.clone());

            let mut cmd = create_silent_command(&ytdlp_exe);
            match cmd.args(&args)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .output()
            {
                Ok(o) => {
                    if o.status.success() {
                        (true, String::new())
                    } else {
                        let err = String::from_utf8_lossy(&o.stderr).trim().to_string();
                        (false, err)
                    }
                }
                Err(e) => (false, e.to_string()),
            }
        };

        let has_cookies = auth.as_deref() == Some("browser");
        let (ok, err) = run_download(has_cookies);

        if ok {
            return DownloadResult {
                ok: true,
                file_path: Some(target_dir),
                error: None,
            };
        }

        // Si falló con cookies, reintento automático sin cookies
        if has_cookies {
            let (ok_retry, err_retry) = run_download(false);
            if ok_retry {
                return DownloadResult {
                    ok: true,
                    file_path: Some(target_dir),
                    error: None,
                };
            }
            return DownloadResult {
                ok: false,
                file_path: None,
                error: Some(if err_retry.is_empty() {
                    "Error de descarga".to_string()
                } else {
                    err_retry
                }),
            };
        }

        DownloadResult {
            ok: false,
            file_path: None,
            error: Some(if err.is_empty() {
                "Error de descarga".to_string()
            } else {
                err
            }),
        }
    })
    .await
    .unwrap_or_else(|e| DownloadResult {
        ok: false,
        file_path: None,
        error: Some(format!("Error interno: {}", e)),
    })
}

/// Abre una ruta en el explorador de archivos nativo
#[tauri::command]
pub fn open_folder(path: Option<String>) -> bool {
    let target = path.unwrap_or_else(get_default_music_dir);
    let _ = fs::create_dir_all(&target);

    #[cfg(target_os = "windows")]
    {
        create_silent_command("explorer").arg(&target).spawn().is_ok()
    }
    #[cfg(not(target_os = "windows"))]
    {
        create_silent_command("xdg-open").arg(&target).spawn().is_ok()
    }
}

/// Devuelve el directorio de música por defecto del usuario
#[tauri::command]
pub fn get_default_music_dir() -> String {
    if let Some(user_profile) = std::env::var_os("USERPROFILE") {
        let mut path = PathBuf::from(user_profile);
        path.push("Music");
        path.push("Audionave");
        return path.to_string_lossy().to_string();
    }
    if let Some(home) = std::env::var_os("HOME") {
        let mut path = PathBuf::from(home);
        path.push("Music");
        path.push("Audionave");
        return path.to_string_lossy().to_string();
    }
    "./Audionave_Music".to_string()
}

/// Lista los archivos de audio de una carpeta local
#[tauri::command]
pub fn list_local_audio(dir: Option<String>) -> Vec<LocalAudioFile> {
    let target = dir.unwrap_or_else(get_default_music_dir);
    let target_path = Path::new(&target);
    let mut results = Vec::new();

    if let Ok(entries) = fs::read_dir(target_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    if ["mp3", "flac", "opus", "m4a", "wav", "ogg", "aac"]
                        .contains(&ext_lower.as_str())
                    {
                        let name = path
                            .file_stem()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string();
                        let size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
                        results.push(LocalAudioFile {
                            path: path.to_string_lossy().to_string(),
                            name,
                            size_bytes,
                            extension: ext_lower,
                        });
                    }
                }
            }
        }
    }
    results
}