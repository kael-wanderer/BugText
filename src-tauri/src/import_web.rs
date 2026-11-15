// File ▸ Import ▸ Web Page: fetches one page for the webview to clean. Only
// public HTTPS addresses are reached, every redirect is checked like the
// first address, and each request is pinned to the address that was checked.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, ToSocketAddrs};
use std::time::Duration;

use sha2::{Digest, Sha256};

pub const MAX_PAGE_BYTES: usize = 5 * 1024 * 1024;
const MAX_ADDRESS_CHARS: usize = 2048;
const MAX_REQUESTS: usize = 4; // the first request and three redirects

pub const NOT_HTTPS: &str = "Only https:// addresses can be imported.";
pub const NOT_PUBLIC: &str = "This address is not on the public internet.";
pub const BAD_ADDRESS: &str = "Enter a web address like https://example.com/page.";
pub const TOO_LARGE: &str = "The page is larger than 5 MB.";
pub const NOT_HTML: &str = "This address is not a web page.";
pub const TOO_MANY: &str = "The page redirected too many times.";
pub const UNREACHABLE: &str = "Could not reach the page. Check the address and your connection.";
pub const TIMED_OUT: &str = "The page did not answer in time.";

fn public_v4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    !(a == 0
        || a == 10
        || (a == 100 && (64..128).contains(&b))
        || a == 127
        || (a == 169 && b == 254)
        || (a == 172 && (16..32).contains(&b))
        || (a == 192 && b == 0 && c == 0)
        || (a == 192 && b == 0 && c == 2)
        || (a == 192 && b == 88 && c == 99)
        || (a == 192 && b == 168)
        || (a == 198 && (18..20).contains(&b))
        || (a == 198 && b == 51 && c == 100)
        || (a == 203 && b == 0 && c == 113)
        || a >= 224)
}

fn public_v6(ip: Ipv6Addr) -> bool {
    let s = ip.segments();
    let embedded = |hi: u16, lo: u16| Ipv4Addr::new((hi >> 8) as u8, hi as u8, (lo >> 8) as u8, lo as u8);
    // IPv4-mapped, IPv4-compatible (which also covers :: and ::1), NAT64 and 6to4 carry an IPv4 address.
    if s[..5] == [0, 0, 0, 0, 0] && (s[5] == 0xffff || s[5] == 0) {
        return s[5] == 0xffff && public_v4(embedded(s[6], s[7]));
    }
    if s[..6] == [0x64, 0xff9b, 0, 0, 0, 0] {
        return public_v4(embedded(s[6], s[7]));
    }
    if s[0] == 0x2002 {
        return public_v4(embedded(s[1], s[2]));
    }
    !((s[0] & 0xfe00) == 0xfc00 // unique local
        || (s[0] & 0xffc0) == 0xfe80 // link-local
        || (s[0] & 0xffc0) == 0xfec0 // old site-local
        || (s[0] & 0xff00) == 0xff00 // multicast
        || (s[0] == 0x2001 && s[1] == 0x0db8) // documentation
        || (s[0] == 0x2001 && s[1] == 0) // Teredo
        || s[..4] == [0x100, 0, 0, 0]) // discard
}

/// True only for an address on the public internet.
pub fn public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => public_v4(v4),
        IpAddr::V6(v6) => public_v6(v6),
    }
}

enum Host {
    Ip(IpAddr),
    Domain(String),
}

/// `Url` already writes every IPv4 form (`2130706433`, `0x7f.0.0.1`) as dotted decimal
/// and an IPv6 host in brackets.
fn host_of(url: &reqwest::Url) -> Option<Host> {
    let host = url.host_str().filter(|host| !host.is_empty())?;
    let bare = host.trim_start_matches('[').trim_end_matches(']');
    Some(match bare.parse::<IpAddr>() {
        Ok(ip) => Host::Ip(ip),
        Err(_) => Host::Domain(host.to_string()),
    })
}

