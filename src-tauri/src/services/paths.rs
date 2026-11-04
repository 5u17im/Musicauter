//! Resolucion de rutas nativas de Windows.
//!
//! Reglas:
//!  * Los datos de usuario viven en %APPDATA%\com.audionave.desktop (via Tauri).
//!  * Los binarios auxiliares (yt-dlp, ffmpeg) se copian a %APPDATA%\...\bin
//!    en el primer arranque. Esto es imprescindible para que `yt-dlp -U`
//!    pueda auto-actualizarse: el directorio de instalacion puede ser de solo
//!    lectura o estar bajo Program Files.
//!  * La carpeta de musica por defecto es la carpeta "Musica" del usuario
//!    (KNOWNFOLDERID_Music), nunca una cadena literal como "~/Musica".

use std::path::{Path, PathBuf};
use tauri::Manager;

/// Devuelve (y crea) el directorio de datos de la aplicacion.
pub fn app_data_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| fallback_data_dir());
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn fallback_data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Audionave")
}

/// Directorio donde se guardan los binarios actualizables.
pub fn bins_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app_data_dir(app).join("bin");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// Carpeta de musica por defecto del usuario, con subcarpeta propia.
pub fn default_music_dir() -> PathBuf {
    let base = dirs::audio_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("Audionave")
}

/// Directorio donde Tauri empaqueta los recursos (incluye binaries/).
pub fn resource_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().resource_dir().ok()
}

/// Localiza un binario dentro del bundle de la aplicacion, probando las
/// ubicaciones que Tauri usa segun configuracion y modo (dev / instalado).
pub fn bundled_binary(app: &tauri::AppHandle, name: &str) -> Option<PathBuf> {
    if let Some(res) = resource_dir(app) {
        for candidate in [
            res.join("binaries").join(name),
            res.join(name),
        ] {
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    // Modo desarrollo: rutas relativas al directorio de trabajo.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for candidate in [dir.join("binaries").join(name), dir.join(name)] {
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }

    let dev_candidates = [
        format!("binaries/{name}"),
        format!("src-tauri/binaries/{name}"),
        format!("../src-tauri/binaries/{name}"),
    ];
    for candidate in dev_candidates {
        let path = Path::new(&candidate);
        if path.is_file() {
            return Some(
                path.canonicalize().unwrap_or_else(|_| path.to_path_buf()),
            );
        }
    }

    None
}

/// Ruta de ffmpeg. NUNCA se copia: no necesita permisos de escritura y son
/// 139 MB que no tiene sentido duplicar en cada instalacion.
pub fn ffmpeg(app: &tauri::AppHandle) -> String {
    bundled_binary(app, "ffmpeg.exe")
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// Ruta de yt-dlp. Prefiere la copia escribible de %APPDATA% si ya existe;
/// si no, la del bundle. No copia nada: es una llamada barata apta para
/// cualquier comando.
pub fn ytdlp(app: &tauri::AppHandle) -> String {
    let staged = bins_dir(app).join("yt-dlp.exe");
    if staged.is_file() {
        return staged.to_string_lossy().to_string();
    }
    bundled_binary(app, "yt-dlp.exe")
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// Copia yt-dlp a la carpeta escribible de %APPDATA%.
///
/// Es imprescindible para que `yt-dlp -U` pueda reemplazar su propio ejecutable
/// (el directorio de instalacion puede ser de solo lectura).
///
/// Se copia a un fichero temporal y se renombra al final: asi nunca queda un
/// yt-dlp.exe a medias en el destino, y dos copias simultaneas no se pisan.
///
/// Es una operacion potencialmente lenta (17 MB): no debe llamarse desde el
/// hilo principal ni desde el arranque de la interfaz.
pub fn stage_ytdlp(app: &tauri::AppHandle) -> String {
    let staged = bins_dir(app).join("yt-dlp.exe");
    let Some(source) = bundled_binary(app, "yt-dlp.exe") else {
        return ytdlp(app);
    };

    let needs_copy = if staged.is_file() {
        let newer = match (
            std::fs::metadata(&source).and_then(|m| m.modified()),
            std::fs::metadata(&staged).and_then(|m| m.modified()),
        ) {
            (Ok(src_time), Ok(dst_time)) => src_time > dst_time,
            _ => false,
        };
        newer
    } else {
        true
    };

    if !needs_copy {
        return staged.to_string_lossy().to_string();
    }

    let temporary = staged.with_extension("exe.new");
    let started = std::time::Instant::now();

    match std::fs::copy(&source, &temporary) {
        Ok(written) => {
            // El rename sobre un fichero en uso puede fallar: en ese caso se
            // conserva la version anterior, que sigue siendo utilizable.
            let result = std::fs::rename(&temporary, &staged).or_else(|_| {
                std::fs::remove_file(&staged).and_then(|_| std::fs::rename(&temporary, &staged))
            });
            match result {
                Ok(_) => log::info!(
                    "yt-dlp preparado en AppData ({} bytes, {:.1}s): {}",
                    written,
                    started.elapsed().as_secs_f64(),
                    staged.display()
                ),
                Err(error) => {
                    let _ = std::fs::remove_file(&temporary);
                    log::warn!("no se pudo reemplazar yt-dlp en AppData: {error}");
                }
            }
        }
        Err(error) => {
            log::warn!("no se pudo copiar yt-dlp a AppData: {error}");
            let _ = std::fs::remove_file(&temporary);
            // Se usa el del bundle aunque sea de solo lectura: descargar y
            // buscar funcionan igual; solo fallaria la auto-actualizacion.
            return source.to_string_lossy().to_string();
        }
    }

    ytdlp(app)
}

/// Normaliza una ruta escrita por el usuario: expande `~`, variables de
/// entorno y rutas con separadores mixtos.
pub fn normalize_user_path(raw: &str) -> PathBuf {
    let trimmed = raw.trim().trim_matches('"');
    if trimmed.is_empty() {
        return default_music_dir();
    }

    let expanded = if let Some(rest) = trimmed.strip_prefix('~') {
        let home = dirs::home_dir().unwrap_or_default();
        let rest = rest.trim_start_matches(['\\', '/']);
        if rest.is_empty() {
            home
        } else {
            home.join(rest)
        }
    } else {
        PathBuf::from(trimmed)
    };

    // Expandir %VARS% de Windows.
    let as_str = expanded.to_string_lossy().to_string();
    if as_str.contains('%') {
        let mut out = String::new();
        let mut chars = as_str.split('%');
        if let Some(first) = chars.next() {
            out.push_str(first);
        }
        let mut expect_var = true;
        for part in chars {
            if expect_var {
                match std::env::var(part) {
                    Ok(v) => out.push_str(&v),
                    Err(_) => {
                        out.push('%');
                        out.push_str(part);
                        out.push('%');
                    }
                }
            } else {
                out.push_str(part);
            }
            expect_var = !expect_var;
        }
        return PathBuf::from(out);
    }

    expanded
}
