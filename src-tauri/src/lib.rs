//! Audionave - aplicacion de escritorio (Tauri 2).
//!
//! Arquitectura:
//!   services::paths    resolucion de rutas nativas y binarios actualizables
//!   services::store    persistencia en %APPDATA% con escrituras atomicas
//!   services::catalog  indexado de la biblioteca local (ffmpeg)
//!   services::yt       motor yt-dlp: busqueda, playlists, descargas con progreso
//!   services::shell    integracion con el Explorador de Windows

mod services;

use serde_json::Value;
use services::catalog;
use services::media_server::MediaServer;
use services::paths;
use services::store::{Snapshot, Store, Track};
use services::yt::{self, BackendStatus, DownloadEngine, DownloadOutcome, DownloadRequest};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::time::Duration;
use std::path::Path;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};

/// Puerto local usado como cerrojo de instancia unica.
const SINGLE_INSTANCE_ADDR: &str = "127.0.0.1:47831";
/// Saludo que identifica a otra instancia de Audionave frente a un proceso
/// ajeno que casualmente ocupe el mismo puerto.
const SINGLE_INSTANCE_GREETING: &[u8] = b"AUDIONAVE\n";

/// Evita escribir el estado de la ventana en cada pixel de arrastre.
static LAST_WINDOW_SAVE: AtomicI64 = AtomicI64::new(0);

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Rutas baratas (no copian nada). La preparacion de yt-dlp en %APPDATA% se
/// hace aparte, en segundo plano y solo una vez.
fn ytdlp_of(app: &AppHandle) -> String {
    paths::ytdlp(app)
}

fn ffmpeg_of(app: &AppHandle) -> String {
    paths::ffmpeg(app)
}

/// Permite a la interfaz escribir en el mismo archivo de log que Rust.
/// Es lo que hace diagnosticable un cuelgue en el arranque.
///
/// `level` admite `error`, `warn`, `debug`; por defecto `info`.
#[tauri::command(async)]
fn frontend_log(message: String, level: Option<String>) {
    match level.as_deref() {
        Some("error") => log::error!(target: "audionave_frontend", "{message}"),
        Some("warn") => log::warn!(target: "audionave_frontend", "{message}"),
        Some("debug") => log::debug!(target: "audionave_frontend", "{message}"),
        _ => log::info!(target: "audionave_frontend", "{message}"),
    }
}

/// Entradas del visor de errores con id mayor que `after` (0 = todas).
#[tauri::command(async)]
fn get_log_entries(after: Option<u64>) -> Vec<services::diagnostics::LogEntry> {
    services::diagnostics::entries_after(after.unwrap_or(0))
}

#[tauri::command(async)]
fn clear_log_entries() {
    services::diagnostics::clear();
}

/// Ruta de la carpeta de logs en disco.
#[tauri::command(async)]
fn get_log_dir(app: AppHandle) -> String {
    paths::app_data_dir(&app)
        .join("logs")
        .to_string_lossy()
        .to_string()
}

/// Chequeo de integridad del sistema (ver `services::health`).
#[tauri::command]
async fn run_health_check(
    app: AppHandle,
    store: State<'_, Arc<Store>>,
    media: State<'_, Arc<MediaServer>>,
) -> Result<Vec<services::health::HealthCheck>, String> {
    let store = store.inner().clone();
    let (port, token) = (media.port, media.token.clone());
    tauri::async_runtime::spawn_blocking(move || services::health::run(&app, &store, port, &token))
        .await
        .map_err(|e| e.to_string())
}

/// Reparacion automatica asociada a una comprobacion del chequeo.
#[tauri::command]
async fn repair_health(store: State<'_, Arc<Store>>, id: String) -> Result<String, String> {
    let store = store.inner().clone();
    let outcome = tauri::async_runtime::spawn_blocking(move || services::health::repair(&id, &store))
        .await
        .map_err(|e| e.to_string())?;
    match &outcome {
        Ok(summary) => log::info!("reparacion aplicada: {summary}"),
        Err(error) => log::error!("la reparacion fallo: {error}"),
    }
    outcome
}

