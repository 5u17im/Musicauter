//! Servidor HTTP local minimo para reproducir audio desde disco.
//!
//! Por que existe: la version anterior leia el archivo entero y lo convertia
//! a base64 (un FLAC de 60 MB se transformaba en ~80 MB de cadena en memoria).
//! El protocolo `asset` de Tauri requiere la feature `protocol-asset`, que a
//! su vez depende del crate http-range, no disponible en este entorno.
//!
//! Este servidor:
//!  * escucha solo en 127.0.0.1, en un puerto efimero;
//!  * exige un token aleatorio por sesion en la ruta;
//!  * respeta `Range` (respuestas 206), que es lo que permite el seek;
//!  * transmite en bloques de 64 KB, sin cargar el archivo en memoria.

use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;

pub struct MediaServer {
    pub port: u16,
    pub token: String,
}

const CHUNK: usize = 64 * 1024;
const MAX_HEAD: usize = 16 * 1024;

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(high), Some(low)) = (hex_value(bytes[i + 1]), hex_value(bytes[i + 2])) {
                out.push(high * 16 + low);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn content_type(path: &PathBuf) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "opus" => "audio/ogg",
        "ogg" | "oga" => "audio/ogg",
        "m4a" | "m4b" | "aac" => "audio/mp4",
        "wav" => "audio/wav",
        "wma" => "audio/x-ms-wma",
        "aif" | "aiff" => "audio/aiff",
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        _ => "application/octet-stream",
    }
}

/// Arranca el servidor en un hilo propio. El token protege el acceso.
pub fn start() -> std::io::Result<MediaServer> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    let token = uuid::Uuid::new_v4().simple().to_string();

    let thread_token = token.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(stream) = stream else { continue };
            let token = thread_token.clone();
            std::thread::spawn(move || {
                let _ = serve(stream, &token);
            });
        }
    });

    log::info!("servidor de medios escuchando en 127.0.0.1:{port}");
    Ok(MediaServer { port, token })
}

fn http_date() -> String {
    // No se necesita una fecha exacta para un servidor local.
    "Sun, 01 Jan 2024 00:00:00 GMT".to_string()
}

fn write_head(
    stream: &mut TcpStream,
    status: u16,
    reason: &str,
    headers: &[(&str, String)],
) -> std::io::Result<()> {
    let mut head = format!("HTTP/1.1 {status} {reason}\r\n");
    for (name, value) in headers {
        head.push_str(&format!("{name}: {value}\r\n"));
    }
    head.push_str(&format!("Date: {}\r\n", http_date()));
    head.push_str("Access-Control-Allow-Origin: *\r\n");
    head.push_str("Connection: close\r\n\r\n");
    stream.write_all(head.as_bytes())
}

fn send_error(stream: &mut TcpStream, status: u16, reason: &str) {
    let _ = write_head(
        stream,
        status,
        reason,
        &[("Content-Length", "0".to_string())],
    );
}

/// Interpreta `bytes=inicio-fin` y lo acota al tamano real del archivo.
fn parse_range(header: &str, len: u64) -> Option<(u64, u64)> {
    let spec = header.trim().strip_prefix("bytes=")?;
    let (start_raw, end_raw) = spec.split_once('-')?;

    let (start, end) = if start_raw.is_empty() {
        // Sufijo: bytes=-N  -> ultimos N bytes.
        let suffix: u64 = end_raw.trim().parse().ok()?;
        if suffix == 0 || len == 0 {
            return None;
        }
        (len.saturating_sub(suffix), len - 1)
    } else {
        let start: u64 = start_raw.trim().parse().ok()?;
        let end = match end_raw.trim() {
            "" => len.saturating_sub(1),
            value => value.parse().ok()?,
        };
        (start, end)
    };

    if len == 0 || start >= len {
        return None;
    }
    Some((start, end.min(len - 1)))
}

