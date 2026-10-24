/// The first string value after `"key":` in the config text.
fn config_string<'a>(config: &'a str, key: &str) -> Option<&'a str> {
    config
        .split_once(&format!("\"{key}\""))
        .and_then(|(_, rest)| rest.split_once(':'))
        .and_then(|(_, value)| value.trim().strip_prefix('"'))
        .and_then(|value| value.split_once('"').map(|(found, _)| found))
}

fn main() {
    let config_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json");
    println!("cargo:rerun-if-changed={}", config_path.display());
    if let Ok(config) = std::fs::read_to_string(&config_path) {
        if let Some(identifier) = config_string(&config, "identifier") {
            println!("cargo:rustc-env=BUGTEXT_IDENTIFIER={identifier}");
        }
        // The runtime config omits bundle settings, so the build number is baked in.
        if let Some(build) = config_string(&config, "bundleVersion") {
            println!("cargo:rustc-env=BUGTEXT_BUILD={build}");
        }
    }
    tauri_build::build()
}
