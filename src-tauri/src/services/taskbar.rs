//! Barra de miniaturas de la barra de tareas de Windows.
//!
//! Al pasar el cursor por el icono de Audionave en la barra de tareas, Windows
//! muestra una vista previa de la ventana. Esta barra anade tres botones
//! (anterior, reproducir/pausar, siguiente) sobre esa vista previa, para
//! controlar la musica sin volver a la aplicacion.
//!
//! Detalles de implementacion:
//!  * Se usa ITaskbarList3 (Windows 7+), obtenido con CoCreateInstance.
//!  * Los iconos se embeben en el binario y se escriben en %APPDATA% porque
//!    LoadImageW necesita una ruta de archivo.
//!  * Los clics llegan como WM_COMMAND con THBN_CLICKED al procedimiento de
//!    ventana, que se intercepta con SetWindowSubclass. Todo lo demas se
//!    reenvia a DefSubclassProc para no alterar el comportamiento de la ventana.
//!  * COM se toca UNICAMENTE en el hilo principal (apartamento STA), por eso
//!    el comando publico usa run_on_main_thread.

use super::paths;
use std::cell::RefCell;
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use tauri::{AppHandle, Emitter};
use windows::core::{w, GUID, PCWSTR};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
};
use windows::Win32::UI::Shell::{
    DefSubclassProc, ITaskbarList3, SetWindowSubclass, THUMBBUTTON, THB_FLAGS, THB_ICON,
    THB_TOOLTIP, THBF_DISABLED, THBF_ENABLED,
};
use windows::Win32::UI::WindowsAndMessaging::{
    LoadImageW, RegisterWindowMessageW, HICON, IMAGE_ICON, LR_LOADFROMFILE, WM_COMMAND,
};

/// CLSID_TaskbarList {56FDF344-FD6D-11d0-958A-006097C9A090}
const CLSID_TASKBARLIST: GUID = GUID::from_values(
    0x56FD_F344,
    0xFD6D,
    0x11D0,
    [0x95, 0x8A, 0x00, 0x60, 0x97, 0xC9, 0xA0, 0x90],
);

/// THBN_CLICKED: notificacion que envia la barra de miniaturas al pulsar.
const THBN_CLICKED: u32 = 0x1800;

const BTN_PREV: u32 = 1;
const BTN_PLAY: u32 = 2;
const BTN_NEXT: u32 = 3;

/// Identificador de la subclase de ventana.
const SUBCLASS_ID: usize = 0x4155_4449;

struct Icons {
    prev: HICON,
    play: HICON,
    pause: HICON,
    next: HICON,
}

struct TaskbarState {
    taskbar: ITaskbarList3,
    hwnd: HWND,
    icons: Icons,
    playing: bool,
    title: String,
    /// `ThumbBarAddButtons` solo puede llamarse una vez por boton de la barra
    /// de tareas. Se vuelve a poner a `false` cuando Windows recrea el boton
    /// (reinicio del Explorador, cambio de posicion de la barra...).
    buttons_added: bool,
}

/// Identificador del mensaje registrado `TaskbarButtonCreated`.
static BUTTON_CREATED_MSG: AtomicU32 = AtomicU32::new(0);

thread_local! {
    static STATE: RefCell<Option<TaskbarState>> = const { RefCell::new(None) };
    static APP: RefCell<Option<AppHandle>> = const { RefCell::new(None) };
}

// ---------------------------------------------------------------------------
// Iconos
// ---------------------------------------------------------------------------

fn set_tip(destination: &mut [u16; 260], text: &str) {
    let encoded: Vec<u16> = text.encode_utf16().take(259).collect();
    destination[..encoded.len()].copy_from_slice(&encoded);
    destination[encoded.len()] = 0;
}

fn truncate(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        text.to_string()
    } else {
        let mut out: String = text.chars().take(max.saturating_sub(1)).collect();
        out.push('…');
        out
    }
}

/// Escribe el .ico embebido en %APPDATA%\tray y lo carga como HICON.
fn load_one(app: &AppHandle, name: &str, bytes: &[u8]) -> Option<HICON> {
    let directory = paths::app_data_dir(app).join("tray");
    std::fs::create_dir_all(&directory).ok()?;
    let path = directory.join(format!("{name}.ico"));

    let stale = std::fs::read(&path)
        .map(|existing| existing != bytes)
        .unwrap_or(true);
    if stale {
        std::fs::write(&path, bytes).ok()?;
    }

    unsafe { load_icon(&path) }
}

