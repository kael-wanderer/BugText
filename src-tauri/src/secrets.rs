use keyring::{Entry, Error};

const SERVICE: &str = "com.kael.bugtext";

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
}

#[tauri::command]
pub fn has_secret(id: String) -> bool {
    entry(SERVICE, &id)
        .ok()
        .is_some_and(|entry| entry.get_password().is_ok())
}

#[tauri::command]
pub fn delete_secret(id: String) -> Result<(), String> {
    match entry(SERVICE, &id)?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}
