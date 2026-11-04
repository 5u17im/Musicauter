# Reglas de Agentes, Roles y Habilidades del Proyecto — Audionave (Musicauter)

Este archivo define las directrices arquitectónicas, de diseño, metodológicas y los perfiles de agentes requeridos para el desarrollo de **Audionave** (Aplicación de escritorio nativa para Windows con Tauri 2, Rust, React 18 y motor local `yt-dlp` / `ffmpeg`), alineada con el ecosistema **NothingSense**. Todos los agentes y desarrolladores que colaboren en este repositorio deben alinear su comportamiento con estas reglas.

---

## 📂 Mapa Arquitectónico del Proyecto

| Directorio / Módulo | Componente | Stack / Rol |
|---|---|---|
| [`/src-tauri/src/lib.rs`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src-tauri/src/lib.rs) | **Core Tauri 2 & Ventanas** | Orquestación IPC, bandeja del sistema (Tray), cerrojo TCP de instancia única y ciclo de vida de ventanas (`main` y `mini`). |
| [`/src-tauri/src/services/yt.rs`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src-tauri/src/services/yt.rs) | **Motor de Extracción** | Integración con `yt-dlp` y `ffmpeg`: búsqueda en YouTube, mezclas reales (`RD<videoId>`), progreso de descarga en tiempo real y cancelación de procesos (`taskkill /T /F`). |
| [`/src-tauri/src/services/media_server.rs`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src-tauri/src/services/media_server.rs) | **Servidor HTTP Local** | Streaming de archivos locales desde `127.0.0.1` con token efímero por sesión y soporte `Range` (`206 Partial Content` en bloques de 64 KB) para *seek* instantáneo sin inflar la RAM. |
| [`/src-tauri/src/services/catalog.rs`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src-tauri/src/services/catalog.rs) | **Indexador de Biblioteca** | Escaneo recursivo de disco, lectura de metadatos y extracción de carátulas embebidas mediante `ffmpeg`. |
| [`/src-tauri/src/services/store.rs`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src-tauri/src/services/store.rs) | **Persistencia Atómica** | Almacenamiento JSON en `%APPDATA%\com.audionave.desktop` (`library.json`, `settings.json`, `downloads.json`) con escritura atómica y respaldo `.bak`. |
| [`/src-tauri/src/services/taskbar.rs`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src-tauri/src/services/taskbar.rs) | **Integración Windows COM** | Controles multimedia nativos en la miniatura de la barra de tareas de Windows mediante `ITaskbarList3`. |
| [`/src/context/PlayerContext.tsx`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src/context/PlayerContext.tsx) | **Motor de Audio React** | Máquina de estados (`useReducer`), control de `<audio>` HTML5, integración con `MediaSession API` (teclas físicas multimedia y flyout de Windows 11) y sincronización IPC con el Mini Reproductor. |
| [`/src/components/ui/Icon.tsx`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src/components/ui/Icon.tsx) | **Sistema Iconográfico** | Componente vectorial unificado sobre `@iconify/react` con colección **Solar** de [Yesicon.app](https://yesicon.app/es) compilada localmente (`core-icons.ts`, 0 ms offline). |
| `/.specify/` & `/.agents/skills/` | **Spec-Kit & Impeccable** | Flujo de desarrollo guiado por especificaciones (`speckit-*`) y directrices de diseño y pulido visual (`impeccable`). |

---

## 1. Directrices de Diseño y Usabilidad Premium (Impeccable Craft)

Para evitar interfaces genéricas construidas sin planeamiento estructurado y garantizar una experiencia de escritorio de primer nivel, se imponen las siguientes reglas obligatorias (complementadas por [`.agents/skills/impeccable/SKILL.md`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/.agents/skills/impeccable/SKILL.md)):

### A. Estructura, Estética y Semántica Premium
*   **No a los clichés visuales:** Quedan prohibidos los degradados de neón saturados sobre fondos negros planos que carezcan de contraste, jerarquía y legibilidad.
*   **Diseño Fluido y Consistente:** Usar la paleta de tokens **OKLCH** definida en [`src/styles/tokens.css`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src/styles/tokens.css), con espaciados en escala armónica (`4, 8, 12, 16, 24, 32, 48px`), bordes sutiles y tipografías con jerarquías claras.
*   **Componentes Reutilizables:** Evitar estilos arbitrarios inconsistentes. El diseño debe basarse en el sistema estructurado de tokens visuales y clases de componentes (`src/styles/`).
*   **Sin placeholders:** Todos los recursos gráficos, iconos de barra de tareas y vistas vacías deben ser funcionales y vectoriales.

### B. Higiene de Layout, Overflow y Controles Accesibles
*   **Prevención Estricta de Desbordamiento:** Utilizar layouts flexibles con límites claros (`flex-1 min-h-0 overflow-y-auto` en áreas de scroll interno) para que `TopBar`, `Sidebar` y `PlayerBar` permanezcan fijos (`shrink-0`) y nunca se desborden ni se recorten.
*   **Áreas de Impacto:** Los botones principales de navegación y transporte deben ofrecer áreas cómodas de clic/toque (40px–48px en ventana principal) y objetivos claramente espaciados.

### C. Estados de Interacción Completos
*   Cada elemento interactivo debe poseer estados explícitos y pulidos de:
    *   `hover` (interacción de cursor).
    *   `focus-visible` (accesibilidad por teclado y anillo de foco evidente).
    *   `active` (pulsación y respuesta micro-interactiva).
    *   `disabled` (deshabilitado, con opacidad y cursor coherentes).
    *   `loading` (estado de carga con indicador no bloqueante).

### D. Sistema Visual y Editorial Premium

**Principios rectores:**
1.  Menos espectáculo, más sistema. La UI debe sentirse diseñada para uso real y prolongado, no para demo.
2.  Cada vista debe tener una jerarquía clara: tarea principal, contexto, acciones secundarias.
3.  La biblioteca y cola de descargas deben sentirse como herramientas profesionales: densas, escaneables, sobrias.

**Layout, Radius y Sombras:**
*   Evitar tarjetas dentro de tarjetas o secciones enteras flotantes sin estructura.
*   **Radius (`border-radius`):** Controles, tablas y herramientas: `8px` (`--radius-sm`); Tarjetas y modales: `12px` a `16px` (`--radius-md` / `--radius-lg`). **Prohibido:** `rounded-[2.5rem]`, `rounded-[3rem]` en interfaces funcionales.
*   **Sombras:** Usar sombras suaves (`--shadow-sm`, `--shadow`). La separación debe venir primero de espaciado, bordes (`--line`) y contraste.

**Color, Contraste y Cero Degradados en Controles UI:**
*   **Prohibición de Degradados en Controles:** Los botones, badges, barras de navegación, diálogos y textos de control deben emplear **colores sólidos y tokens semánticos** (`--accent`, `--surface-solid`, `--success`, `--danger`).
*   **Contraste Legible (WCAG AA 4.5:1):** Prohibido el uso de grises débiles de bajo contraste para texto secundario. Todo texto secundario debe usar `--text-dim` ($\ge 4.5:1$ en claro y oscuro) y metadatos `--text-faint`.

**Tipografía:**
*   Jerarquía: H1 (`section-title`) $\to$ H2 $\to$ H3 $\to$ Body (`--font-ui`: Inter) $\to$ Duraciones, velocidades y tamaños en monospace tabular (`--font-mono`: JetBrains Mono).

**Iconografía (Obligatoriedad Estricta de `@iconify/react` — Cero `lucide-react` / `@tabler/icons-react`):**
*   **Obligatorio `@iconify/react` Offline:** Toda la iconografía del proyecto debe implementarse exclusivamente a través del componente unificado [`src/components/ui/Icon.tsx`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src/components/ui/Icon.tsx) consumiendo `@iconify/react` con el catálogo de [Yesicon.app](https://yesicon.app/es) (colección `solar:`, ej. `solar:play-bold`, `solar:pause-bold`, `solar:download-square-bold`) compilado localmente en [`src/components/ui/core-icons.ts`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src/components/ui/core-icons.ts) mediante `addCollection` (0 ms de latencia y 100% funcional sin internet).
*   **Prohibición Categórica de Otras Librerías:** Queda terminantemente prohibido instalar, importar o utilizar `lucide-react` o `@tabler/icons-react`.
*   **Sin Mezcla de Emojis:** Evitar mezclar emojis con iconos cuando cumplan la misma función en botones y controles.
*   **Botones de herramientas:** Iconos reconocibles y vectoriales con `title` y `aria-label` descriptivos.

**Badges y Píldoras (Cero Píldoras Decorativas):**
*   Los badges se reservan exclusivamente para indicar estado real del sistema (`En disco`, `Streaming`, `Descargando`, formato de audio) y **nunca como decoración flotante** sobre encabezados.

---

## 2. Arquitectura y Orquestación de Subagentes Asíncronos

Audionave utiliza el modelo de **Subagentes Asíncronos de Antigravity** (`invoke_subagent`, `define_subagent`, `send_message`) para paralelizar tareas complejas y proteger la ventana de contexto del agente principal:

| Subagente (`TypeName`) | Modelo (`Model`) | Rol (`Role`) | Cuándo Invocarlo |
|---|:-:|---|---|
| `audionave-gap-auditor` | `pro` | Auditor de Sistemas y Brechas (GAP) | Auditorías de subsistemas Rust/Tauri, seguridad IPC/HTTP local y redacción de informes en `docs/revisiones/`. |
| `audionave-rust-core` | `pro` | Especialista Rust / Tauri 2 & Win32 | Mejoras en `yt.rs`, `media_server.rs`, `catalog.rs`, `taskbar.rs` (COM) y persistencia atómica en `store.rs`. |
| `audionave-ui-guardian` | `flash` | Guardián Visual Impeccable y WCAG AA | Auditoría o refactorización de componentes para cumplir `@iconify/react` (`solar:`), contraste `4.5:1`, overflow y estados interactivos. |
| `audionave-qa-engineer` | `flash` | Ingeniero QA y Compilación | Verificación asíncrona de tipado (`tsc --noEmit`), build de Vite (`npm run build`) y chequeo de Rust (`cargo check`). |
| `research` / `self` | `flash` / `inherit` | Exploración Read-Only / Clon Operativo | `research` (`Model: "flash"`) para búsquedas extensas de solo lectura; `self` (`Model: "inherit"`) para subtareas de implementación paralela en módulos disjuntos. |

### Reglas de Orquestación Asíncrona (`invoke_subagent`)
1. **Asignación Explícita de Modelo (`Model`):** Pasa explícitamente `"pro"` para arquitectura Rust/Win32 y auditorías GAP, y `"flash"` para auditorías UI/WCAG, QA y búsquedas.
2. **Delegación y Paralelismo sin Polling (*Reactive Wakeup*):** Lanza subagentes independientes en paralelo y finaliza el turno sin hacer *polling*.
3. **Aislamiento de Workspace (`Workspace` mode):** Usa `"inherit"` cuando los subagentes operen sobre archivos disjuntos (ej. `src-tauri/` vs `src/views/`).

---

## 3. Metodología de Trabajo, Spec-Kit y Procedimiento para Agentes

### A. Fase 1: Análisis e Investigación (Read-First)
*   **Lectura antes de Escribir:** Nunca edites código sin comprender la lógica actual en [`src/types.ts`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src/types.ts), [`src/api/index.ts`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src/api/index.ts) y [`src-tauri/src/lib.rs`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src-tauri/src/lib.rs).

### B. Fase 2: Planificación (Planning Mode / GitHub Spec-Kit) y Estandarización de Sprints
*   Para cambios complejos o arquitectónicos, proponer un plan estructurado (`implementation_plan.md`) o utilizar el flujo de **GitHub Spec-Kit** instalado en [`.specify/`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/.specify) y [`.agents/skills/speckit-*`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/.agents/skills) (`speckit-constitution` $\to$ `speckit-specify` $\to$ `speckit-plan` $\to$ `speckit-tasks` $\to$ `speckit-implement`).
*   **Estandarización Estricta de Sprints y Fases:** Toda fase debe enunciarse vinculada a su sprint respectivo bajo el formato `"Sprint X, Fase Y"` (ej. `"Sprint 1, Fase 1"`), garantizando trazabilidad secuencial.

### C. Fase 3: Implementación Incremental y Limpieza
*   **Cambios Atómicos:** Evitar modificaciones masivas no relacionadas en una sola iteración.
*   **Verificación Temprana:** Ejecutar `npm run lint` (`tsc --noEmit`) y `cargo check` periódicamente.
*   **Limpieza de Compilación:** No dejar carpetas temporales ni binarios sueltos en la raíz del proyecto.

### D. Fase 4: Pruebas y Validación (QA)
*   **Compilación de Producción:** Garantizar que `npm run lint`, `npm run build` y `cargo check` pasen con **0 errores** antes de dar por completada una tarea.

### E. Fase 5: Documentación de Revisiones y Estándar de Brechas (GAP)
*   Toda revisión o auditoría formal debe documentarse en `docs/revisiones/` con fecha ISO 8601 (`YYYY-MM-DD-revision-[area].md`).
*   **Codificación Estándar de Brechas (`GAP-[DOMINIO][NÚMERO]`):**
    - Dominios: `GAP-F##` (Funcional), `GAP-S##` (Seguridad/IPC), `GAP-U##` (Core/Rust), `GAP-D##` (Diseño/UX/UI), `GAP-P##` (Performance/Audio).
    - Secuencia acumulativa sin reinicio a `01`.

---

## 4. Estándares de Ingeniería (TypeScript + Rust / Tauri 2)

### A. Tipado Estricto y Sincronización IPC
*   **Cero `any`:** Prohibido el uso de `any` en TypeScript. Los contratos entre Rust (`#[derive(Serialize, Deserialize)]` con `#[serde(rename_all = "camelCase")]`) y TypeScript ([`src/types.ts`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src/types.ts)) deben mantenerse sincronizados.

### B. Manejo de Excepciones, Concurrencia y Recursos Nativos
*   **No ocultar errores:** Evitar bloques `try/catch` vacíos salvo operaciones explícitamente *best-effort* documentadas (como el log auxiliar o la miniatura de barra de tareas).
*   **Hilo Principal Libre en Tauri:** Toda invocación a `yt-dlp`, `ffmpeg` o copia de binarios debe ejecutarse dentro de `tauri::async_runtime::spawn_blocking` para no congelar jamás la ventana de Windows.
*   **Gestión Segura de Audio y Temporizadores con `useRef`:** En [`PlayerContext.tsx`](file:///c:/Users/calve/Documents/Programacion/Tools/Musicauter/src/context/PlayerContext.tsx), la instancia de `HTMLAudioElement`, los identificadores de carga asíncrona (`activeLoadIdRef`) y los intervalos deben manejarse mediante `useRef` para evitar condiciones de carrera al cambiar de pista rápidamente. Never asignar `audio.src = ""` (usar `removeAttribute("src")` + `audio.load()`).
