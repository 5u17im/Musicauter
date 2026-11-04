//! Persistencia local en %APPDATA%\com.audionave.desktop.
//!
//! Se usa un almacen de documentos JSON con escritura atomica
//! (fichero temporal + rename) y copia de seguridad .bak. Los ficheros son
//! legibles y respaldables por el usuario, y sobreviven a reinstalaciones.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

fn lock<'a, T>(m: &'a Mutex<T>) -> MutexGuard<'a, T> {
    m.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub artist: String,
    #[serde(default)]
    pub album: Option<String>,
    #[serde(default)]
    pub duration_seconds: Option<f64>,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub youtube_id: Option<String>,
    #[serde(default)]
    pub downloaded: bool,
    #[serde(default)]
    pub is_favorite: bool,
    #[serde(default)]
    pub artwork_url: Option<String>,
    #[serde(default)]
    pub file_size_bytes: Option<u64>,
    #[serde(default)]
    pub format: Option<String>,
    #[serde(default)]
    pub added_at: Option<i64>,
    /// URL de la playlist de origen, si la pista vino de una lista.
    #[serde(default)]
    pub playlist_url: Option<String>,
    /// Ruta local de la caratula extraida a la cache de la aplicacion.
    #[serde(default)]
    pub cover_path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: String,
    #[serde(default)]
    pub url: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub artwork_url: Option<String>,
    #[serde(default)]
    pub total_tracks: usize,
    #[serde(default)]
    pub downloaded_count: usize,
    #[serde(default)]
    pub new_tracks: usize,
    #[serde(default)]
    pub tracks: Vec<Track>,
    #[serde(default)]
    pub created_at: Option<i64>,
    #[serde(default)]
    pub updated_at: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DownloadItem {
    pub id: String,
    pub track_id: String,
    pub title: String,
    #[serde(default)]
    pub artist: String,
    #[serde(default)]
    pub youtube_id: Option<String>,
    pub url: String,
    #[serde(default)]
    pub progress: f64,
    pub status: String,
    #[serde(default)]
    pub speed: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub added_at: i64,
    /// Ruta final del archivo una vez completada la descarga.
    #[serde(default)]
    pub file_path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    #[serde(default)]
    pub maximized: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme: String,
    pub audio_format: String,
    pub music_dir: String,
    pub auto_sync: bool,
    pub browser_auth: bool,
    pub selected_browser: String,
    #[serde(default)]
    pub last_fm_key: Option<String>,
    #[serde(default)]
    pub minimize_to_tray: bool,
    #[serde(default)]
    pub global_media_keys: bool,
    #[serde(default)]
    pub window: Option<WindowState>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "dark".into(),
            audio_format: "mp3".into(),
            music_dir: String::new(),
            auto_sync: true,
            browser_auth: false,
            selected_browser: "chrome".into(),
            last_fm_key: None,
            minimize_to_tray: true,
            global_media_keys: true,
            window: None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    #[serde(default)]
    pub tracks: Vec<Track>,
    #[serde(default)]
    pub playlists: Vec<Playlist>,
}

/// Estado completo expuesto al frontend en el arranque.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub tracks: Vec<Track>,
    pub playlists: Vec<Playlist>,
    pub downloads: Vec<DownloadItem>,
    pub settings: Settings,
}

fn read_json<T: for<'a> Deserialize<'a> + Default>(path: &Path) -> T {
    match std::fs::read_to_string(path) {
        Ok(raw) => match serde_json::from_str::<T>(&raw) {
            Ok(value) => value,
            Err(e) => {
                log::error!("JSON corrupto en {}: {e}", path.display());
                // Intentar recuperar desde la copia de seguridad.
                let backup = path.with_extension("json.bak");
                if let Ok(raw_bak) = std::fs::read_to_string(&backup) {
                    if let Ok(value) = serde_json::from_str::<T>(&raw_bak) {
                        log::warn!("recuperado desde {}", backup.display());
                        return value;
                    }
                }
                T::default()
            }
        },
        Err(_) => T::default(),
    }
}

fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let payload = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // Copia de seguridad del estado anterior antes de sobrescribir.
    if path.is_file() {
        let backup = path.with_extension("json.bak");
        let _ = std::fs::copy(path, backup);
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, payload).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())?;
    Ok(())
}