fn persist_geometry(store: &Store, x: i32, y: i32, width: u32, height: u32, maximized: bool) {
    // Una ventana minimizada reporta coordenadas como (-32000, -32000): si se
    // guardaran, el siguiente arranque abriria la ventana fuera de pantalla.
    if x <= -10_000 || y <= -10_000 || width < 200 || height < 200 {
        return;
    }
    store.set_window_state(services::store::WindowState {
        x,
        y,
        width,
        height,
        maximized,
    });
}

/// Guarda la geometria desde una ventana webview (comandos).
fn save_window_state(window: &tauri::WebviewWindow, store: &Store) {
    if window.is_minimized().unwrap_or(false) {
        return;
    }
    let maximized = window.is_maximized().unwrap_or(false);
    let (x, y) = window.outer_position().map(|p| (p.x, p.y)).unwrap_or((0, 0));
    let size = window.outer_size().unwrap_or_default();
    persist_geometry(store, x, y, size.width, size.height, maximized);
}

/// Guarda la geometria desde el manejador de eventos (tipo Window).
fn save_window_event_state(window: &tauri::Window, store: &Store) {
    if window.is_minimized().unwrap_or(false) {
        return;
    }
    let maximized = window.is_maximized().unwrap_or(false);
    let (x, y) = window.outer_position().map(|p| (p.x, p.y)).unwrap_or((0, 0));
    let size = window.outer_size().unwrap_or_default();
    persist_geometry(store, x, y, size.width, size.height, maximized);
}

/// Ajusta una geometria guardada al area de trabajo de algun monitor
/// disponible. Cubre monitores desconectados, cambios de resolucion y la barra
/// de tareas de Windows en cualquier lado (el area de trabajo ya la excluye).
fn fit_to_work_area(
    app: &AppHandle,
    state: &services::store::WindowState,
) -> Option<(i32, i32, u32, u32)> {
    let monitors = app.available_monitors().ok()?;
    if monitors.is_empty() {
        return None;
    }

    // Monitor con mayor interseccion con la ventana guardada.
    let overlap = |m: &tauri::Monitor| -> i64 {
        let area = m.work_area();
        let left = state.x.max(area.position.x) as i64;
        let top = state.y.max(area.position.y) as i64;
        let right = (state.x + state.width as i32).min(area.position.x + area.size.width as i32) as i64;
        let bottom = (state.y + state.height as i32).min(area.position.y + area.size.height as i32) as i64;
        ((right - left).max(0)) * ((bottom - top).max(0))
    };

    let best = monitors.iter().max_by_key(|m| overlap(m))?;
    let area = best.work_area();

    let width = state.width.min(area.size.width);
    let height = state.height.min(area.size.height);

    let max_x = area.position.x + area.size.width as i32 - width as i32;
    let max_y = area.position.y + area.size.height as i32 - height as i32;
    let x = state.x.clamp(area.position.x, max_x.max(area.position.x));
    let y = state.y.clamp(area.position.y, max_y.max(area.position.y));

    Some((x, y, width, height))
}

// ---------------------------------------------------------------------------
// Comandos: estado y ajustes
// ---------------------------------------------------------------------------

#[tauri::command(async)]
fn get_snapshot(store: State<'_, Arc<Store>>) -> Snapshot {
    store.snapshot()
}