unsafe fn load_icon(path: &Path) -> Option<HICON> {
    use std::os::windows::ffi::OsStrExt;
    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    match LoadImageW(None, PCWSTR(wide.as_ptr()), IMAGE_ICON, 16, 16, LR_LOADFROMFILE) {
        Ok(handle) if !handle.0.is_null() => Some(HICON(handle.0)),
        _ => None,
    }
}

impl Icons {
    fn load(app: &AppHandle) -> Option<Self> {
        Some(Self {
            prev: load_one(app, "thumb_prev", include_bytes!("../../assets/thumb_prev.ico"))?,
            play: load_one(app, "thumb_play", include_bytes!("../../assets/thumb_play.ico"))?,
            pause: load_one(app, "thumb_pause", include_bytes!("../../assets/thumb_pause.ico"))?,
            next: load_one(app, "thumb_next", include_bytes!("../../assets/thumb_next.ico"))?,
        })
    }
}

fn make_button(id: u32, icon: HICON, tip: &str, enabled: bool) -> THUMBBUTTON {
    let mut button = THUMBBUTTON::default();
    button.dwMask = THB_ICON | THB_TOOLTIP | THB_FLAGS;
    button.iId = id;
    button.hIcon = icon;
    set_tip(&mut button.szTip, tip);
    button.dwFlags = if enabled { THBF_ENABLED } else { THBF_DISABLED };
    button
}

// ---------------------------------------------------------------------------
// Procedimiento de ventana
// ---------------------------------------------------------------------------

/// Crea el objeto `ITaskbarList3` y anade los tres botones de miniatura.
/// Debe ejecutarse en el hilo principal. Es idempotente: se puede llamar de
/// nuevo cuando Windows recrea el boton de la barra de tareas.
unsafe fn add_buttons(hwnd: HWND) {
    STATE.with(|slot| {
        let mut guard = slot.borrow_mut();
        let Some(state) = guard.as_mut() else { return };

        let taskbar: ITaskbarList3 =
            match CoCreateInstance(&CLSID_TASKBARLIST, None, CLSCTX_INPROC_SERVER) {
                Ok(taskbar) => taskbar,
                Err(error) => {
                    log::warn!("taskbar: no se pudo crear ITaskbarList3: {error}");
                    return;
                }
            };

        if let Err(error) = taskbar.HrInit() {
            log::warn!("taskbar: HrInit fallo: {error}");
            return;
        }

        let center_icon = if state.playing { state.icons.pause } else { state.icons.play };
        let center_tip = if state.playing { "Pausar" } else { "Reproducir" };
        let buttons = [
            make_button(BTN_PREV, state.icons.prev, "Pista anterior", true),
            make_button(BTN_PLAY, center_icon, center_tip, true),
            make_button(BTN_NEXT, state.icons.next, "Pista siguiente", true),
        ];

        match taskbar.ThumbBarAddButtons(hwnd, &buttons) {
            Ok(()) => {
                state.taskbar = taskbar;
                state.hwnd = hwnd;
                state.buttons_added = true;
                log::info!("taskbar: botones de miniatura anadidos");
            }
            Err(error) => {
                // El boton de la barra de tareas puede no existir todavia:
                // Windows avisara con TaskbarButtonCreated y se reintentara.
                state.buttons_added = false;
                log::warn!("taskbar: no se pudo anadir la barra de miniaturas: {error}");
            }
        }
    });
}

