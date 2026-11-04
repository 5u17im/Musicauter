# Auditoría de Brechas (GAP Analysis) — Audionave frente a Sistemas Similares

**Fecha:** 2026-11-04  
**Proyecto:** Audionave (Musicauter) — Tauri 2 + Rust + React 18  
**Sistemas de Referencia Comparados:** Spotube, Moosync, Cider / Apple Music Desktop, Foobar2000 / MusicBee, Dopamine.  
**Estándar de Clasificación:** `GAP-[DOMINIO][NÚMERO]` (`GAP-F##` Funcional, `GAP-P##` Performance/Audio, `GAP-U##` Core/Rust/Win32, `GAP-D##` Diseño/UX, `GAP-S##` Seguridad/Resiliencia).

---

## 1. Matriz Comparativa de Capacidades

| Capacidad / Característica | Audionave (Estado Actual) | Spotube | Moosync | Cider / Apple Music | Foobar2000 / MusicBee |
|---|:---:|:---:|:---:|:---:|:---:|
| **Reproducción Local con Seek Instantáneo** | ✅ Servidor HTTP Range 64KB | ⚠️ Carga completa | ⚠️ Electron File API | ⚠️ Cloud-first | ✅ WASAPI / BASS |
| **Descarga y Extracción YouTube** | ✅ yt-dlp + ffmpeg en vivo | ✅ YouTube Music API | ✅ Invidious / YT | ❌ No disponible | ⚠️ Plugins externos |
| **Mini Reproductor Independiente** | ✅ Ventana nativa Win32 IPC | ⚠️ Overlay interno | ✅ Ventana compacta | ✅ MiniPlayer nativo | ✅ Modo compacto |
| **Integración Barra de Tareas (ITaskbarList3)** | ✅ Botones de miniatura nativos | ❌ No | ❌ No | ❌ No | ✅ Sí (MusicBee) |
| **Teclas Físicas y Flyout Windows 11** | ✅ `MediaSession API` (SMTC) | ✅ Sí | ✅ Sí | ✅ Sí | ✅ Sí |
| **Letras Sincronizadas (Synced Lyrics)** | ❌ **Ausente** | ✅ LRCLIB / Musixmatch | ✅ LRCLIB integrado | ✅ Letras Apple Music | ✅ Tags `.lrc` / Minilyrics |
| **Ecualizador / Normalización de Audio** | ❌ **Ausente** (Visual decorativo) | ✅ EQ 10 bandas | ✅ EQ paramétrico | ✅ EQ + Spatial Audio | ✅ ReplayGain + DSPs |
| **Editor de Etiquetas ID3 en Disco** | ❌ **Ausente** (Solo lectura JSON) | ❌ No | ⚠️ Básico | ❌ No | ✅ Edición masiva tags |
| **Discord Rich Presence (RPC)** | ❌ **Ausente** | ✅ Nativo | ✅ Nativo | ✅ Nativo | ✅ Vía plugin |
| **Caché Temporal de Streams YouTube** | ❌ **Ausente** (Directo de red) | ✅ Caché en disco | ⚠️ Memoria | ⚠️ Stream HTTP | ❌ N/A |
| **Importación Playlists M3U / Spotify** | ⚠️ Solo URL YouTube | ✅ Spotify + M3U | ✅ Spotify + M3U | ⚠️ Solo Apple Music | ✅ M3U, PLS, CUE |
| **Color Dinámico de Carátula (Glow UI)** | ❌ Acentos estáticos OKLCH | ⚠️ Básico | ✅ Dinámico | ✅ Resplandor fluido | ⚠️ Temas estáticos |

---

## 2. Registro Detallado de Brechas Identificadas (GAP Matrix)

### Dominio 1: Funcionalidad de Biblioteca y Contenido (`GAP-F##`)

