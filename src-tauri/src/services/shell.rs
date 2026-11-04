//! Integracion con el escritorio de Windows: abrir carpetas, revelar
//! archivos y seleccionar una carpeta con el dialogo nativo.

use std::path::Path;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn silent(exe: &str) -> std::process::Command {
    let mut cmd = std::process::Command::new(exe);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Abre una carpeta en el Explorador de Windows.
pub fn open_folder(path: &Path) -> bool {
    let _ = std::fs::create_dir_all(path);
    let target = path.to_string_lossy().to_string();
    #[cfg(target_os = "windows")]
    {
        silent("explorer").arg(&target).spawn().is_ok()
    }
    #[cfg(not(target_os = "windows"))]
    {
        silent("xdg-open").arg(&target).spawn().is_ok()
    }
}

/// Abre el Explorador con el archivo ya seleccionado.
pub fn reveal_file(path: &Path) -> bool {
    if !path.exists() {
        if let Some(parent) = path.parent() {
            return open_folder(parent);
        }
        return false;
    }
    #[cfg(target_os = "windows")]
    {
        // explorer /select,"ruta" -- el formato de argumento es delicado.
        silent("explorer")
            .arg(format!("/select,{}", path.to_string_lossy()))
            .spawn()
            .is_ok()
    }
    #[cfg(not(target_os = "windows"))]
    {
        open_folder(path.parent().unwrap_or(path))
    }
}

/// Abre una URL en el navegador por defecto.
pub fn open_url(url: &str) -> bool {
    silent("explorer").arg(url).spawn().is_ok()
}

/// Muestra el dialogo nativo de seleccion de carpeta.
///
/// Se usa el FolderBrowserDialog de .NET porque el plugin de dialogos de Tauri
/// no esta disponible en este entorno. El dialogo es el nativo del sistema.
pub fn pick_folder(current: &str) -> Option<String> {
    let preset = if current.trim().is_empty() {
        String::new()
    } else {
        format!(
            "$dlg.SelectedPath = '{}'",
            current.trim().replace('\'', "''")
        )
    };

    let script = format!(
        r#"Add-Type -AssemblyName System.Windows.Forms | Out-Null
$dlg = New-Object System.Windows.Forms.FolderBrowserDialog
$dlg.Description = 'Selecciona la carpeta de musica'
$dlg.ShowNewFolderButton = $true
{preset}
if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{ [Console]::Out.Write($dlg.SelectedPath) }}"#
    );

    let output = silent("powershell.exe")
        .args([
            "-NoProfile",
            "-STA",
            "-WindowStyle",
            "Hidden",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
        ])
        .arg(script)
        .output()
        .ok()?;

    let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if selected.is_empty() {
        None
    } else {
        Some(selected)
    }
}

/// Verifica que una ruta sea utilizable como carpeta de musica.
pub fn ensure_dir(path: &Path) -> Result<(), String> {
    if path.as_os_str().is_empty() {
        return Err("La ruta esta vacia".into());
    }
    std::fs::create_dir_all(path).map_err(|e| format!("No se pudo crear {}: {e}", path.display()))
}