#[tauri::command]
async fn get_status(
    app: AppHandle,
    store: State<'_, Arc<Store>>,
    media: State<'_, Arc<MediaServer>>,
) -> Result<BackendStatus, String> {
    // Se leen los datos del almacen ANTES de cualquier await para no retener
    // el State a traves de un punto de suspension.
    let music_dir = store.music_dir();
    let data_dir = store.data_dir();
    let tracks_count = store.tracks().len();

    let ytdlp = ytdlp_of(&app);
    let ffmpeg = ffmpeg_of(&app);

    // Lanzar yt-dlp tarda ~3 s (es un empaquetado de Python): fuera del hilo
    // principal para que la ventana no se congele.
    let version = {
        let probe = ytdlp.clone();
        tauri::async_runtime::spawn_blocking(move || yt::ytdlp_version(&probe))
            .await
            .ok()
            .flatten()
    };

    let has_ytdlp = !ytdlp.is_empty();
    Ok(BackendStatus {
        ok: has_ytdlp,
        message: if has_ytdlp {
            "Motor de extraccion disponible".to_string()
        } else {
            "No se encontro yt-dlp. Ejecuta scripts/fetch-binaries.ps1 y vuelve a compilar".to_string()
        },
        has_ytdlp,
        has_ffmpeg: !ffmpeg.is_empty(),
        ytdlp_version: version,
        music_dir: music_dir.to_string_lossy().to_string(),
        data_dir: data_dir.to_string_lossy().to_string(),
        tracks_count,
        media_base: format!("http://127.0.0.1:{}", media.port),
        media_token: media.token.clone(),
    })
}

#[tauri::command(async)]
fn save_settings(store: State<'_, Arc<Store>>, patch: Value) -> Result<services::store::Settings, String> {
    store.save_settings(patch)
}

#[tauri::command(async)]
fn set_music_dir(
    store: State<'_, Arc<Store>>,
    path: String,
) -> Result<services::store::Settings, String> {
    let resolved = paths::normalize_user_path(&path);
    services::shell::ensure_dir(&resolved)?;
    store.save_settings(serde_json::json!({
        "musicDir": resolved.to_string_lossy().to_string()
    }))
}

#[tauri::command(async)]
fn default_music_dir() -> String {
    paths::default_music_dir().to_string_lossy().to_string()
}

#[tauri::command(async)]
fn pick_folder(current: Option<String>) -> Option<String> {
    services::shell::pick_folder(current.as_deref().unwrap_or(""))
}

#[tauri::command(async)]
fn open_music_folder(store: State<'_, Arc<Store>>) -> bool {
    services::shell::open_folder(&store.music_dir())
}

#[tauri::command(async)]
fn open_path(path: Option<String>, store: State<'_, Arc<Store>>) -> bool {
    match path {
        Some(p) if !p.trim().is_empty() => services::shell::open_folder(&paths::normalize_user_path(&p)),
        _ => services::shell::open_folder(&store.music_dir()),
    }
}

#[tauri::command(async)]
fn reveal_file(path: String) -> bool {
    services::shell::reveal_file(Path::new(&path))
}

#[tauri::command(async)]
fn open_external(url: String) -> bool {
    services::shell::open_url(&url)
}

// ---------------------------------------------------------------------------
// Comandos: biblioteca
// ---------------------------------------------------------------------------

#[tauri::command(async)]
fn upsert_tracks(store: State<'_, Arc<Store>>, tracks: Vec<Track>) -> Result<(), String> {
    store.upsert_tracks(tracks)
}

#[tauri::command(async)]
fn update_track(store: State<'_, Arc<Store>>, id: String, patch: Value) -> Result<(), String> {
    store.update_track(&id, patch)
}

#[tauri::command(async)]
fn toggle_favorite(store: State<'_, Arc<Store>>, id: String) -> Result<bool, String> {
    store.toggle_favorite(&id)
}

#[tauri::command(async)]
fn delete_track(store: State<'_, Arc<Store>>, id: String) -> Result<(), String> {
    store.delete_track(&id)
}

#[tauri::command(async)]
fn upsert_playlist(
    store: State<'_, Arc<Store>>,
    playlist: services::store::Playlist,
) -> Result<(), String> {
    store.upsert_playlist(playlist)
}

#[tauri::command(async)]
fn delete_playlist(store: State<'_, Arc<Store>>, id: String) -> Result<(), String> {
    store.delete_playlist(&id)
}

#[tauri::command(async)]
fn set_downloads(
    store: State<'_, Arc<Store>>,
    items: Vec<services::store::DownloadItem>,
) -> Result<(), String> {
    store.set_downloads(items)
}

// ---------------------------------------------------------------------------
// Comandos: indexado del disco
// ---------------------------------------------------------------------------

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanSummary {
    scanned: usize,
    total: usize,
    dir: String,
}