#### `GAP-F01` — Ausencia de Letras Sincronizadas en Tiempo Real (*Synced Lyrics*)
* **Severidad:** Alta (Impacto directo en experiencia de usuario).
* **Descripción:** Los reproductores modernos (Spotube, Moosync, Apple Music) ofrecen una vista de letras sincronizadas con scroll automático palabra por palabra o línea por línea. Audionave no cuenta con ningún componente ni integración para letras.
* **Solución Técnica Propuesta:**
  1. Conectar con la API pública y gratuita de [LRCLIB](https://lrclib.net/docs) (`https://lrclib.net/api/get?artist_name=...&track_name=...&duration=...`).
  2. Soporte local: lectura de archivos `.lrc` contiguos al archivo de audio en la carpeta de música o tags USLT embebidos extraídos mediante `ffmpeg`.
  3. Crear una vista/pestaña "Letras" en [`NowPlayingView.tsx`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src/views/NowPlayingView.tsx) sincronizada con `currentTime`.

#### `GAP-F02` — Editor de Metadatos y Tags ID3/Vorbis Físicos en Disco
* **Severidad:** Media-Alta.
* **Descripción:** Cuando se descarga una pista desde YouTube, los títulos suelen incluir basura publicitaria (ej. *"Artist - Song (Official Music Video) [HD 4K]"*). Actualmente la biblioteca solo permite indexar; no es posible corregir el título, artista, álbum o año y que dicho cambio se persista físicamente en el archivo de audio (.mp3, .flac, .opus, .m4a).
* **Solución Técnica Propuesta:**
  - Comando Tauri en Rust (`edit_track_metadata`) que emplee `ffmpeg` o un crate nativo como `lofty` / `id3` para reescribir metadatos atómicamente sin reencodear el flujo de audio.

#### `GAP-F03` — Importación de Listas de Reproducción Estándar (M3U / M3U8 y Enlaces de Spotify)
* **Severidad:** Media.
* **Descripción:** Audionave solo permite sincronizar playlists a partir de URLs de YouTube. Los usuarios que migran desde Foobar2000, MusicBee, iTunes o Spotify no pueden importar sus playlists existentes (`.m3u`) ni pegar un enlace público de Spotify para que la app resuelva y descargue los temas automáticamente desde YouTube (como hace Spotube).
* **Solución Técnica Propuesta:**
  - Parser de archivos `.m3u` / `.m3u8` en [`catalog.rs`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src-tauri/src/services/catalog.rs).
  - Parser ligero de metadatos públicos de Spotify (sin requerir cuenta de desarrollador compleja) para extraer nombres de pistas y mapearlas al motor de búsqueda de `yt-dlp`.

#### `GAP-F04` — Historial de Reproducción, Contador de Escuchas y Listas Inteligentes
* **Severidad:** Baja-Media.
* **Descripción:** No se registran estadísticas de uso (`playCount`, `lastPlayedTimestamp`, `skipCount`). No existen colecciones dinámicas automáticas (ej. "Las 50 más escuchadas", "Añadidas en los últimos 30 días", "Nunca reproducidas").
* **Solución Técnica Propuesta:**
  - Agregar campos `playCount: number` y `lastPlayedAt?: number` en [`src/types.ts`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src/types.ts) y [`store.rs`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src-tauri/src/services/store.rs), incrementándolos al superar el 50% de la duración de una pista.
  - Vistas dinámicas en [`PlaylistsView.tsx`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src/views/PlaylistsView.tsx).

---

### Dominio 2: Calidad de Audio y Procesamiento (`GAP-P##`)

#### `GAP-P01` — Falta de Normalización de Volumen (ReplayGain / EBU R128)
* **Severidad:** Alta (Salud auditiva y confort).
* **Descripción:** En bibliotecas combinadas de pistas descargadas de YouTube y archivos locales, el nivel de masterización difiere enormemente. Pasar de una pista con bajo volumen a una canción comprimida comercial provoca saltos de volumen desagradables.
* **Solución Técnica Propuesta:**
  - En el backend: cálculo de ganancia con `ffmpeg -filter:a loudnorm=print_format=json -f null -` durante el escaneo y almacenamiento de `replayGainDb`.
  - En el frontend: nodo `GainNode` en la Web Audio API que compense la ganancia de forma imperceptible antes de emitir a los altavoces.

#### `GAP-P02` — Ecualizador Paramétrico y Procesamiento Web Audio API
* **Severidad:** Media-Alta.
* **Descripción:** El ecualizador visual de [`NowPlayingView.tsx`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src/views/NowPlayingView.tsx) es una animación CSS decorativa fija (`eq-bar`). Audionave no dispone de ecualizador de 5/10 bandas ni de visualizador de espectro real por frecuencias (FFT).
* **Solución Técnica Propuesta:**
  - Como [`media_server.rs`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src-tauri/src/services/media_server.rs) ya emite cabeceras CORS (`Access-Control-Allow-Origin: *`), configurar `crossOrigin="anonymous"` en el elemento `<audio>`.
  - Crear una cadena de nodos Web Audio: `MediaElementSourceNode -> BiquadFilterNode[] -> AnalyserNode -> AudioDestinationNode`.
  - Dibujar un visualizador en canvas 60 FPS reactivo a las ondas de audio reales y ofrecer presets (*Bass Boost*, *Vocal*, *Rock*, *Plano*).

#### `GAP-P03` — Transición entre Pistas: Fundido Cruzado (Crossfade) y Gapless Playback
* **Severidad:** Media.
* **Descripción:** Al finalizar una pista o presionar "Siguiente", hay un corte de silencio abrupto mientras se destruye la fuente y se carga la siguiente.
* **Solución Técnica Propuesta:**
  - Manejo de dos instancias de `HTMLAudioElement` en [`PlayerContext.tsx`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src/context/PlayerContext.tsx) con crossfade por volumen durante los últimos $N$ segundos configurables (0s a 6s).

#### `GAP-P04` — Caché LRU en Disco para Pistas en Streaming
* **Severidad:** Media.
* **Descripción:** Si el usuario reproduce una pista de YouTube sin descargarla, la URL de Google Video expira a los pocos minutos. Si la repite en bucle, se consumen peticiones de red repetidas.
* **Solución Técnica Propuesta:**
  - Buffer de almacenamiento temporal en `%APPDATA%\com.audionave.desktop\cache` (ej. hasta 500 MB) gestionado por Rust, de modo que pistas en streaming frecuentes puedan reanudarse offline sin re-descargar.

---

### Dominio 3: Integración Nativa con Windows y Core Rust (`GAP-U##`)

#### `GAP-U01` — Discord Rich Presence (RPC)
* **Severidad:** Media (Deseabilidad social y paridad con Spotube/Cider).
* **Descripción:** Al reproducir música en Spotube o Cider, el estado de Discord del usuario muestra automáticamente la portada, título, artista, tiempo restante y botón interactivo. Audionave no tiene puente con el socket de Discord.
* **Solución Técnica Propuesta:**
  - Integrar el crate `discord-rich-presence` en `src-tauri` conectado al despachador de eventos de [`taskbar.rs`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src-tauri/src/services/taskbar.rs).
  - Configurable desde Ajustes con un interruptor ("Mostrar en Discord").

#### `GAP-U02` — Atajos de Teclado Globales Fuera de Foco (`tauri-plugin-global-shortcut`)
* **Severidad:** Media.
* **Descripción:** Aunque `navigator.mediaSession` cubre las teclas de hardware multimedia en Windows 11, si el usuario juega en pantalla completa o usa combinaciones personalizadas de teclado (ej. `Ctrl+Alt+Flecha Derecha`), Windows no entrega el evento a la WebView minimizada en segundo plano.
* **Solución Técnica Propuesta:**
  - Instalar `tauri-plugin-global-shortcut` en Tauri 2 con combinaciones configurables en [`SettingsView.tsx`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src/views/SettingsView.tsx).

#### `GAP-U03` — Materiales Nativos Windows 11 (Mica / Acrylic)
* **Severidad:** Baja-Media (Estética de escritorio).
* **Descripción:** Las aplicaciones nativas modernas de Windows 11 (como Dopamine o el nuevo Reproductor Multimedia) aprovechan la translucidez Mica / Acrylic del Desktop Window Manager (DWM).
* **Solución Técnica Propuesta:**
  - Incorporar el crate `window-vibrancy` en `src-tauri` para aplicar `apply_mica` / `apply_acrylic` en la ventana principal y mini reproductor.

---

### Dominio 4: Diseño, UI y Usabilidad Impeccable (`GAP-D##`)

#### `GAP-D01` — Resplandor y Acento Dinámico Basado en Carátula (*Ambient Glow Canvas*)
* **Severidad:** Media.
* **Descripción:** Reproductores premium (Apple Music, Cider, Spotify) extraen los 2 o 3 colores dominantes de la carátula activa y tiñen suavemente el fondo o generan un resplandor ambiental (*ambient glow*) difuso en la barra de reproducción y vista inmersiva. En Audionave la paleta es estática en tokens OKLCH.
* **Solución Técnica Propuesta:**
  - Utilizar una biblioteca ligera como `color-thief-react` o un canvas de 16x16 píxeles para extraer el color dominante de `current.artworkUrl` y setearlo en la variable CSS `--accent-dynamic` con transición suave.

#### `GAP-D02` — Reordenamiento de Cola mediante Arrastre (*Drag & Drop*)
* **Severidad:** Media.
* **Descripción:** En [`QueueDrawer.tsx`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src/components/QueueDrawer.tsx), el usuario solo puede reproducir pistas de la lista o vaciar la cola. No es posible cambiar el orden de las siguientes pistas arrastrándolas.
* **Solución Técnica Propuesta:**
  - Soporte de reordenamiento drag-and-drop accesible mediante HTML5 Drag and Drop o `@dnd-kit/core`.

#### `GAP-D03` — Selección Múltiple y Operaciones Masivas en Biblioteca
* **Severidad:** Media.
* **Descripción:** En [`LibraryView.tsx`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src/views/LibraryView.tsx) no se pueden marcar 10 canciones a la vez con `Ctrl+Click` o `Shift+Click` para descargarlas, enviarlas a una lista o eliminarlas en lote.
* **Solución Técnica Propuesta:**
  - Estado de selección (`selectedTrackIds: Set<string>`) y barra de acciones contextual flotante inferior en [`TrackList.tsx`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src/components/TrackList.tsx).

---

### Dominio 5: Seguridad, Resiliencia y Manejo de Red (`GAP-S##`)

#### `GAP-S01` — Validación Estricta de Rutas y Extensiones en `media_server.rs`
* **Severidad:** Media (Defensa en profundidad).
* **Descripción:** El servidor local decodifica cualquier ruta que coincida con el token efímero y hace `File::open(&path)`. Aunque el token protege contra terceros y solo escucha en `127.0.0.1`, validar que la ruta apunte exclusivamente a extensiones de audio/imagen predefinidas previene lecturas accidentales de archivos no multimedia.
* **Solución Técnica Propuesta:**
  - En [`media_server.rs`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src-tauri/src/services/media_server.rs), verificar que la extensión del archivo pertenezca a la lista blanca antes de llamar a `File::open`.

#### `GAP-S02` — Reconexión Automática ante Interrupciones de Red en Streaming
* **Severidad:** Media.
* **Descripción:** Si la conexión a internet fluctúa mientras suena una pista en streaming de YouTube, el `<audio>` dispara un error terminal sin reintentar automáticamente la conexión.
* **Solución Técnica Propuesta:**
  - Lógica de reintento exponencial con buffer en [`PlayerContext.tsx`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src/context/PlayerContext.tsx).

---

## 3. Matriz de Priorización (Esfuerzo vs. Impacto)

```
       ▲ ALTO
       │
       │   [GAP-F01 Letras Sincronizadas]      [GAP-P01 Normalización / EQ Web Audio]
       │   [GAP-D01 Ambient Glow Carátula]    [GAP-F02 Editor de Tags ID3 en Disco]
IMPACTO│
       │   [GAP-U01 Discord Rich Presence]     [GAP-P03 Crossfade entre pistas]
       │   [GAP-D02 Drag & Drop Cola]          [GAP-F03 Importador M3U / Spotify]
       │   [GAP-S01 Whitelist extensiones]     [GAP-P04 Caché local de Streams]
       │
       └────────────────────────────────────────────────────────────────────────►
         BAJO                                                        ALTO
                                     ESFUERZO
```

### Plan de Acción Recomendado por Fases

1. **Sprint 1 — Experiencia Auditiva y Visual Inmersiva (Alto impacto, bajo/medio esfuerzo):**
   - **`GAP-F01`**: Letras sincronizadas vía LRCLIB en [`NowPlayingView.tsx`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src/views/NowPlayingView.tsx).
   - **`GAP-P02`**: Ecualizador real de 10 bandas + analizador de espectro Canvas 60 FPS con Web Audio API.
   - **`GAP-D01`**: Resplandor ambiental (*ambient glow*) y acento dinámico según carátula activa.

2. **Sprint 2 — Gestión Profesional de Biblioteca y Colecciones:**
   - **`GAP-F02`**: Edición de metadatos ID3 directamente sobre el archivo en disco.
   - **`GAP-D02` / `GAP-D03`**: Selección masiva con Shift/Ctrl y reordenamiento de cola por arrastre.
   - **`GAP-F03`**: Importador de listas `.m3u` y enlaces de Spotify.

3. **Sprint 3 — Integración con el Sistema y Presencia:**
   - **`GAP-U01`**: Discord Rich Presence en Rust.
   - **`GAP-P01`**: Normalización inteligente de volumen (ReplayGain / loudness).
   - **`GAP-S01`**: Whitelist estricta en servidor HTTP local.

