use keyring::{Entry, Error};

const SERVICE: &str = "com.kael.mdflow";
const LEGACY_SERVICE: &str = "com.kael.mdflow";

fn entry(service: &str, id: &str) -> Result<Entry, String> {
    Entry::new(service, id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_secret(id: String, secret: String) -> Result<(), String> {
    entry(SERVICE, &id)?
        .set_password(&secret)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_secret(id: String) -> Option<String> {
    entry(SERVICE, &id)
        .ok()
        .and_then(|entry| entry.get_password().ok())
        .or_else(|| {
            entry(LEGACY_SERVICE, &id)
                .ok()
                .and_then(|entry| entry.get_password().ok())
        })
}

#[tauri::command]
pub fn delete_secret(id: String) -> Result<(), String> {
    for service in [SERVICE, LEGACY_SERVICE] {
        match entry(service, &id)?.delete_credential() {
            Ok(()) | Err(Error::NoEntry) => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(())
}
