# Audionave

Aplicación de escritorio para **Windows** que descarga música de YouTube a tu disco,
reproduce tu biblioteca local y organiza automáticamente artista, álbum, duración y
carátulas.

No es una web ni necesita servidor: se instala como cualquier programa de Windows y
funciona sin conexión una vez descargada la música.

---

## Estado del proyecto

| | |
|---|---|
| Framework | Tauri 2 (núcleo Rust + WebView2) |
| Interfaz | React 18 + TypeScript + Vite |
| Instaladores | NSIS (`.exe`) y MSI (`.msi`), instalación por usuario (sin UAC) |
| Persistencia | JSON con escritura atómica en `%APPDATA%\com.audionave.desktop` |
| Motor de audio | yt-dlp + ffmpeg empaquetados dentro de la aplicación |

### ¿Y por qué no Next.js?

No aporta nada aquí. Next.js necesita un servidor Node o un *export* estático, y Tauri
ya produce un ejecutable nativo con instalador. Migrar supondría trabajo sin ninguna
ventaja: mismo React, más piezas móviles y ningún beneficio de escritorio. La interfaz
ya es React y se compila a archivos estáticos que la WebView2 carga desde el binario.

---

## Requisitos

**Para usar la aplicación instalada:** Windows 10/11 con WebView2 (viene de serie en
Windows 11 y en Windows 10 actualizado). El instalador incluye todo lo demás.

**Para compilar desde el código:**

- Node.js 20+ y npm
- Rust estable (MSVC) + Visual Studio Build Tools con el compilador de C++
- PowerShell 7 (opcional, para el script de binarios)
- Conexión a internet la primera vez (para bajar yt-dlp y ffmpeg)

---

## Compilar

```powershell
# 1. Dependencias de la interfaz
npm install

# 2. Binarios de terceros (~165 MB, no se versionan)
npm run binaries

# 3. Desarrollo con recarga en caliente
npm run app:dev

# 4. Instalador de producción
npm run app:build
```

> **Aviso importante:** compila siempre con los scripts de npm (`app:dev`,
> `app:build`) o con `npm run tauri build`. Un `cargo build` directo **no embebe
> correctamente el frontend**: el ejecutable arranca y la ventana responde, pero
> aparece vacía porque no encuentra los archivos de la interfaz. Es un fallo
> silencioso y difícil de diagnosticar.

Los instaladores quedan en:

```
src-tauri/target/release/bundle/nsis/Audionave_<version>_x64-setup.exe
src-tauri/target/release/bundle/msi/Audionave_<version>_x64_en-US.msi
```

---

## Dónde vive todo

```
%APPDATA%\com.audionave.desktop\
├── library.json     biblioteca: pistas y playlists
├── settings.json    ajustes (carpeta de música, formato, tema...)
├── downloads.json   cola e historial de descargas
├── covers\          carátulas extraídas de tus archivos
├── tray\            iconos de la barra de miniaturas
├── logs\            audionave.log (también en la versión final)
└── bin\             copia actualizable de yt-dlp.exe
```

Tanto `library.json` como `settings.json` se escriben de forma atómica y se conserva
una copia `.bak`; si un archivo se corrompe, la aplicación lo recupera de la copia.

La música va por defecto a `%USERPROFILE%\Music\Audionave` y puedes cambiarlo desde
**Ajustes → Carpeta de música**.

### ¿Por qué los binarios se copian a `%APPDATA%`?

Solo se copia **yt-dlp** (17 MB). Es lo mínimo imprescindible porque `yt-dlp -U`
necesita escribir sobre su propio ejecutable, y la carpeta de instalación puede
ser de solo lectura. **ffmpeg nunca se copia**: son 139 MB que no aportan nada
duplicándolos, así que se ejecuta directamente desde el directorio de instalación.
La copia se hace una vez, en segundo plano, y de forma atómica (fichero temporal
y renombrado), de modo que nunca queda un yt-dlp a medias. La carpeta de
instalación puede ser de solo lectura, así que en el primer arranque se copian a
`%APPDATA%`, que siempre es escribible. Un yt-dlp desactualizado es la causa número
uno de que las descargas dejen de funcionar: YouTube cambia y yt-dlp se adapta.

**Ajustes → Diagnóstico → Actualizar yt-dlp** hace exactamente eso.

---

## Interfaz

### Barra del reproductor

Carátula con ecualizador superpuesto mientras suena, etiquetas de estado
(descargado / en streaming), transporte con indicador de carga y una barra de
progreso propia con arrastre, vista previa del minuto bajo el cursor y control
por teclado (flechas para moverse, Mayús para pasos grandes).

### Mini reproductor

Una ventana compacta, sin marco, siempre visible y arrastrable, para controlar
la música sin volver a la ventana principal. Se abre desde el botón de la barra
del reproductor. Reproduce, pausa, cambia de pista, activa aleatorio/repetido y
permite saltar a cualquier punto.

No crea su propio elemento de audio (eso daría dos reproducciones
independientes). La ventana principal difunde su estado por el evento
`player://state` y el mini reproductor devuelve comandos por `media://*`.

### Barra de miniaturas de la barra de tareas