pub struct Store {
    library_path: PathBuf,
    downloads_path: PathBuf,
    settings_path: PathBuf,
    library: Mutex<Library>,
    downloads: Mutex<Vec<DownloadItem>>,
    settings: Mutex<Settings>,
}

impl Store {
    pub fn load(dir: PathBuf) -> Self {
        let library_path = dir.join("library.json");
        let downloads_path = dir.join("downloads.json");
        let settings_path = dir.join("settings.json");

        let library: Library = read_json(&library_path);
        let downloads: Vec<DownloadItem> = read_json(&downloads_path);
        let mut settings: Settings = read_json(&settings_path);

        // Primera ejecucion: fijar la carpeta de musica real del usuario.
        if settings.music_dir.trim().is_empty() {
            settings.music_dir = crate::services::paths::default_music_dir()
                .to_string_lossy()
                .to_string();
        }

        let store = Self {
            library_path,
            downloads_path,
            settings_path,
            library: Mutex::new(library),
            downloads: Mutex::new(downloads),
            settings: Mutex::new(settings),
        };
        let _ = store.persist_settings();
        store
    }

    // ---------------------------------------------------------------
    // Lecturas
    // ---------------------------------------------------------------
    /// Copia coherente del estado completo.
    ///
    /// IMPORTANTE: cada mutex se libera en su propia sentencia. Escribir
    /// `lock(&a)…` dos veces dentro de la misma expresion deja vivos los dos
    /// temporales hasta el final de la sentencia y, como `Mutex` no es
    /// reentrante, el segundo intento se bloquea para siempre. Ese fue
    /// exactamente el cuelgue del arranque.
    pub fn snapshot(&self) -> Snapshot {
        let tracks = {
            let library = lock(&self.library);
            library.tracks.clone()
        };
        let playlists = {
            let library = lock(&self.library);
            library.playlists.clone()
        };
        let downloads = {
            let downloads = lock(&self.downloads);
            downloads.clone()
        };
        let settings = {
            let settings = lock(&self.settings);
            settings.clone()
        };

        Snapshot {
            tracks,
            playlists,
            downloads,
            settings,
        }
    }

    pub fn tracks(&self) -> Vec<Track> {
        lock(&self.library).tracks.clone()
    }

    pub fn settings(&self) -> Settings {
        lock(&self.settings).clone()
    }

    pub fn music_dir(&self) -> PathBuf {
        crate::services::paths::normalize_user_path(&lock(&self.settings).music_dir)
    }

    // ---------------------------------------------------------------
    // Mutaciones
    // ---------------------------------------------------------------
    pub fn upsert_tracks(&self, tracks: Vec<Track>) -> Result<(), String> {
        {
            let mut lib = lock(&self.library);
            for track in tracks {
                match lib.tracks.iter_mut().find(|t| t.id == track.id) {
                    Some(existing) => {
                        // No perder datos ya conocidos al reimportar.
                        let favorite = existing.is_favorite;
                        let added = existing.added_at;
                        *existing = track;
                        existing.is_favorite = favorite || existing.is_favorite;
                        existing.added_at = added.or(existing.added_at);
                    }
                    None => lib.tracks.push(track),
                }
            }
        }
        self.persist_library()
    }

    pub fn update_track(&self, id: &str, patch: serde_json::Value) -> Result<(), String> {
        {
            let mut lib = lock(&self.library);
            if let Some(track) = lib.tracks.iter_mut().find(|t| t.id == id) {
                let mut current = serde_json::to_value(&*track).map_err(|e| e.to_string())?;
                if let (Some(obj), Some(patch_obj)) = (current.as_object_mut(), patch.as_object()) {
                    for (key, value) in patch_obj {
                        obj.insert(key.clone(), value.clone());
                    }
                }
                *track = serde_json::from_value(current).map_err(|e| e.to_string())?;
            }
        }
        self.persist_library()
    }

    pub fn toggle_favorite(&self, id: &str) -> Result<bool, String> {
        let result = {
            let mut lib = lock(&self.library);
            match lib.tracks.iter_mut().find(|t| t.id == id) {
                Some(track) => {
                    track.is_favorite = !track.is_favorite;
                    track.is_favorite
                }
                None => {
                    return Err("Pista no encontrada".into());
                }
            }
        };
        self.persist_library()?;
        Ok(result)
    }

