/**
 * Puente IPC Tauri v2 <-> Frontend React.
 * Si la app se ejecuta dentro de Tauri invoca los comandos Rust nativos.
 * En modo navegador (web preview), simula los comandos de manera segura.
 */

export const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface BackendStatus {
  ok: boolean;
  msg: String;
  has_ytdlp: boolean;
  has_ffmpeg: boolean;
  default_music_dir: string;
}

export interface DownloadResult {
  ok: boolean;
  file_path?: string;
  error?: string;
}

export interface LocalAudioFile {
  path: string;
  name: string;
  size_bytes: number;
  extension: string;
}

export interface YouTubeSearchResult {
  id: string;
  title: string;
  uploader?: string;
  duration?: number;
  thumbnail?: string;
  url?: string;
}

export async function checkBackendStatus(): Promise<BackendStatus> {
  if (IS_TAURI) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<BackendStatus>("status");
    } catch (e) {
      return {
        ok: false,
        msg: String(e),
        has_ytdlp: false,
        has_ffmpeg: false,
        default_music_dir: "~/Música/Audionave",
      };
    }
  }
  return {
    ok: true,
    msg: "Modo navegador (Simulación activa)",
    has_ytdlp: true,
    has_ffmpeg: true,
    default_music_dir: "~/Música/Audionave",
  };
}

/**
 * Obtiene la URL de streaming en vivo de YouTube o resuelve el protocolo de activo local.
 */
export async function getStreamUrl(urlOrYoutubeId: string): Promise<string> {
  let targetUrl = urlOrYoutubeId;
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    targetUrl = `https://www.youtube.com/watch?v=${urlOrYoutubeId}`;
  }

  if (IS_TAURI) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<string>("get_stream_url", { url: targetUrl });
    } catch (e) {
      console.warn("Fallo al obtener stream en vivo:", e);
      return "";
    }
  }

  // Fallback para modo web demo (audio sintético de prueba)
  return "";
}

/**
 * Transforma una ruta local a una URL válida de Tauri v2 (`asset://` o `http://asset.localhost`)
 */
export async function getLocalAudioUrl(filePath: string): Promise<string> {
  if (IS_TAURI) {
    try {
      const { convertFileSrc } = await import("@tauri-apps/api/core");
      return convertFileSrc(filePath);
    } catch {
      return filePath;
    }
  }
  return filePath;
}

export async function scanPlaylist(url: string, auth: string = "none", browser: string = ""): Promise<any> {
  if (IS_TAURI) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<string>("scan_playlist", { url, auth, browser });
      const parsed = JSON.parse(raw);

      // Si es un video individual (no tiene entries o entries está vacío), normalizarlo a una entrada
      if (!parsed.entries || parsed.entries.length === 0) {
        if (parsed.id || parsed.title) {
          parsed.entries = [
            {
              id: parsed.id,
              title: parsed.title,
              uploader: parsed.uploader || parsed.channel || parsed.artist || "Artista",
              duration: parsed.duration || 0,
              thumbnail: parsed.thumbnail,
            },
          ];
        }
      }
      return parsed;
    } catch (e) {
      return { error: String(e) };
    }
  }

  // Simulación para modo web con datos realistas
  await new Promise((r) => setTimeout(r, 900));
  const isSingle = !url.includes("playlist");
  return {
    title: isSingle ? "Canción Detectada en YouTube" : "YouTube Playlist Seleccionada",
    uploader: "Canal Oficial / Artista",
    thumbnail: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80",
    entries: isSingle
      ? [
          {
            id: "vid-" + Math.random().toString(36).substring(7),
            title: "Pista de Demostración Audio",
            uploader: "Artista Demo",
            duration: 215,
            thumbnail: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80",
          },
        ]
      : [
          {
            id: "vid-1",
            title: "Echoes of the Night",
            uploader: "Kessler Trio",
            duration: 242,
            thumbnail: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80",
          },
          {
            id: "vid-2",
            title: "Golden Hour Resonance",
            uploader: "Marea",
            duration: 198,
            thumbnail: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400&q=80",
          },
          {
            id: "vid-3",
            title: "Analog Waves Pt. 2",
            uploader: "Veltre",
            duration: 280,
            thumbnail: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80",
          },
        ],
  };
}

export async function searchYouTube(query: string): Promise<YouTubeSearchResult[]> {
  if (!query.trim()) return [];

  if (IS_TAURI) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<string>("search_youtube", { query: query.trim() });
      const parsed = JSON.parse(raw);
      const entries = parsed.entries || [];
      return entries.map((e: any) => ({
        id: e.id,
        title: e.title || "Sin título",
        uploader: e.uploader || e.channel || "Artista",
        duration: e.duration || 0,
        thumbnail: e.thumbnail || (e.thumbnails && e.thumbnails[0]?.url),
        url: e.url || (e.id ? `https://www.youtube.com/watch?v=${e.id}` : ""),
      }));
    } catch (e) {
      console.error("Error buscando en YouTube:", e);
      return [];
    }
  }

  // Simulación en modo web
  await new Promise((r) => setTimeout(r, 700));
  return [
    {
      id: "demo-yt-1",
      title: `${query} (Audio Oficial)`,
      uploader: "Canal Oficial de Música",
      duration: 218,
      thumbnail: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    },
    {
      id: "demo-yt-2",
      title: `${query} - En Vivo`,
      uploader: "Live Sessions",
      duration: 265,
      thumbnail: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    },
    {
      id: "demo-yt-3",
      title: `${query} (Remix Acústico)`,
      uploader: "Acoustic Vibes",
      duration: 195,
      thumbnail: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    },
  ];
}

export async function downloadTrack(
  url: string,
  outputDir?: string,
  format: string = "mp3",
  auth: string = "none",
  browser: string = "",
): Promise<DownloadResult> {
  if (IS_TAURI) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<DownloadResult>("download_track", {
        url,
        outputDir,
        format,
        auth,
        browser,
      });
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  // Simulación de descarga en modo web
  await new Promise((r) => setTimeout(r, 1500));
  return { ok: true, file_path: outputDir || "~/Música/Audionave" };
}

export async function openFolder(path?: string): Promise<boolean> {
  if (IS_TAURI) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<boolean>("open_folder", { path });
    } catch {
      return false;
    }
  }
  return true;
}

export async function listLocalAudio(dir?: string): Promise<LocalAudioFile[]> {
  if (IS_TAURI) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<LocalAudioFile[]>("list_local_audio", { dir });
    } catch {
      return [];
    }
  }
  return [];
}