Al pasar el cursor por el icono de Audionave en la barra de tareas, Windows
muestra la vista previa de la ventana. Encima de esa vista previa aparecen tres
botones: **pista anterior**, **reproducir/pausar** y **pista siguiente**. El
botón central cambia de icono y de tooltip según el estado, e incluye el título
de la canción en curso.

Se implementa con `ITaskbarList3` (COM) y una subclase del procedimiento de
ventana para recibir los clics. Los iconos se generan con
`scripts/make-thumb-icons.mjs` y se embeben en el binario.

### Animaciones

Entrada escalonada de las filas, transición entre vistas, elevación de tarjetas
con barrido de luz, latido del corazón al marcar favorito, brillo en las barras
de progreso activas y respiración del botón de reproducción. Todo el movimiento
se desactiva automáticamente si el sistema tiene activado *reducir movimiento*
(`prefers-reduced-motion`).

---

## Arquitectura

```
src-tauri/src/
├── lib.rs                  montaje de la app, comandos, bandeja, instancia única
└── services/
    ├── paths.rs            rutas nativas y binarios actualizables
    ├── store.rs            persistencia JSON atómica en %APPDATA%
    ├── catalog.rs          indexado de la biblioteca local (metadatos vía ffmpeg)
    ├── yt.rs               motor yt-dlp: búsqueda, playlists, descargas con progreso
    ├── media_server.rs     servidor HTTP local con soporte de Range
    └── shell.rs            Explorador de Windows y selector de carpetas
```

### Decisiones que merece la pena conocer

**El audio se sirve por HTTP local, no embebido en base64.** La versión anterior leía
el archivo entero y lo convertía a base64: un FLAC de 60 MB acababa como una cadena de
~80 MB en memoria. Ahora `media_server.rs` escucha solo en `127.0.0.1`, en un puerto
efímero, protegido por un token aleatorio por sesión, y responde a las peticiones
`Range` con `206 Partial Content` en bloques de 64 KB. Eso es lo que permite hacer
*seek* sin cargar el archivo en memoria.

**El progreso de descarga es real.** Se lanza yt-dlp con `--progress-template` y
`--newline`, se leen sus líneas y se emiten eventos `download://progress` a la
interfaz. La versión anterior simulaba el avance con `Math.random()` y abortaba a los
45 segundos.

**La ruta final la entrega yt-dlp**, con `--print after_move:filepath`. Antes se
buscaba "el archivo más reciente de la carpeta", lo que con tres descargas en paralelo
asignaba archivos equivocados a las pistas.

**No hay dependencias más allá de Tauri.** La extracción de metadatos usa el propio
ffmpeg empaquetado en lugar de añadir una biblioteca de decodificación, y el servidor
de medios son ~200 líneas de `std::net`.

---

## Diagnóstico

**Las descargas fallan o dan error 403.**
Actualiza yt-dlp desde Ajustes. Si sigue fallando, activa las cookies del navegador en
Ajustes → Autenticación (y cierra el navegador durante la descarga).

**Un archivo descargado no aparece en la biblioteca.**
Ajustes → Carpeta de música → **Escanear carpeta**. Indexa todo lo que haya ahí, tenga
o no etiquetas, y extrae las carátulas incrustadas.

**No se oye nada al reproducir.**
Comprueba que el archivo exista en disco. Si la pista es de YouTube y no está
descargada, se reproduce en streaming y necesita conexión.

**Dónde mirar cuando algo falla.**
Todo se registra en `%APPDATA%\com.audionave.desktop\logs\audionave.log`, también
en la versión final. El arranque de la interfaz deja cuatro trazas
(`arranque: pidiendo estado del backend` … `arranque: listo`): si la última no es
`listo`, ahí está el problema.

**Arrancar sin la barra de miniaturas** (para descartar problemas de integración
con la barra de tareas):
```powershell
$env:AUDIONAVE_NO_TASKBAR = "1"; & "$env:LOCALAPPDATA\Audionave\audionave.exe"
```

**El cierre de ventana no cierra la aplicación.**
Es intencionado: sigue en la bandeja del sistema para no cortar las descargas. Usa
**Salir** en el menú de la bandeja, o desactiva la opción en Ajustes → Escritorio.

---

## Limitaciones conocidas

- **Sin firma de código.** El instalador funcionará, pero Windows SmartScreen mostrará
  "Windows protegió tu PC" la primera vez. Se elimina comprando un certificado de firma
  de código (EV o estándar) y configurando `bundle.windows.certificateThumbprint`.
- **Sin atajos multimedia globales del teclado.** El control de reproducción está
  disponible desde la bandeja del sistema, el mini reproductor y la barra de
  miniaturas de la barra de tareas, pero las teclas multimedia físicas del teclado
  no están capturadas globalmente: eso requiere `tauri-plugin-global-shortcut`.
- **Sin actualización automática de la propia aplicación.** Actualizar yt-dlp sí está
  integrado. Para la app hace falta el plugin `tauri-plugin-updater`, un par de claves
  de firma y un `latest.json` alojado (por ejemplo en GitHub Releases).
- **Sin ecualizador ni visualizador de espectro real** (el de la vista "En
  reproducción" es decorativo).

---

## Licencia

MIT. yt-dlp y ffmpeg se distribuyen con sus propias licencias; ffmpeg se usa en su
build GPL, que solo se invoca como proceso externo.
