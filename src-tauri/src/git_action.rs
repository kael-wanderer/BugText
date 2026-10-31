use crate::{
    git::{GitError, GitLogEntry},
    git_args, git_errors, git_redact,
    git_repo::{self, Repo, RepoLocks},
    git_run::{run, GitRuns, RunEnv, RunOutput, RunSpec},
    git_status::{self, GitStatus},
};
use serde::{Deserialize, Serialize};
use std::{
    ffi::OsString,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

#[derive(Deserialize)]
pub struct GitActionReq {
    pub folder: String,
    pub request_id: String,
    pub action: String,
    pub paths: Vec<String>,
    pub message: Option<String>,
}
#[derive(Serialize, Debug)]
pub struct GitActionResult {
    pub outcome: &'static str,
    pub changed: Vec<String>,
    pub log: Vec<GitLogEntry>,
}
struct Action<'a> {
    repo: &'a Repo,
    req: &'a GitActionReq,
    runs: &'a GitRuns,
    env: &'a RunEnv,
    log: Vec<GitLogEntry>,
    timeout: Option<Duration>,
}
impl Action<'_> {
    fn call(&mut self, args: Vec<OsString>, input: Option<&[u8]>, seconds: u64) -> RunOutput {
        let rendered = args
            .iter()
            .map(|s| s.to_string_lossy())
            .collect::<Vec<_>>()
            .join(" ");
        let out = run(RunSpec {
            git: &self.repo.git,
            repo_root: &self.repo.root,
            args,
            stdin: input,
            timeout: self.timeout.unwrap_or(Duration::from_secs(seconds)),
            request_id: Some(&self.req.request_id),
            env: self.env,
            runs: self.runs,
        });
        self.log.push(GitLogEntry {
            at_ms: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
            action: self.req.action.clone(),
            args: git_redact::redact(&rendered),
            exit: out.exit,
            stderr_tail: git_redact::redact(&out.stderr),
        });
        out
    }
    fn error(&self, kind: &'static str) -> GitError {
        GitError {
            kind,
            log: self.log.clone(),
        }
    }
    fn check(&self, out: &RunOutput) -> Result<(), GitError> {
        if out.exit == Some(0) && !out.cancelled && !out.timed_out {
            Ok(())
        } else {
            Err(self.error(git_errors::classify(&self.req.action, out)))
        }
    }
    fn status(&mut self, whole: bool) -> Result<GitStatus, GitError> {
        let merge_out = self.call(git_args::merging(), None, 15);
        if merge_out.cancelled || merge_out.timed_out {
            self.check(&merge_out)?;
        }
        let merge = merge_out.exit == Some(0);
        let scope = if whole || self.repo.subfolder.is_empty() {
            "."
        } else {
            &self.repo.subfolder
        };
        let out = self.call(git_args::status(scope), None, 15);
        self.check(&out)?;
        Ok(git_status::parse_status_all(
            &out.stdout,
            if whole { "" } else { &self.repo.subfolder },
            merge,
        ))
    }
    fn head(&mut self) -> Result<String, GitError> {
        let out = self.call(git_args::head(), None, 15);
        self.check(&out)?;
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_owned())
    }
    fn changed(&mut self, head: &str, extra: Vec<String>) -> Result<Vec<String>, GitError> {
        let out = self.call(git_args::changed(head), None, 15);
        self.check(&out)?;
        let mut paths = extra;
        paths.extend(
            out.stdout
                .split(|b| *b == 0)
                .filter(|s| !s.is_empty())
                .map(|s| String::from_utf8_lossy(s).into_owned()),
        );
        paths.sort();
        paths.dedup();
        Ok(paths
            .into_iter()
            .map(|p| self.repo.root.join(p).to_string_lossy().into_owned())
            .collect())
    }
    fn finish(self, outcome: &'static str, changed: Vec<String>) -> GitActionResult {
        GitActionResult {
            outcome,
            changed,
            log: self.log,
        }
    }
}
fn execute(
    repo: &Repo,
    req: &GitActionReq,
    locks: &RepoLocks,
    runs: &GitRuns,
    env: &RunEnv,
    timeout: Option<Duration>,
) -> Result<GitActionResult, GitError> {
    let mut a = Action {
        repo,
        req,
        runs,
        env,
        log: vec![],
        timeout,
    };
    let mut rel = Vec::new();
    for path in &req.paths {
        rel.push(git_repo::to_repo_rel(repo, path).map_err(|e| a.error(e))?);
    }
    let _guard = locks.lock(&repo.root).map_err(|e| a.error(e))?;
    match req.action.as_str() {
        "commit" => {
            let msg = req.message.as_deref().unwrap_or("").trim();
            if msg.is_empty() {
                return Err(a.error("empty_message"));
            }
            if msg.len() > 65536 || msg.contains('\0') {
                return Err(a.error("failed"));
            }
            let state = a.status(false)?;
            if state.merging {
                if a.status(true)?
                    .entries
                    .iter()
                    .any(|e| e.group == "conflicted")
                {
                    return Err(a.error("conflicts"));
                }
            } else {
                if req.paths.is_empty() {
                    return Err(a.error("outside"));
                }
                let mut new = vec![];
                for (i, path) in req.paths.iter().enumerate() {
                    let entry = state
                        .entries
                        .iter()
                        .find(|e| &e.path == path)
                        .ok_or_else(|| a.error("outside"))?;
                    if entry.group == "conflicted" {
                        return Err(a.error("conflicts"));
                    }
                    if entry.group == "new" {
                        new.push(rel[i].clone());
                    }
                    if let Some(orig) = &entry.orig_path {
                        rel.push(git_repo::to_repo_rel(repo, orig).map_err(|e| a.error(e))?);
                    }
                }
                if !new.is_empty() {
                    let out = a.call(git_args::add(&new), None, 60);
                    a.check(&out)?;
                }
            }
            let out = a.call(
                git_args::commit(&rel, state.merging),
                Some(msg.as_bytes()),
                60,
            );
            a.check(&out)?;
            Ok(a.finish("done", vec![]))
        }
        "fetch" => {
            let out = a.call(git_args::fetch(), None, 120);
            a.check(&out)?;
            Ok(a.finish("done", vec![]))
        }
        "pull" | "merge" => {
            let head = a.head()?;
            if a.status(true)?.upstream.is_none() {
                return Err(a.error("no_upstream"));
            }
            if req.action == "pull" {
                let out = a.call(git_args::fetch(), None, 120);
                a.check(&out)?;
            }
            let out = a.call(
                if req.action == "pull" {
                    git_args::pull()
                } else {
                    git_args::merge()
                },
                None,
                120,
            );
            if out.exit != Some(0) || out.cancelled || out.timed_out {
                let kind = git_errors::classify(&req.action, &out);
                if req.action == "pull" && kind == "diverged" {
                    return Ok(a.finish("diverged", vec![]));
                }
                if req.action == "merge" && !out.cancelled && !out.timed_out {
                    let state = a.status(true)?;
                    let unmerged: Vec<_> = state
                        .entries
                        .into_iter()
                        .filter(|e| e.group == "conflicted")
                        .map(|e| e.path)
                        .collect();
                    if !unmerged.is_empty() {
                        let changed = a.changed(&head, unmerged)?;
                        return Ok(a.finish("conflicts", changed));
                    }
                }
                return Err(a.error(kind));
            }
            let changed = a.changed(&head, vec![])?;
            Ok(a.finish(
                if req.action == "merge" {
                    "merged_staged"
                } else {
                    "done"
                },
                changed,
            ))
        }
        "abort" => {
            let head = a.head()?;
            let paths = a
                .status(true)?
                .entries
                .into_iter()
                .map(|e| e.path)
                .collect();
            let out = a.call(git_args::abort(), None, 60);
            a.check(&out)?;
            let changed = a.changed(&head, paths)?;
            Ok(a.finish("done", changed))
        }
        "resolve" => {
            if req.paths.len() != 1 {
                return Err(a.error("outside"));
            }
            let state = a.status(false)?;
            if !state
                .entries
                .iter()
                .any(|e| e.path == req.paths[0] && e.group == "conflicted")
            {
                return Err(a.error("outside"));
            }
            let content = std::fs::read_to_string(repo.folder.join(&req.paths[0]))
                .map_err(|_| a.error("failed"))?;
            if git_status::has_conflict_markers(&content) {
                return Err(a.error("markers"));
            }
            let out = a.call(git_args::add(&rel), None, 60);
            a.check(&out)?;
            Ok(a.finish("done", vec![]))
        }
        "push" => {
            let state = a.status(true)?;
            if state.merging {
                return Err(a.error("conflicts"));
            }
            if state.upstream.is_none() {
                return Err(a.error("no_upstream"));
            }
            let out = a.call(git_args::push(), None, 120);
            a.check(&out)?;
            Ok(a.finish("done", vec![]))
        }
        _ => Err(a.error("failed")),
    }
}
#[tauri::command]
pub async fn git_action(
    app: tauri::AppHandle,
    req: GitActionReq,
) -> Result<GitActionResult, GitError> {
    if req.paths.iter().any(|p| !git_repo::valid_rel(p)) {
        return Err("outside".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let repo = git_repo::resolve(&req.folder)?;
        execute(
            &repo,
            &req,
            &app.state::<RepoLocks>(),
            &app.state::<GitRuns>(),
            &RunEnv::from_process(),
            None,
        )
    })
    .await
    .map_err(|_| GitError::from("failed"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        io::{Read, Write},
        net::TcpListener,
        path::{Path, PathBuf},
        process::{Command, Output},
        sync::{
            atomic::{AtomicBool, Ordering},
            Arc,
        },
        time::Instant,
    };
    struct Fixture {
        base: PathBuf,
        a: PathBuf,
        b: PathBuf,
        remote: PathBuf,
        env: RunEnv,
        locks: RepoLocks,
        runs: GitRuns,
    }
    impl Fixture {
        fn new(name: &str) -> Option<Self> {
            if !Path::new("/usr/bin/git").exists() {
                eprintln!("git unavailable");
                return None;
            }
            let base =
                std::env::temp_dir().join(format!("bugtext-action-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&base);
            fs::create_dir_all(&base).unwrap();
            let base = base.canonicalize().unwrap();
            fs::write(base.join(".gitconfig"), "[user]\n name = Test\n email = test@example.invalid\n[init]\n defaultBranch = main\n[credential]\n helper =\n").unwrap();
            let f = Self {
                a: base.join("a"),
                b: base.join("b"),
                remote: base.join("remote.git"),
                env: RunEnv {
                    home: base.clone(),
                    path: "/usr/bin:/bin".into(),
                    tmpdir: base.clone(),
                    ssh_auth_sock: None,
                    user: None,
                    logname: None,
                    lang: None,
                },
                base,
                locks: RepoLocks::default(),
                runs: GitRuns::default(),
            };
            if !f
                .cmd(&f.base, &["init", "--bare", f.remote.to_str().unwrap()])
                .status
                .success()
            {
                eprintln!("git unavailable");
                return None;
            }
            f.ok(
                &f.base,
                &["clone", f.remote.to_str().unwrap(), f.a.to_str().unwrap()],
            );
            fs::write(f.a.join("shared.md"), "base\n").unwrap();
            f.ok(&f.a, &["add", "."]);
            f.ok(&f.a, &["commit", "-m", "initial"]);
            f.ok(&f.a, &["push", "-u", "origin", "HEAD"]);
            f.ok(
                &f.base,
                &["clone", f.remote.to_str().unwrap(), f.b.to_str().unwrap()],
            );
            Some(f)
        }
        fn cmd(&self, dir: &Path, args: &[&str]) -> Output {
            Command::new("/usr/bin/git")
                .current_dir(dir)
                .env_clear()
                .env("HOME", &self.base)
                .env("PATH", "/usr/bin:/bin")
                .env("LC_ALL", "C")
                .env("GIT_TERMINAL_PROMPT", "0")
                .args(args)
                .output()
                .unwrap()
        }
        fn ok(&self, dir: &Path, args: &[&str]) -> String {
            let out = self.cmd(dir, args);
            assert!(
                out.status.success(),
                "{:?}: {}",
                args,
                String::from_utf8_lossy(&out.stderr)
            );
            String::from_utf8_lossy(&out.stdout).trim().to_owned()
        }
        fn repo(&self, dir: &Path) -> Repo {
            Repo {
                root: dir.into(),
                folder: dir.into(),
                subfolder: String::new(),
                git: "/usr/bin/git".into(),
            }
        }
        fn action(
            &self,
            dir: &Path,
            action: &str,
            paths: &[&str],
            message: Option<&str>,
        ) -> Result<GitActionResult, GitError> {
            let req = GitActionReq {
                folder: dir.to_string_lossy().into_owned(),
                request_id: "test".into(),
                action: action.into(),
                paths: paths.iter().map(|p| (*p).into()).collect(),
                message: message.map(str::to_owned),
            };
            execute(
                &self.repo(dir),
                &req,
                &self.locks,
                &self.runs,
                &self.env,
                None,
            )
        }
        fn commit_remote(&self, path: &str, content: &str) {
            fs::write(self.b.join(path), content).unwrap();
            self.ok(&self.b, &["add", "."]);
            self.ok(&self.b, &["commit", "-m", "remote"]);
            self.ok(&self.b, &["push"]);
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.base);
        }
    }
    #[test]
    fn selected_commits_new_rename_and_literal_messages() {
        let Some(f) = Fixture::new("commit") else {
            return;
        };
        for p in ["one", "two", "three", "four"] {
            fs::write(f.a.join(p), "base\n").unwrap();
        }
        f.ok(&f.a, &["add", "."]);
        f.ok(&f.a, &["commit", "-m", "seed"]);
        for p in ["one", "two", "three", "four"] {
            fs::write(f.a.join(p), "changed\n").unwrap();
        }
        f.ok(&f.a, &["add", "three"]);
        f.action(&f.a, "commit", &["one", "two"], Some("selected"))
            .unwrap();
        assert_eq!(
            f.ok(&f.a, &["show", "--pretty=format:", "--name-only", "HEAD"]),
            "one\ntwo"
        );
        assert_eq!(f.ok(&f.a, &["diff", "--cached", "--name-only"]), "three");
        assert_eq!(
            f.action(&f.a, "commit", &["four"], Some(" "))
                .unwrap_err()
                .kind,
            "empty_message"
        );
        fs::write(f.a.join("new"), "new\n").unwrap();
        f.action(&f.a, "commit", &["new"], Some("new")).unwrap();
        f.ok(&f.a, &["mv", "one", "renamed"]);
        f.action(&f.a, "commit", &["renamed"], Some("rename"))
            .unwrap();
        assert!(f
            .ok(&f.a, &["show", "--pretty=format:", "--name-status", "HEAD"])
            .contains("renamed"));
        for msg in [
            "--amend",
            "-m x",
            "$(touch pwned)",
            "`touch pwned`",
            "; rm -rf ~",
        ] {
            fs::write(f.a.join("four"), format!("{msg}\n")).unwrap();
            f.action(&f.a, "commit", &["four"], Some(msg)).unwrap();
            assert_eq!(f.ok(&f.a, &["log", "-1", "--format=%B"]), msg);
            assert!(!f.a.join("pwned").exists());
        }
        // A failing hook represents diagnostic text emitted by Git or its helpers.
        use std::os::unix::fs::PermissionsExt;
        let hook = f.a.join(".git/hooks/pre-commit");
        fs::write(
            &hook,
            "#!/bin/sh\necho 'http://user:secret-token@127.0.0.1:1234/r.git' >&2\nexit 1\n",
        )
        .unwrap();
        fs::set_permissions(&hook, fs::Permissions::from_mode(0o755)).unwrap();
        fs::write(f.a.join("four"), "redaction\n").unwrap();
        let failure = f
            .action(&f.a, "commit", &["four"], Some("redact"))
            .unwrap_err();
        let log = format!("{:?}", failure.log);
        assert!(log.contains("[redacted]"));
        assert!(!log.contains("secret-token"));
        fs::remove_file(hook).unwrap();
        fs::write(f.a.join("four"), "identity\n").unwrap();
        fs::write(f.base.join(".gitconfig"), "[user]\n useConfigOnly = true\n").unwrap();
        assert_eq!(
            f.action(&f.a, "commit", &["four"], Some("test"))
                .unwrap_err()
                .kind,
            "identity"
        );
    }
    #[test]
    fn pull_diverge_conflicts_resolve_and_abort() {
        let Some(f) = Fixture::new("conflicts") else {
            return;
        };
        f.commit_remote("remote.md", "remote\n");
        let pull = f.action(&f.a, "pull", &[], None).unwrap();
        assert_eq!(pull.outcome, "done");
        assert!(pull
            .changed
            .contains(&f.a.join("remote.md").to_string_lossy().into_owned()));
        fs::write(f.a.join("shared.md"), "ours\n").unwrap();
        f.action(&f.a, "commit", &["shared.md"], Some("ours"))
            .unwrap();
        f.commit_remote("shared.md", "theirs\n");
        let head = f.ok(&f.a, &["rev-parse", "HEAD"]);
        assert_eq!(
            f.action(&f.a, "pull", &[], None).unwrap().outcome,
            "diverged"
        );
        assert_eq!(f.ok(&f.a, &["rev-parse", "HEAD"]), head);
        assert_eq!(
            f.action(&f.a, "merge", &[], None).unwrap().outcome,
            "conflicts"
        );
        assert!(f.a.join(".git/MERGE_HEAD").exists());
        assert_eq!(
            f.action(&f.a, "resolve", &["shared.md"], None)
                .unwrap_err()
                .kind,
            "markers"
        );
        assert_eq!(
            f.action(&f.a, "commit", &["shared.md"], Some("merge"))
                .unwrap_err()
                .kind,
            "conflicts"
        );
        f.action(&f.a, "abort", &[], None).unwrap();
        assert_eq!(fs::read_to_string(f.a.join("shared.md")).unwrap(), "ours\n");
        assert_eq!(
            f.action(&f.a, "merge", &[], None).unwrap().outcome,
            "conflicts"
        );
        fs::write(f.a.join("shared.md"), "resolved\n").unwrap();
        f.action(&f.a, "resolve", &["shared.md"], None).unwrap();
        f.action(&f.a, "commit", &[], Some("merge")).unwrap();
        assert_ne!(f.ok(&f.a, &["rev-parse", "HEAD"]), head);
        assert!(!f.a.join(".git/MERGE_HEAD").exists());
    }
    #[test]
    fn clean_merge_push_rejection_no_upstream_and_busy() {
        let Some(f) = Fixture::new("push") else {
            return;
        };
        fs::write(f.a.join("ours"), "ours\n").unwrap();
        f.action(&f.a, "commit", &["ours"], Some("ours")).unwrap();
        f.commit_remote("theirs", "theirs\n");
        assert_eq!(
            f.action(&f.a, "pull", &[], None).unwrap().outcome,
            "diverged"
        );
        let head = f.ok(&f.a, &["rev-parse", "HEAD"]);
        assert_eq!(
            f.action(&f.a, "merge", &[], None).unwrap().outcome,
            "merged_staged"
        );
        assert_eq!(f.ok(&f.a, &["rev-parse", "HEAD"]), head);
        f.action(&f.a, "commit", &[], Some("merge")).unwrap();
        f.action(&f.a, "push", &[], None).unwrap();
        assert_eq!(
            f.ok(&f.remote, &["rev-parse", "refs/heads/main"]),
            f.ok(&f.a, &["rev-parse", "HEAD"])
        );
        f.ok(&f.b, &["pull", "--ff-only"]);
        f.commit_remote("later", "later\n");
        fs::write(f.a.join("local"), "local\n").unwrap();
        f.action(&f.a, "commit", &["local"], Some("local")).unwrap();
        let remote = f.ok(&f.remote, &["rev-parse", "refs/heads/main"]);
        assert_eq!(
            f.action(&f.a, "push", &[], None).unwrap_err().kind,
            "rejected"
        );
        assert_eq!(f.ok(&f.remote, &["rev-parse", "refs/heads/main"]), remote);
        let _guard = f.locks.lock(&f.a).unwrap();
        assert_eq!(f.action(&f.a, "fetch", &[], None).unwrap_err().kind, "busy");
        drop(_guard);
        f.ok(&f.a, &["checkout", "-b", "x;touch-pwned"]);
        assert_eq!(
            f.action(&f.a, "push", &[], None).unwrap_err().kind,
            "no_upstream"
        );
        f.ok(&f.a, &["push", "-u", "origin", "HEAD"]);
        fs::write(f.a.join("branch"), "branch\n").unwrap();
        f.action(&f.a, "commit", &["branch"], Some("branch"))
            .unwrap();
        f.action(&f.a, "push", &[], None).unwrap();
        assert!(!f.a.join("pwned").exists());
    }
    #[test]
    fn second_action_is_busy_while_fetch_is_running() {
        let Some(f) = Fixture::new("busy") else {
            return;
        };
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        f.ok(
            &f.a,
            &[
                "remote",
                "set-url",
                "origin",
                &format!("http://{address}/r.git"),
            ],
        );
        let (ready_tx, ready_rx) = std::sync::mpsc::channel();
        let (done_tx, done_rx) = std::sync::mpsc::channel();
        let server = std::thread::spawn(move || {
            let (_client, _) = listener.accept().unwrap();
            ready_tx.send(()).unwrap();
            let _ = done_rx.recv_timeout(Duration::from_secs(5));
        });
        std::thread::scope(|scope| {
            let run = scope.spawn(|| {
                let req = GitActionReq {
                    folder: f.a.to_string_lossy().into_owned(),
                    request_id: "slow".into(),
                    action: "fetch".into(),
                    paths: vec![],
                    message: None,
                };
                execute(
                    &f.repo(&f.a),
                    &req,
                    &f.locks,
                    &f.runs,
                    &f.env,
                    Some(Duration::from_secs(1)),
                )
            });
            ready_rx.recv_timeout(Duration::from_secs(5)).unwrap();
            assert_eq!(f.action(&f.a, "fetch", &[], None).unwrap_err().kind, "busy");
            assert_eq!(run.join().unwrap().unwrap_err().kind, "timeout");
        });
        done_tx.send(()).unwrap();
        server.join().unwrap();
    }
    #[test]
    fn remote_diagnostic_credentials_are_redacted_in_action_log() {
        let Some(f) = Fixture::new("remote-redact") else {
            return;
        };
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let url = format!("http://user:secret-token@{addr}/r.git");
        let message = format!("ERR remote failure at {url}\n");
        let body = format!(
            "001e# service=git-upload-pack\n0000{:04x}{message}0000",
            message.len() + 4
        );
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0; 4096];
            let _ = stream.read(&mut request);
            let response = format!("HTTP/1.1 200 OK\r\nContent-Type: application/x-git-upload-pack-advertisement\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
            stream.write_all(response.as_bytes()).unwrap();
        });
        f.ok(&f.a, &["remote", "set-url", "origin", &url]);
        let err = f.action(&f.a, "fetch", &[], None).unwrap_err();
        server.join().unwrap();
        let log = format!("{:?}", err.log);
        assert!(log.contains("[redacted]"), "{log}");
        assert!(!log.contains("secret-token"));
    }
    #[test]
    fn remote_auth_timeout_and_redacted_log() {
        let Some(f) = Fixture::new("http") else {
            return;
        };
        for silent in [false, true] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let addr = listener.local_addr().unwrap();
            listener.set_nonblocking(true).unwrap();
            let stop = Arc::new(AtomicBool::new(false));
            let done = stop.clone();
            let server = std::thread::spawn(move || {
                let mut clients = vec![];
                while !done.load(Ordering::SeqCst) {
                    if let Ok((mut stream, _)) = listener.accept() {
                        if !silent {
                            let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
                            let mut buf = [0; 4096];
                            let _ = stream.read(&mut buf);
                            let _ = stream.write_all(b"HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm=\"test\"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                        } else {
                            clients.push(stream);
                        }
                    }
                    std::thread::sleep(Duration::from_millis(10));
                }
            });
            let url = if silent {
                format!("http://user:secret-token@{addr}/r.git")
            } else {
                format!("http://{addr}/r.git")
            };
            f.ok(&f.a, &["remote", "set-url", "origin", &url]);
            let req = GitActionReq {
                folder: f.a.to_string_lossy().into_owned(),
                request_id: "network".into(),
                action: "fetch".into(),
                paths: vec![],
                message: None,
            };
            let start = Instant::now();
            let result = execute(
                &f.repo(&f.a),
                &req,
                &f.locks,
                &f.runs,
                &f.env,
                Some(Duration::from_secs(if silent { 1 } else { 8 })),
            );
            stop.store(true, Ordering::SeqCst);
            server.join().unwrap();
            let err = result.unwrap_err();
            assert_eq!(err.kind, if silent { "timeout" } else { "auth" });
            assert!(start.elapsed() < Duration::from_secs(10));
            let log = format!("{:?}", err.log);
            assert!(!log.contains("secret-token"));
        }
    }
}
