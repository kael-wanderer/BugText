// Fetches the hosted update feed. The request runs here rather than in the
// webview because the feed host sends no CORS headers.

use std::time::Duration;

const FEED_URL: &str = "https://kael.io.vn/projects/bugtext/latest.json";
const MAX_FEED_BYTES: usize = 64 * 1024;

fn client() -> Result<reqwest::Client, String> {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::limited(3))
        .https_only(true)
        .user_agent(concat!("BugText/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| "Could not start a network request.".to_string())
}

/// Returns the feed body; the frontend parses and compares it.
#[tauri::command]
pub async fn update_feed_fetch() -> Result<String, String> {
    let mut response = client()?
        .get(FEED_URL)
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "The update server did not answer in time.".to_string()
            } else {
                "Could not reach the update server. Check your connection.".to_string()
            }
        })?;
    if !response.status().is_success() {
        return Err(format!(
            "The update server answered with status {}.",
            response.status().as_u16()
        ));
    }
    // Read in chunks so an oversized answer stops early instead of filling memory.
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "The update download was interrupted.".to_string())?
    {
        if body.len() + chunk.len() > MAX_FEED_BYTES {
            return Err("The update feed is too large to read.".to_string());
        }
        body.extend_from_slice(&chunk);
    }
    String::from_utf8(body).map_err(|_| "The update feed could not be read.".to_string())
}
