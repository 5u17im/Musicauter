# Audionave (Musicauter) Constitution

## Core Principles

### I. Offline-First & Local Sovereignty
Audionave is a native Windows desktop application (Tauri 2 + Rust + React 18). Once audio tracks are downloaded or indexed from disk, playback, metadata browsing, cover art rendering, and UI icons MUST work 100% offline with zero external network dependencies.

### II. Impeccable Craft & WCAG AA Accessibility
All UI surfaces follow the Impeccable Craft standard (`src/styles/tokens.css` in OKLCH color space, `.agents/skills/impeccable/SKILL.md`):
- Contrast ratio $\ge 4.5:1$ for text and $\ge 3:1$ for UI controls in both dark and light themes.
- Strict flex/overflow hygiene (`flex-1 min-h-0 overflow-y-auto`) so fixed bars (`TopBar`, `Sidebar`, `PlayerBar`) never clip or overflow.
- Unified iconography exclusively from **Yesicon.app** (`solar:` icon set via `@iconify/react` bundled offline in `src/components/ui/core-icons.ts`).

### III. Real Engine, Zero Mocks
No simulated progress bars, fake timers, or hardcoded recommendation lists:
- Local audio is streamed via `services::media_server` (`127.0.0.1` with session token and HTTP `206 Partial Content` Range support), never loaded whole into memory as Base64.
- Downloads and searches execute through `yt-dlp` and `ffmpeg` with real line-by-line progress parsing (`--progress-template`) and deterministic file path capture (`--print after_move:filepath`).

### IV. Atomic Persistence & Non-Blocking Main Thread
- State files (`library.json`, `settings.json`, `downloads.json`) in `%APPDATA%\com.audionave.desktop` MUST use atomic write-and-rename with `.bak` recovery.
- Heavy I/O or process invocations (`yt-dlp`, `ffmpeg`, binary staging) MUST run on background threads (`spawn_blocking`), never blocking the Tauri main event loop.

### V. Zero Warnings Gate
Every change MUST pass `npm run lint` (`tsc --noEmit`), `npm run build`, and `cargo check` with zero errors before completion.