unsafe extern "system" fn subclass_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _uidsubclass: usize,
    _dwrefdata: usize,
) -> LRESULT {
    // Windows envia TaskbarButtonCreated cuando crea (o recrea) el boton de la
    // ventana: al iniciar, al reiniciarse el Explorador o al cambiar la barra
    // de tareas de lado. Es el unico momento fiable para anadir los botones.
    let created = BUTTON_CREATED_MSG.load(Ordering::Relaxed);
    if created != 0 && msg == created {
        add_buttons(hwnd);
    }

    if msg == WM_COMMAND {
        let id = (wparam.0 & 0xFFFF) as u32;
        let notification = ((wparam.0 >> 16) & 0xFFFF) as u32;

        if notification == THBN_CLICKED {
            let event = match id {
                BTN_PREV => Some("media://previous"),
                BTN_PLAY => Some("media://toggle-play"),
                BTN_NEXT => Some("media://next"),
                _ => None,
            };

            if let Some(event) = event {
                APP.with(|slot| {
                    if let Some(app) = slot.borrow().as_ref() {
                        let _ = app.emit(event, ());
                    }
                });
            }
        }
    }

    unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
}

// ---------------------------------------------------------------------------
// API publica
// ---------------------------------------------------------------------------

/// Instala la barra de miniaturas. Debe ejecutarse en el hilo principal.
pub fn install(app: &AppHandle, hwnd: HWND) {
    unsafe {
        // Puede devolver S_FALSE si ya estaba inicializado, o
        // RPC_E_CHANGED_MODE si el hilo ya vive en otro apartamento. Se registra
        // porque el resultado decide si hemos cambiado el modelo de apartamento
        // del hilo principal, algo que puede afectar a WebView2.
        let apartment = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        log::info!(
            "taskbar: CoInitializeEx(STA) devolvio 0x{:08X}",
            apartment.0 as u32
        );

        let taskbar: ITaskbarList3 =
            match CoCreateInstance(&CLSID_TASKBARLIST, None, CLSCTX_INPROC_SERVER) {
                Ok(taskbar) => taskbar,
                Err(error) => {
                    log::warn!("no se pudo crear ITaskbarList3: {error}");
                    return;
                }
            };

        if let Err(error) = taskbar.HrInit() {
            log::warn!("HrInit fallo: {error}");
            return;
        }

        let Some(icons) = Icons::load(app) else {
            log::warn!("no se pudieron cargar los iconos de la barra de miniaturas");
            return;
        };

        APP.with(|slot| *slot.borrow_mut() = Some(app.clone()));

        STATE.with(|slot| {
            *slot.borrow_mut() = Some(TaskbarState {
                taskbar,
                hwnd,
                icons,
                playing: false,
                title: String::new(),
                buttons_added: false,
            });
        });

        BUTTON_CREATED_MSG.store(RegisterWindowMessageW(w!("TaskbarButtonCreated")), Ordering::Relaxed);

        if SetWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID, 0).as_bool() {
            log::info!("barra de miniaturas instalada en la barra de tareas");
        } else {
            log::warn!("no se pudo enganchar el procedimiento de ventana");
        }

        // Intento inmediato: si el boton ya existe, no habra nuevo aviso.
        add_buttons(hwnd);

        log::info!("taskbar: install completado");
    }
}

/// Actualiza el icono del boton central segun el estado de reproduccion.
/// Debe ejecutarse en el hilo principal.
pub fn apply_playback_state(playing: bool, title: Option<String>) {
    STATE.with(|slot| {
        let mut guard = slot.borrow_mut();
        let Some(state) = guard.as_mut() else { return };

        if let Some(title) = title {
            state.title = title;
        }

        if state.playing == playing {
            return;
        }
        state.playing = playing;

        if !state.buttons_added {
            return;
        }
        let tip = match (playing, state.title.is_empty()) {
            (true, true) => "Pausar".to_string(),
            (true, false) => format!("Pausar — {}", truncate(&state.title, 90)),
            (false, true) => "Reproducir".to_string(),
            (false, false) => format!("Reproducir — {}", truncate(&state.title, 90)),
        };

        let icon = if playing { state.icons.pause } else { state.icons.play };
        let update = make_button(BTN_PLAY, icon, &tip, true);

        if let Err(error) = unsafe { state.taskbar.ThumbBarUpdateButtons(state.hwnd, &[update]) } {
            log::debug!("no se pudo actualizar el boton de la barra de tareas: {error}");
        }
    });
}

/// Entrada para los comandos: salta al hilo principal, donde vive COM.
pub fn request_state_update(app: &AppHandle, playing: bool, title: Option<String>) {
    let _ = app.run_on_main_thread(move || apply_playback_state(playing, title));
}