    pub fn delete_track(&self, id: &str) -> Result<(), String> {
        {
            let mut lib = lock(&self.library);
            lib.tracks.retain(|t| t.id != id);
        }
        self.persist_library()
    }

    pub fn upsert_playlist(&self, playlist: Playlist) -> Result<(), String> {
        {
            let mut lib = lock(&self.library);
            match lib
                .playlists
                .iter_mut()
                .find(|p| p.id == playlist.id || (!playlist.url.is_empty() && p.url == playlist.url))
            {
                Some(existing) => {
                    let created = existing.created_at;
                    *existing = playlist;
                    existing.created_at = created.or(existing.created_at);
                }
                None => lib.playlists.push(playlist),
            }
        }
        self.persist_library()
    }

    pub fn delete_playlist(&self, id: &str) -> Result<(), String> {
        {
            let mut lib = lock(&self.library);
            lib.playlists.retain(|p| p.id != id);
        }
        self.persist_library()
    }

    pub fn set_downloads(&self, items: Vec<DownloadItem>) -> Result<(), String> {
        {
            let mut guard = lock(&self.downloads);
            *guard = items;
        }
        self.persist_downloads()
    }

    pub fn save_settings(&self, patch: serde_json::Value) -> Result<Settings, String> {
        let updated = {
            let mut guard = lock(&self.settings);
            let mut current = serde_json::to_value(&*guard).map_err(|e| e.to_string())?;
            if let (Some(obj), Some(patch_obj)) = (current.as_object_mut(), patch.as_object()) {
                for (key, value) in patch_obj {
                    obj.insert(key.clone(), value.clone());
                }
            }
            *guard = serde_json::from_value(current).map_err(|e| e.to_string())?;
            guard.clone()
        };
        self.persist_settings()?;
        Ok(updated)
    }

    pub fn set_window_state(&self, state: WindowState) {
        {
            let mut guard = lock(&self.settings);
            guard.window = Some(state);
        }
        let _ = self.persist_settings();
    }

    // ---------------------------------------------------------------
    // Escritura en disco
    // ---------------------------------------------------------------
    fn persist_library(&self) -> Result<(), String> {
        let snapshot = lock(&self.library).clone();
        write_json_atomic(&self.library_path, &snapshot)
    }

    fn persist_downloads(&self) -> Result<(), String> {
        let snapshot = lock(&self.downloads).clone();
        write_json_atomic(&self.downloads_path, &snapshot)
    }

    fn persist_settings(&self) -> Result<(), String> {
        let snapshot = lock(&self.settings).clone();
        write_json_atomic(&self.settings_path, &snapshot)
    }

    pub fn data_dir(&self) -> PathBuf {
        self.library_path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::Duration;

    fn scratch_store(name: &str) -> (Store, PathBuf) {
        let dir = std::env::temp_dir().join(format!("audionave-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        (Store::load(dir.clone()), dir)
    }

    /// Regression: snapshot() tomaba dos veces el mismo mutex en una sola
    /// expresion, lo que bloqueaba el hilo para siempre. Sin esta prueba, el
    /// fallo solo se manifiesta como una interfaz que nunca termina de arrancar.
    #[test]
    fn snapshot_does_not_deadlock() {
        let (store, dir) = scratch_store("snapshot");
        let store = std::sync::Arc::new(store);

        let (sender, receiver) = mpsc::channel();
        let worker = store.clone();
        std::thread::spawn(move || {
            let snapshot = worker.snapshot();
            let _ = sender.send(snapshot.tracks.len());
        });

        match receiver.recv_timeout(Duration::from_secs(5)) {
            Ok(_) => {}
            Err(_) => panic!("snapshot() se bloqueo: hay un mutex tomado dos veces"),
        }

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn snapshot_returns_what_was_stored() {
        let (store, dir) = scratch_store("roundtrip");

        store
            .upsert_tracks(vec![Track {
                id: "t1".into(),
                title: "Cancion".into(),
                artist: "Artista".into(),
                downloaded: true,
                ..Default::default()
            }])
            .expect("upsert_tracks");

        let snapshot = store.snapshot();
        assert_eq!(snapshot.tracks.len(), 1);
        assert_eq!(snapshot.tracks[0].title, "Cancion");

        let reloaded = Store::load(dir.clone());
        assert_eq!(reloaded.snapshot().tracks.len(), 1);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
