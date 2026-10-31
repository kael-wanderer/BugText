use std::ffi::OsString;
fn args(parts: &[&str]) -> Vec<OsString> {
    parts.iter().map(OsString::from).collect()
}
fn paths(mut result: Vec<OsString>, values: &[String]) -> Vec<OsString> {
    result.push("--".into());
    result.extend(values.iter().map(OsString::from));
    result
}
pub fn toplevel() -> Vec<OsString> {
    args(&["rev-parse", "--show-toplevel"])
}
pub fn is_bare() -> Vec<OsString> {
    args(&["rev-parse", "--is-bare-repository"])
}
pub fn head() -> Vec<OsString> {
    args(&["rev-parse", "-q", "--verify", "HEAD"])
}
pub fn merging() -> Vec<OsString> {
    args(&["rev-parse", "-q", "--verify", "MERGE_HEAD"])
}
pub fn status(scope: &str) -> Vec<OsString> {
    paths(
        args(&[
            "--no-optional-locks",
            "status",
            "--porcelain=v2",
            "--branch",
            "-z",
            "--untracked-files=normal",
        ]),
        &[scope.into()],
    )
}
pub fn diff(path: &str, has_head: bool) -> Vec<OsString> {
    let mut a = args(&[
        "--no-optional-locks",
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-color",
    ]);
    a.push(if has_head { "HEAD" } else { "--cached" }.into());
    paths(a, &[path.into()])
}
pub fn add(values: &[String]) -> Vec<OsString> {
    paths(args(&["add"]), values)
}
pub fn commit(values: &[String], merging: bool) -> Vec<OsString> {
    let a = args(&["commit", "-F", "-"]);
    if merging {
        a
    } else {
        let mut a = a;
        a.push("--only".into());
        paths(a, values)
    }
}
pub fn fetch() -> Vec<OsString> {
    args(&["fetch", "--no-recurse-submodules"])
}
pub fn pull() -> Vec<OsString> {
    args(&["merge", "--ff-only", "@{u}"])
}
pub fn merge() -> Vec<OsString> {
    args(&["merge", "--no-ff", "--no-commit", "@{u}"])
}
pub fn abort() -> Vec<OsString> {
    args(&["merge", "--abort"])
}
pub fn push() -> Vec<OsString> {
    args(&["push"])
}
pub fn changed(head: &str) -> Vec<OsString> {
    args(&["diff", "--name-only", "-z", head])
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn user_paths_follow_separator_and_push_is_plain() {
        for a in [
            status("--amend"),
            diff("-rf", true),
            add(&["-rf".into()]),
            commit(&["--amend".into()], false),
        ] {
            let index = a.iter().position(|x| x == "--").unwrap();
            assert!(a[index + 1].to_string_lossy().starts_with('-'));
        }
        assert_eq!(push(), vec![OsString::from("push")]);
    }
}