fn serve(mut stream: TcpStream, token: &str) -> std::io::Result<()> {
    let _ = stream.set_nodelay(true);

    let mut reader = BufReader::new(stream.try_clone()?);
    let mut request_line = String::new();
    if reader.read_line(&mut request_line)? == 0 {
        return Ok(());
    }

    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("").to_string();
    let target = parts.next().unwrap_or("").to_string();

    // Cabeceras: solo interesa Range.
    let mut range_header: Option<String> = None;
    let mut consumed = request_line.len();
    loop {
        let mut line = String::new();
        let read = reader.read_line(&mut line)?;
        if read == 0 || consumed > MAX_HEAD {
            break;
        }
        consumed += read;
        if line == "\r\n" || line == "\n" {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            if name.trim().eq_ignore_ascii_case("range") {
                range_header = Some(value.trim().to_string());
            }
        }
    }

    if method != "GET" && method != "HEAD" {
        send_error(&mut stream, 405, "Method Not Allowed");
        return Ok(());
    }

    // Ruta esperada: /<token>/<ruta-percent-encoded>
    let without_slash = target.trim_start_matches('/');
    let Some((received_token, encoded_path)) = without_slash.split_once('/') else {
        send_error(&mut stream, 400, "Bad Request");
        return Ok(());
    };

    if received_token != token {
        send_error(&mut stream, 403, "Forbidden");
        return Ok(());
    }

    let decoded = percent_decode(encoded_path);
    let path = PathBuf::from(decoded);
    let Ok(mut file) = File::open(&path) else {
        send_error(&mut stream, 404, "Not Found");
        return Ok(());
    };

    let len = file.metadata().map(|m| m.len()).unwrap_or(0);
    let mime = content_type(&path).to_string();

    let (status, reason, start, end) = match range_header.as_deref().and_then(|r| parse_range(r, len)) {
        Some((start, end)) => (206, "Partial Content", start, end),
        None => (200, "OK", 0, len.saturating_sub(1)),
    };

    let body_len = if len == 0 { 0 } else { end - start + 1 };

    let mut headers: Vec<(&str, String)> = vec![
        ("Content-Type", mime),
        ("Content-Length", body_len.to_string()),
        ("Accept-Ranges", "bytes".to_string()),
        ("Cache-Control", "no-store".to_string()),
    ];
    if status == 206 {
        headers.push((
            "Content-Range",
            format!("bytes {start}-{end}/{len}"),
        ));
    }

    write_head(&mut stream, status, reason, &headers)?;

    if method == "HEAD" || body_len == 0 {
        return Ok(());
    }

    if start > 0 {
        file.seek(SeekFrom::Start(start))?;
    }

    let mut remaining = body_len;
    let mut buffer = vec![0u8; CHUNK];
    while remaining > 0 {
        let want = remaining.min(CHUNK as u64) as usize;
        let read = file.read(&mut buffer[..want])?;
        if read == 0 {
            break;
        }
        stream.write_all(&buffer[..read])?;
        remaining -= read as u64;
    }
    let _ = stream.flush();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_percent_escapes() {
        assert_eq!(percent_decode("a%20b"), "a b");
        assert_eq!(percent_decode("C%3A%2Fdir%2Fsong.mp3"), "C:/dir/song.mp3");
        // Acentos codificados en UTF-8.
        assert_eq!(percent_decode("S%C3%A1bado"), "Sábado");
        // Escapes incompletos se dejan tal cual en lugar de romper.
        assert_eq!(percent_decode("%zz"), "%zz");
        assert_eq!(percent_decode("%2"), "%2");
    }

    #[test]
    fn parses_explicit_range() {
        assert_eq!(parse_range("bytes=0-99", 1000), Some((0, 99)));
        assert_eq!(parse_range("bytes=100-", 1000), Some((100, 999)));
        // Se acota al tamano real del archivo.
        assert_eq!(parse_range("bytes=999-5000", 1000), Some((999, 999)));
    }

    #[test]
    fn parses_suffix_range() {
        // bytes=-N => los ultimos N bytes.
        assert_eq!(parse_range("bytes=-100", 1000), Some((900, 999)));
        assert_eq!(parse_range("bytes=-5000", 1000), Some((0, 999)));
    }

    #[test]
    fn rejects_invalid_ranges() {
        assert_eq!(parse_range("bytes=1000-", 1000), None);
        assert_eq!(parse_range("items=0-10", 1000), None);
        assert_eq!(parse_range("bytes=abc-", 1000), None);
        assert_eq!(parse_range("bytes=-0", 1000), None);
        assert_eq!(parse_range("bytes=0-10", 0), None);
    }

    #[test]
    fn maps_content_types() {
        assert_eq!(content_type(&PathBuf::from("a.mp3")), "audio/mpeg");
        assert_eq!(content_type(&PathBuf::from("a.FLAC")), "audio/flac");
        assert_eq!(content_type(&PathBuf::from("a.m4a")), "audio/mp4");
        assert_eq!(content_type(&PathBuf::from("covers/x.jpg")), "image/jpeg");
        assert_eq!(content_type(&PathBuf::from("a.weird")), "application/octet-stream");
    }
}