/// The owner's address as an `https` URL without its fragment, or the reason it is refused.
pub fn check_address(raw: &str) -> Result<reqwest::Url, String> {
    let raw = raw.trim();
    if raw.is_empty() || raw.chars().count() > MAX_ADDRESS_CHARS {
        return Err(BAD_ADDRESS.into());
    }
    let mut url = reqwest::Url::parse(raw).map_err(|_| BAD_ADDRESS.to_string())?;
    if url.scheme() != "https" {
        return Err(NOT_HTTPS.into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(BAD_ADDRESS.into());
    }
    match host_of(&url) {
        None => return Err(BAD_ADDRESS.into()),
        Some(Host::Ip(ip)) => {
            if !public_ip(ip) {
                return Err(NOT_PUBLIC.into());
            }
        }
        Some(Host::Domain(name)) => {
            let name = name.to_ascii_lowercase();
            let name = name.strip_suffix('.').unwrap_or(&name);
            if name.is_empty()
                || name == "localhost"
                || [".localhost", ".local", ".internal", ".home.arpa"].iter().any(|end| name.ends_with(end))
            {
                return Err(NOT_PUBLIC.into());
            }
        }
    }
    url.set_fragment(None);
    Ok(url)
}

/// The next address of a redirect, checked like the first one.
pub fn next_hop(current: &reqwest::Url, location: &str) -> Result<reqwest::Url, String> {
    if location.trim().is_empty() {
        return Err(UNREACHABLE.into());
    }
    let joined = current.join(location.trim()).map_err(|_| UNREACHABLE.to_string())?;
    check_address(joined.as_str())
}

/// Every resolved address must be public; the request is pinned to the first.
pub fn vet(addrs: &[SocketAddr]) -> Result<SocketAddr, String> {
    let first = *addrs.first().ok_or_else(|| UNREACHABLE.to_string())?;
    if addrs.iter().all(|addr| public_ip(addr.ip())) {
        Ok(first)
    } else {
        Err(NOT_PUBLIC.into())
    }
}

pub fn html_type(content_type: Option<&str>) -> bool {
    let Some(value) = content_type else { return false };
    let essence = value.split(';').next().unwrap_or("").trim().to_ascii_lowercase();
    essence == "text/html" || essence == "application/xhtml+xml"
}

#[derive(serde::Serialize)]
pub struct Page {
    pub url: String,
    pub html: String,
    pub digest: String,
}

fn network_error(error: reqwest::Error) -> String {
    if error.is_timeout() { TIMED_OUT.into() } else { UNREACHABLE.into() }
}

/// A client for one hop: a domain is resolved once here, every answer vetted,
/// and the request pinned to the first, so the HTTP client never looks it up again.
fn client(url: &reqwest::Url) -> Result<reqwest::Client, String> {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let builder = reqwest::Client::builder()
        .https_only(true)
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(20))
        .user_agent(concat!("BugText/", env!("CARGO_PKG_VERSION")));
    let builder = match host_of(url) {
        Some(Host::Domain(domain)) => {
            let port = url.port_or_known_default().unwrap_or(443);
            let addrs: Vec<SocketAddr> =
                (domain.as_str(), port).to_socket_addrs().map_err(|_| UNREACHABLE.to_string())?.collect();
            builder.resolve(&domain, vet(&addrs)?)
        }
        Some(Host::Ip(ip)) if public_ip(ip) => builder,
        _ => return Err(NOT_PUBLIC.into()),
    };
    builder.build().map_err(|_| UNREACHABLE.to_string())
}

