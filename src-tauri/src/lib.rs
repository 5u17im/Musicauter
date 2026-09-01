mod services {
  pub mod api;
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      services::api::status,
      services::api::get_stream_url,
      services::api::scan_playlist,
      services::api::search_youtube,
      services::api::download_track,
      services::api::open_folder,
      services::api::get_default_music_dir,
      services::api::list_local_audio,
    ])
    .run(tauri::generate_context!())
    .expect("error while running audionave");
}