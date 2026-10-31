use crate::git_run::RunOutput;
pub fn classify(_action: &str, out: &RunOutput) -> &'static str {
    if out.cancelled { return "cancelled"; } if out.timed_out { return "timeout"; }
    let s = &out.stderr;
    for (kind, needles) in [
        ("locked", &["index.lock"][..]), ("identity", &["Please tell me who you are", "empty ident"][..]),
        ("auth", &["terminal prompts disabled", "could not read Username", "Authentication failed", "Permission denied (publickey", "Host key verification failed"][..]),
        ("network", &["Could not resolve host", "Failed to connect", "Connection refused", "Connection timed out", "unable to access"][..]),
        ("rejected", &["[rejected]", "non-fast-forward", "fetch first"][..]), ("overwrite", &["would be overwritten"][..]),
        ("diverged", &["Not possible to fast-forward"][..]), ("conflicts", &["CONFLICT"][..]),
        ("no_upstream", &["no upstream", "has no upstream branch", "no such ref was fetched"][..]),
    ] { if needles.iter().any(|needle| s.contains(needle)) { return kind; } }
    "failed"
}
#[cfg(test)] mod tests { use super::*; #[test] fn error_kinds() { for (s, kind) in [("index.lock", "locked"), ("empty ident", "identity"), ("Authentication failed", "auth"), ("Could not resolve host", "network"), ("[rejected]", "rejected"), ("would be overwritten", "overwrite"), ("Not possible to fast-forward", "diverged"), ("CONFLICT", "conflicts"), ("no upstream", "no_upstream"), ("other", "failed")] { let out = RunOutput { exit: Some(1), stdout: vec![], stderr: s.into(), timed_out: false, cancelled: false }; assert_eq!(classify("", &out), kind); } } }