#[tauri::command]
async fn scan_music_dir(
    app: AppHandle,
    store: State<'_, Arc<Store>>,
    dir: Option<String>,
    recursive: Option<bool>,
) -> Result<ScanSummary, String> {
    let store = store.inner().clone();
    let target = match dir.as_deref() {
        Some(d) if !d.trim().is_empty() => paths::normalize_user_path(d),
        _ => store.music_dir(),
    };

    services::shell::ensure_dir(&target)?;

    let ffmpeg = ffmpeg_of(&app);
    if ffmpeg.is_empty() {
        return Err("No se encontro ffmpeg: hace falta para leer los metadatos".into());
    }

    let covers_dir = paths::app_data_dir(&app).join("covers");
    let recursive = recursive.unwrap_or(true);
    let progress_app = app.clone();
    let scan_dir = target.clone();

    let outcome = tauri::async_runtime::spawn_blocking(move || {
        catalog::scan(&ffmpeg, &scan_dir, recursive, &covers_dir, move |done, total| {
            let _ = progress_app.emit("scan://progress", serde_json::json!({ "done": done, "total": total }));
        })
    })
    .await
    .map_err(|e| e.to_string())?;

    let total = outcome.tracks.len();
    store.upsert_tracks(outcome.tracks)?;

    Ok(ScanSummary {
        scanned: total,
        total,
        dir: target.to_string_lossy().to_string(),
    })
}

// ---------------------------------------------------------------------------
// Comandos: yt-dlp
// ---------------------------------------------------------------------------

