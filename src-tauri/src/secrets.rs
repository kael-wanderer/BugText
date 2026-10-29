use std::collections::HashMap;
use std::sync::Mutex;

use keyring::{Entry, Error};

const SERVICE: &str = "com.kael.bugtext";

/// Answers from this run, by secret id. `None` means no secret (or a refused read).
static CACHE: Mutex<Option<HashMap<String, Option<String>>>> = Mutex::new(None);

fn entry(service: &str, id: &str) -> Result<Entry, String> {
    Entry::new(service, id).map_err(|error| error.to_string())
}

fn remember(id: &str, value: Option<String>) {
    if let Ok(mut cache) = CACHE.lock() {
        cache.get_or_insert_with(HashMap::new).insert(id.to_string(), value);
    }
}

fn recalled(id: &str) -> Option<Option<String>> {
    CACHE.lock().ok()?.as_ref()?.get(id).cloned()
}

/// Reads the keychain at most once per id per app run. Every keychain read by an
/// ad-hoc signed build asks for the login password, so settings pages and CLI runs
/// reuse the first answer instead of asking again.
fn read(id: &str) -> Option<String> {
    if let Some(value) = recalled(id) {
        return value;
    }
    let value = entry(SERVICE, id)
        .ok()
        .and_then(|entry| entry.get_password().ok());
    remember(id, value.clone());
    value
}

#[tauri::command]
pub fn set_secret(id: String, secret: String) -> Result<(), String> {
    entry(SERVICE, &id)?
        .set_password(&secret)
        .map_err(|error| error.to_string())?;
    remember(&id, Some(secret));
    Ok(())
}

#[tauri::command]
pub fn get_secret(id: String) -> Option<String> {
    read(&id)
}

#[tauri::command]
pub fn has_secret(id: String) -> bool {
    read(&id).is_some()
}

#[tauri::command]
pub fn delete_secret(id: String) -> Result<(), String> {
    match entry(SERVICE, &id)?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => {
            remember(&id, None);
            Ok(())
        }
        Err(error) => Err(error.to_string()),
    }
}
