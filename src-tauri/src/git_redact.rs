use regex::Regex;
pub fn redact(text: &str) -> String {
    let mut result = text.to_owned();
    for (pattern, replacement) in [
        (r"(?i)\b(https?)://[^/\s@]+@", "$1://[redacted]@"),
        (r"(?i)authorization:\s*\S.*", "Authorization: [redacted]"),
        (r"(?i)bearer\s+\S+", "Bearer [redacted]"),
        (r"gh[pousr]_[A-Za-z0-9]{20,}", "[redacted]"),
        (r"github_pat_[A-Za-z0-9_]{20,}", "[redacted]"),
        (r"glpat-[A-Za-z0-9_-]{20,}", "[redacted]"),
        (r"xox[baprs]-[A-Za-z0-9-]{10,}", "[redacted]"),
    ] {
        result = Regex::new(pattern)
            .unwrap()
            .replace_all(&result, replacement)
            .into_owned();
    }
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn removes_secrets() {
        let s = redact("https://user:secret@host/x Authorization: Basic abc\nglpat-12345678901234567890 github_pat_12345678901234567890");
        for secret in ["secret", "Basic abc", "glpat-", "github_pat_"] {
            assert!(!s.contains(secret));
        }
        assert!(s.contains("[redacted]"));
    }
}
