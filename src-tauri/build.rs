fn main() {
    let config_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json");
    println!("cargo:rerun-if-changed={}", config_path.display());
    if let Ok(config) = std::fs::read_to_string(&config_path) {
        if let Some(identifier) = config
            .split_once("\"identifier\"")
            .and_then(|(_, rest)| rest.split_once(':'))
            .and_then(|(_, value)| value.trim().strip_prefix('"'))
            .and_then(|value| value.split_once('"').map(|(identifier, _)| identifier))
        {
            println!("cargo:rustc-env=BUGTEXT_IDENTIFIER={identifier}");
        }
    }
    tauri_build::build()
}
