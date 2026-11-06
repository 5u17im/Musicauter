//! Diagnostico y estabilidad.
//!
//!  * Buffer circular con las ultimas entradas de log (visor de errores).
//!  * Gancho de `panic` que deja constancia en el log antes de abortar el hilo.
//!  * Vigilante del hilo principal: si la interfaz nativa deja de procesar
//!    mensajes (ventana "no responde"), queda registrado cuanto duro.

use serde::Serialize;
use std::collections::VecDeque;
use std::sync::mpsc;
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant};
use tauri::AppHandle;

/// Entradas retenidas en memoria.
const CAPACITY: usize = 1000;

/// Latencia del hilo principal a partir de la cual se avisa.
const SLOW_MAIN_THREAD: Duration = Duration::from_millis(1500);
/// Latencia a partir de la cual se considera bloqueado.
const STALLED_MAIN_THREAD: Duration = Duration::from_secs(5);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub id: u64,
    /// Milisegundos desde la epoca Unix.
    pub timestamp: i64,
    /// `error`, `warn`, `info`, `debug` o `trace`.
    pub level: String,
    /// Origen: `frontend`, `rust`, `yt-dlp`...
    pub source: String,
    pub message: String,
}

struct Buffer {
    next_id: u64,
    entries: VecDeque<LogEntry>,
}

fn buffer() -> &'static Mutex<Buffer> {
    static BUFFER: OnceLock<Mutex<Buffer>> = OnceLock::new();
    BUFFER.get_or_init(|| {
        Mutex::new(Buffer {
            next_id: 1,
            entries: VecDeque::with_capacity(CAPACITY),
        })
    })
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn source_of(target: &str) -> &'static str {
    if target.starts_with("audionave_frontend") {
        "frontend"
    } else if target.contains("yt") {
        "yt-dlp"
    } else {
        "rust"
    }
}

/// Anade una entrada al buffer. Se invoca desde el despachador de `log`.
pub fn record(record: &log::Record) {
    let mut guard = lock(buffer());
    let id = guard.next_id;
    guard.next_id += 1;
    if guard.entries.len() >= CAPACITY {
        guard.entries.pop_front();
    }
    guard.entries.push_back(LogEntry {
        id,
        timestamp: now_millis(),
        level: record.level().to_string().to_lowercase(),
        source: source_of(record.target()).to_string(),
        message: record.args().to_string(),
    });
}

/// Entradas con id mayor que `after` (0 = todas).
pub fn entries_after(after: u64) -> Vec<LogEntry> {
    lock(buffer())
        .entries
        .iter()
        .filter(|entry| entry.id > after)
        .cloned()
        .collect()
}

pub fn clear() {
    lock(buffer()).entries.clear();
}

/// Registra los `panic` en el log con su ubicacion.
pub fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "ubicacion desconocida".into());
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "sin mensaje".into());
        let thread = std::thread::current();
        log::error!(
            "PANIC en el hilo '{}' ({location}): {payload}",
            thread.name().unwrap_or("sin nombre")
        );
        previous(info);
    }));
}

/// Comprueba periodicamente que el hilo principal procesa mensajes.
///
/// Si la ventana se queda en "no responde" mientras el audio sigue sonando
/// (el audio vive en el proceso del WebView), el hilo nativo esta bloqueado.
/// Este vigilante lo detecta y lo deja en el log con la duracion.
pub fn spawn_main_thread_watchdog(app: AppHandle) {
    let spawned = std::thread::Builder::new()
        .name("main-thread-watchdog".into())
        .spawn(move || loop {
            std::thread::sleep(Duration::from_secs(3));

            let (sender, receiver) = mpsc::channel::<()>();
            let started = Instant::now();
            if app
                .run_on_main_thread(move || {
                    let _ = sender.send(());
                })
                .is_err()
            {
                // El bucle de eventos ya no existe: la aplicacion se cierra.
                return;
            }

            match receiver.recv_timeout(STALLED_MAIN_THREAD) {
                Ok(()) => {
                    let elapsed = started.elapsed();
                    if elapsed >= SLOW_MAIN_THREAD {
                        log::warn!(
                            "hilo principal lento: tardo {} ms en responder",
                            elapsed.as_millis()
                        );
                    }
                }
                Err(_) => {
                    log::error!(
                        "hilo principal SIN RESPONDER durante mas de {} s (la ventana figurara como 'no responde')",
                        STALLED_MAIN_THREAD.as_secs()
                    );
                    // Esperar a que se recupere para registrar la duracion total.
                    if receiver.recv().is_ok() {
                        log::warn!(
                            "hilo principal recuperado tras {} ms bloqueado",
                            started.elapsed().as_millis()
                        );
                    } else {
                        return;
                    }
                }
            }
        });

    if let Err(error) = spawned {
        log::warn!("no se pudo iniciar el vigilante del hilo principal: {error}");
    }
}