#[tauri::command]
async fn get_stream_url(app: AppHandle, url: String) -> Result<String, String> {
    let ytdlp = ytdlp_of(&app);
    tauri::async_runtime::spawn_blocking(move || yt::get_stream_url(&ytdlp, &url))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn scan_playlist(
    app: AppHandle,
    url: String,
    auth: Option<String>,
    browser: Option<String>,
) -> Result<String, String> {
    let ytdlp = ytdlp_of(&app);
    tauri::async_runtime::spawn_blocking(move || {
        yt::scan_playlist(&ytdlp, &url, auth.as_deref(), browser.as_deref(), 300)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn search_youtube(app: AppHandle, query: String) -> Result<String, String> {
    let ytdlp = ytdlp_of(&app);
    tauri::async_runtime::spawn_blocking(move || yt::search(&ytdlp, &query, 15))
        .await
        .map_err(|e| e.to_string())?
}

/// Mezcla automatica de YouTube a partir de un video (recomendaciones reales).
#[tauri::command]
async fn get_mix(app: AppHandle, video_id: String) -> Result<String, String> {
    let ytdlp = ytdlp_of(&app);
    tauri::async_runtime::spawn_blocking(move || yt::mix(&ytdlp, &video_id, 25))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn update_ytdlp_command(app: AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // Asegura la copia escribible antes de intentar -U.
        let ytdlp = paths::stage_ytdlp(&app);
        yt::update_ytdlp(&ytdlp)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------
// Comandos: descargas
// ---------------------------------------------------------------------------

#[tauri::command]
async fn download_track(
    app: AppHandle,
    engine: State<'_, Arc<DownloadEngine>>,
    store: State<'_, Arc<Store>>,
    request: DownloadRequest,
) -> Result<DownloadOutcome, String> {
    let engine = engine.inner().clone();
    let store = store.inner().clone();
    let ytdlp = ytdlp_of(&app);
    let ffmpeg = ffmpeg_of(&app);
    let request_id = request.id.clone();

    let outcome = tauri::async_runtime::spawn_blocking(move || {
        yt::download(&app, &engine, &store, &ytdlp, &ffmpeg, &request)
    })
    .await
    .map_err(|e| e.to_string())?;

    Ok(DownloadOutcome {
        id: request_id,
        ok: outcome.ok,
        cancelled: outcome.cancelled,
        file_path: outcome.file_path,
        error: outcome.error,
    })
}

#[tauri::command(async)]
fn cancel_download(engine: State<'_, Arc<DownloadEngine>>, id: String) -> bool {
    engine.cancel(&id)
}

#[tauri::command(async)]
fn cancel_all_downloads(engine: State<'_, Arc<DownloadEngine>>) -> bool {
    engine.cancel_all()
}

// ---------------------------------------------------------------------------
// Comandos: ventana
// ---------------------------------------------------------------------------

#[tauri::command(async)]
fn hide_to_tray(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

#[tauri::command(async)]
fn show_main_window(app: AppHandle) {
    show_window(&app);
}

/// Refleja el estado de reproduccion en la barra de miniaturas de la barra
/// de tareas (boton central = reproducir / pausar).
#[tauri::command(async)]
fn set_taskbar_playback_state(app: AppHandle, playing: bool, title: Option<String>) {
    #[cfg(target_os = "windows")]
    services::taskbar::request_state_update(&app, playing, title);

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, playing, title);
    }
}

/// Abre o cierra la ventana compacta del mini reproductor.
/// Devuelve true si ha quedado abierta.
#[tauri::command(async)]
fn toggle_mini_player(app: AppHandle) -> bool {
    if let Some(existing) = app.get_webview_window("mini") {
        let _ = existing.close();
        return false;
    }

    const WIDTH: f64 = 348.0;
    const HEIGHT: f64 = 148.0;

    let mut builder = WebviewWindowBuilder::new(&app, "mini", WebviewUrl::App("mini.html".into()))
        .title("Audionave — Mini reproductor")
        .inner_size(WIDTH, HEIGHT)
        .min_inner_size(300.0, 130.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(false)
        .center();

    // Esquina inferior derecha, por encima de la barra de tareas.
    if let Ok(Some(monitor)) = app.primary_monitor() {
        let scale = monitor.scale_factor();
        let size = monitor.size();
        let x = (size.width as f64 / scale) - WIDTH - 24.0;
        let y = (size.height as f64 / scale) - HEIGHT - 72.0;
        builder = builder.position(x.max(0.0), y.max(0.0));
    }

    match builder.build() {
        Ok(_) => true,
        Err(error) => {
            log::error!("no se pudo abrir el mini reproductor: {error}");
            false
        }
    }
}

#[tauri::command(async)]
fn quit_app(app: AppHandle) {
    let store = app.state::<Arc<Store>>();
    if let Some(window) = app.get_webview_window("main") {
        save_window_state(&window, &store);
    }
    app.state::<Arc<DownloadEngine>>().cancel_all();
    app.exit(0);
}

fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

// ---------------------------------------------------------------------------
// Cerrojo de instancia unica
// ---------------------------------------------------------------------------

/// Si ya hay una instancia, avisa a la primera para que se muestre y termina.
///
/// Es importante distinguir "el puerto lo ocupa otra instancia de Audionave"
/// de "el puerto lo ocupa un programa cualquiera": en el segundo caso la
/// aplicacion debe seguir arrancando en lugar de cerrarse.
fn enforce_single_instance(app: &AppHandle) {
    match TcpListener::bind(SINGLE_INSTANCE_ADDR) {
        Ok(listener) => {
            let handle = app.clone();
            std::thread::spawn(move || {
                for stream in listener.incoming() {
                    let Ok(mut stream) = stream else { continue };
                    // Se identifica antes de leer, para que el segundo proceso
                    // pueda confirmar que somos Audionave.
                    let _ = stream.write_all(SINGLE_INSTANCE_GREETING);
                    let _ = stream.flush();
                    let mut buffer = [0u8; 16];
                    let _ = stream.read(&mut buffer);
                    show_window(&handle);
                    let _ = handle.emit("app://focus-requested", ());
                }
            });
        }
        Err(error) => {
            let address: SocketAddr = match SINGLE_INSTANCE_ADDR.parse() {
                Ok(address) => address,
                Err(_) => return,
            };

            let confirmed = TcpStream::connect_timeout(&address, Duration::from_millis(600))
                .ok()
                .map(|mut stream| {
                    let mut greeting = [0u8; SINGLE_INSTANCE_GREETING.len()];
                    let is_audionave = stream
                        .read_exact(&mut greeting)
                        .map(|_| greeting == SINGLE_INSTANCE_GREETING)
                        .unwrap_or(false);
                    let _ = stream.write_all(b"show");
                    let _ = stream.flush();
                    is_audionave
                })
                .unwrap_or(false);

            if confirmed {
                std::process::exit(0);
            }

            log::warn!(
                "no se pudo tomar el cerrojo de instancia unica ({error}); se continua sin el"
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Bandeja del sistema
// ---------------------------------------------------------------------------

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Mostrar Audionave", true, None::<&str>)?;
    let play = MenuItem::with_id(app, "play_pause", "Reproducir / Pausar", true, None::<&str>)?;
    let next = MenuItem::with_id(app, "next", "Siguiente pista", true, None::<&str>)?;
    let previous = MenuItem::with_id(app, "previous", "Pista anterior", true, None::<&str>)?;
    let folder = MenuItem::with_id(app, "open_music", "Abrir carpeta de musica", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;

    let menu = Menu::with_items(
        app,
        &[&show, &play, &next, &previous, &separator, &folder, &separator, &quit],
    )?;

    let mut builder = TrayIconBuilder::with_id("audionave-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Audionave")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_window(app),
            "play_pause" => {
                let _ = app.emit("media://toggle-play", ());
            }
            "next" => {
                let _ = app.emit("media://next", ());
            }
            "previous" => {
                let _ = app.emit("media://previous", ());
            }
            "open_music" => {
                let store = app.state::<Arc<Store>>();
                services::shell::open_folder(&store.music_dir());
            }
            "quit" => {
                let store = app.state::<Arc<Store>>();
                if let Some(window) = app.get_webview_window("main") {
                    save_window_state(&window, &store);
                }
                app.state::<Arc<DownloadEngine>>().cancel_all();
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder.build(app)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Antes que nada: cualquier panic debe quedar registrado.
    services::diagnostics::install_panic_hook();

    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();

            // El registro se activa tambien en la version final: escribir un
            // archivo de log en %APPDATA% es lo unico que permite diagnosticar
            // problemas en un equipo que no es el de desarrollo. Ademas se
            // duplica en un buffer en memoria para el visor de errores.
            let log_dir = paths::app_data_dir(&handle).join("logs");
            let memory_sink = tauri_plugin_log::fern::Dispatch::new()
                .chain(tauri_plugin_log::fern::Output::call(|record| {
                    services::diagnostics::record(record)
                }));
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .max_file_size(2 * 1024 * 1024)
                    .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(5))
                    .targets([
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Folder {
                            path: log_dir,
                            file_name: Some("audionave".to_string()),
                        }),
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Dispatch(
                            memory_sink,
                        )),
                    ])
                    .build(),
            )?;

            services::diagnostics::spawn_main_thread_watchdog(handle.clone());

            // 1. Estado persistente en %APPDATA%.
            let data_dir = paths::app_data_dir(&handle);
            let store = Arc::new(Store::load(data_dir));
            app.manage(store.clone());
            app.manage(Arc::new(DownloadEngine::default()));

            // 2. Servidor HTTP local para reproducir audio desde disco.
            match services::media_server::start() {
                Ok(server) => {
                    app.manage(Arc::new(server));
                }
                Err(e) => {
                    log::error!("no se pudo iniciar el servidor de medios: {e}");
                    app.manage(Arc::new(MediaServer {
                        port: 0,
                        token: String::new(),
                    }));
                }
            }

            // 3. Preparar yt-dlp en %APPDATA% (permite yt-dlp -U). En segundo
            //    plano y sin bloquear: solo se copia yt-dlp (17 MB), nunca los
            //    139 MB de ffmpeg, que se usan directamente del bundle.
            let bin_handle = handle.clone();
            std::thread::spawn(move || {
                paths::stage_ytdlp(&bin_handle);
            });

            // 4. Restaurar geometria de la ventana, ajustada al area de trabajo
            //    (descarta posiciones fuera de pantalla y respeta la barra de
            //    tareas de Windows aunque este en un costado).
            if let (Some(window), Some(state)) = (
                app.get_webview_window("main"),
                store.settings().window.clone(),
            ) {
                if state.width > 200 && state.height > 200 {
                    match fit_to_work_area(&handle, &state) {
                        Some((x, y, width, height)) => {
                            let _ = window.set_size(tauri::PhysicalSize::new(width, height));
                            let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
                        }
                        None => {
                            log::warn!("geometria guardada descartada: no hay monitor disponible");
                            let _ = window.center();
                        }
                    }
                    if state.maximized {
                        let _ = window.maximize();
                    }
                }
            }

            // 5. Bandeja del sistema.
            if let Err(e) = build_tray(&handle) {
                log::warn!("no se pudo crear la bandeja del sistema: {e}");
            }

            // 6. Barra de miniaturas de la barra de tareas. Se espera un
            //    instante para que Windows haya creado el boton de la barra de
            //    tareas de la ventana principal.
            #[cfg(target_os = "windows")]
            {
                // Interruptor de diagnostico: permite arrancar sin la barra de
                // miniaturas para aislar problemas sin recompilar.
                if std::env::var_os("AUDIONAVE_NO_TASKBAR").is_some() {
                    log::info!("taskbar: omitida por AUDIONAVE_NO_TASKBAR");
                } else {
                    let taskbar_handle = handle.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(Duration::from_millis(900));
                        let runner = taskbar_handle.clone();
                        let _ = taskbar_handle.run_on_main_thread(move || {
                            if let Some(window) = runner.get_webview_window("main") {
                                match window.hwnd() {
                                    Ok(hwnd) => services::taskbar::install(&runner, hwnd),
                                    Err(error) => {
                                        log::warn!("no se pudo obtener el HWND de la ventana: {error}")
                                    }
                                }
                            }
                        });
                    });
                }
            }

            // 7. Instancia unica (despues de crear la ventana principal).
            enforce_single_instance(&handle);

            Ok(())
        })
        .on_window_event(|window, event| {
            // Este manejador recibe eventos de TODAS las ventanas. El mini
            // reproductor debe cerrarse de verdad y no puede pisar la geometria
            // guardada de la ventana principal.
            let is_main = window.label() == "main";

            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    if !is_main {
                        return;
                    }
                    let app = window.app_handle();
                    let store = app.state::<Arc<Store>>();
                    save_window_event_state(window, &store);
                    if store.settings().minimize_to_tray {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
                WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
                    if !is_main {
                        return;
                    }
                    let now = now_millis();
                    let last = LAST_WINDOW_SAVE.load(Ordering::Relaxed);
                    if now - last > 1500 {
                        LAST_WINDOW_SAVE.store(now, Ordering::Relaxed);
                        let app = window.app_handle();
                        let store = app.state::<Arc<Store>>();
                        save_window_event_state(window, &store);
                    }
                }
                WindowEvent::Destroyed => {
                    if window.label() == "mini" {
                        // Avisa a la ventana principal para que su boton vuelva
                        // a su estado normal.
                        let _ = window.app_handle().emit("mini://closed", ());
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            frontend_log,
            get_log_entries,
            clear_log_entries,
            get_log_dir,
            run_health_check,
            repair_health,
            get_snapshot,
            get_status,
            save_settings,
            set_music_dir,
            default_music_dir,
            pick_folder,
            open_music_folder,
            open_path,
            reveal_file,
            open_external,
            upsert_tracks,
            update_track,
            toggle_favorite,
            delete_track,
            upsert_playlist,
            delete_playlist,
            set_downloads,
            scan_music_dir,
            get_stream_url,
            scan_playlist,
            search_youtube,
            get_mix,
            update_ytdlp_command,
            download_track,
            cancel_download,
            cancel_all_downloads,
            hide_to_tray,
            show_main_window,
            set_taskbar_playback_state,
            toggle_mini_player,
            quit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar Audionave");
}