#[tauri::command]
pub async fn import_fetch_page(address: String) -> Result<Page, String> {
    let mut url = check_address(&address)?;
    for _ in 0..MAX_REQUESTS {
        let hop = url.clone();
        let client = tauri::async_runtime::spawn_blocking(move || client(&hop))
            .await
            .map_err(|_| UNREACHABLE.to_string())??;
        let mut response = client
            .get(url.clone())
            .header(reqwest::header::ACCEPT, "text/html,application/xhtml+xml")
            .send()
            .await
            .map_err(network_error)?;
        let status = response.status().as_u16();
        if matches!(status, 301 | 302 | 303 | 307 | 308) {
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .unwrap_or("")
                .to_string();
            url = next_hop(&url, &location)?;
            continue;
        }
        if !(200..300).contains(&status) {
            return Err(format!("The page answered with status {status}."));
        }
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        if !html_type(content_type.as_deref()) {
            return Err(NOT_HTML.into());
        }
        if response.content_length().is_some_and(|length| length > MAX_PAGE_BYTES as u64) {
            return Err(TOO_LARGE.into());
        }
        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(network_error)? {
            if body.len() + chunk.len() > MAX_PAGE_BYTES {
                return Err(TOO_LARGE.into());
            }
            body.extend_from_slice(&chunk);
        }
        let digest = Sha256::digest(&body).iter().map(|byte| format!("{byte:02x}")).collect();
        return Ok(Page { url: url.to_string(), html: String::from_utf8_lossy(&body).into_owned(), digest });
    }
    Err(TOO_MANY.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{IpAddr, SocketAddr};

    fn ip(text: &str) -> IpAddr {
        text.parse().unwrap()
    }

    #[test]
    fn public_ip_refuses_non_public_ranges() {
        for text in [
            "0.0.0.0", "10.1.2.3", "100.64.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1",
            "172.31.255.255", "192.0.0.1", "192.0.2.1", "192.168.1.1", "198.18.0.1", "198.51.100.1",
            "203.0.113.1", "224.0.0.1", "240.0.0.1", "255.255.255.255", "::", "::1", "fc00::1",
            "fd12::1", "fe80::1", "ff02::1", "2001:db8::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1",
            "64:ff9b::7f00:1", "2002:7f00:1::1",
        ] {
            assert!(!public_ip(ip(text)), "{text} should not be public");
        }
        for text in ["1.1.1.1", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111", "::ffff:1.1.1.1"] {
            assert!(public_ip(ip(text)), "{text} should be public");
        }
    }

    #[test]
    fn check_address_accepts_https_and_drops_the_fragment() {
        let url = check_address("  https://example.com/a?b=1#frag ").unwrap();
        assert_eq!(url.as_str(), "https://example.com/a?b=1");
    }

    #[test]
    fn check_address_refuses() {
        for raw in ["http://example.com", "ftp://example.com", "file:///etc/passwd"] {
            assert_eq!(check_address(raw).unwrap_err(), NOT_HTTPS, "{raw}");
        }
        let long = format!("https://example.com/{}", "a".repeat(2048));
        for raw in ["", "example.com", "https://", "https://user:pw@example.com/", long.as_str()] {
            assert_eq!(check_address(raw).unwrap_err(), BAD_ADDRESS, "{raw}");
        }
        for raw in [
            "https://localhost/", "https://LOCALHOST./", "https://127.0.0.1/", "https://[::1]/",
            "https://10.0.0.5/", "https://169.254.169.254/latest/meta-data", "https://2130706433/",
            "https://0x7f.0.0.1/", "https://foo.local/", "https://foo.internal/",
        ] {
            assert_eq!(check_address(raw).unwrap_err(), NOT_PUBLIC, "{raw}");
        }
    }

    #[test]
    fn next_hop_checks_the_location() {
        let current = check_address("https://example.com/a/b").unwrap();
        assert_eq!(next_hop(&current, "/c").unwrap().as_str(), "https://example.com/c");
        assert_eq!(next_hop(&current, "http://example.com/").unwrap_err(), NOT_HTTPS);
        assert_eq!(next_hop(&current, "https://127.0.0.1/").unwrap_err(), NOT_PUBLIC);
        assert_eq!(next_hop(&current, "").unwrap_err(), UNREACHABLE);
    }

    #[test]
    fn vet_requires_every_address_public() {
        let a: SocketAddr = "1.1.1.1:443".parse().unwrap();
        let b: SocketAddr = "1.0.0.1:443".parse().unwrap();
        let private: SocketAddr = "10.0.0.1:443".parse().unwrap();
        assert_eq!(vet(&[a, private]).unwrap_err(), NOT_PUBLIC);
        assert_eq!(vet(&[]).unwrap_err(), UNREACHABLE);
        assert_eq!(vet(&[a, b]).unwrap(), a);
    }

    #[test]
    fn html_type_accepts_html_only() {
        for value in ["text/html", "Text/HTML; charset=utf-8", "application/xhtml+xml"] {
            assert!(html_type(Some(value)), "{value}");
        }
        assert!(!html_type(None));
        for value in ["application/pdf", "text/plain", "image/png"] {
            assert!(!html_type(Some(value)), "{value}");
        }
    }
}
