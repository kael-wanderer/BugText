use crate::ai::{kill_group, terminate_group};
use std::collections::HashMap;
use std::ffi::OsString;
use std::io::{Read, Write};
#[cfg(unix)]
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant};

const PREFIX: &[&str] = &[
    "-c",
    "core.fsmonitor=false",
    "-c",
    "core.pager=cat",
    "-c",
    "color.ui=false",
    "-c",
    "core.quotePath=false",
    "-c",
    "protocol.ext.allow=never",
];
#[derive(Clone)]
pub struct RunEnv {
    pub home: PathBuf,
    pub path: OsString,
    pub tmpdir: PathBuf,
    pub ssh_auth_sock: Option<OsString>,
    pub user: Option<OsString>,
    pub logname: Option<OsString>,
    pub lang: Option<OsString>,
}
impl RunEnv {
    pub fn from_process() -> Self {
        Self {
            home: std::env::var_os("HOME")
                .map(PathBuf::from)
                .unwrap_or_default(),
            path: crate::cli_scan::login_shell_path()
                .filter(|p| !p.is_empty())
                .map(OsString::from)
                .unwrap_or_else(|| "/usr/bin:/bin:/usr/sbin:/sbin".into()),
            tmpdir: std::env::temp_dir(),
            ssh_auth_sock: std::env::var_os("SSH_AUTH_SOCK"),
            user: std::env::var_os("USER"),
            logname: std::env::var_os("LOGNAME"),
            lang: std::env::var_os("LANG"),
        }
    }
}
#[derive(Default)]
pub struct GitRuns(Mutex<HashMap<String, (u32, Arc<AtomicBool>)>>);
pub struct RunSpec<'a> {
    pub git: &'a Path,
    pub repo_root: &'a Path,
    pub args: Vec<OsString>,
    pub stdin: Option<&'a [u8]>,
    pub timeout: Duration,
    pub request_id: Option<&'a str>,
    pub env: &'a RunEnv,
    pub runs: &'a GitRuns,
}
pub struct RunOutput {
    pub exit: Option<i32>,
    pub stdout: Vec<u8>,
    pub stderr: String,
    pub timed_out: bool,
    pub cancelled: bool,
}
fn command(spec: &RunSpec<'_>) -> Command {
    let mut c = Command::new(spec.git);
    c.current_dir(spec.repo_root)
        .arg("-C")
        .arg(spec.repo_root)
        .args(PREFIX)
        .args(&spec.args)
        .env_clear()
        .env("HOME", &spec.env.home)
        .env("PATH", &spec.env.path)
        .env("TMPDIR", &spec.env.tmpdir)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "never")
        .env("LC_ALL", "C");
    for (name, value) in [
        ("USER", &spec.env.user),
        ("LOGNAME", &spec.env.logname),
        ("LANG", &spec.env.lang),
        ("SSH_AUTH_SOCK", &spec.env.ssh_auth_sock),
    ] {
        if let Some(value) = value {
            c.env(name, value);
        }
    }
    c.stdin(if spec.stdin.is_some() {
        Stdio::piped()
    } else {
        Stdio::null()
    })
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
    #[cfg(unix)]
    c.process_group(0);
    c
}
fn drain(mut input: impl Read, cap: usize, tail: bool) -> Vec<u8> {
    let mut output = Vec::new();
    let mut buf = [0; 8192];
    while let Ok(n) = input.read(&mut buf) {
        if n == 0 {
            break;
        }
        if tail {
            output.extend_from_slice(&buf[..n]);
            if output.len() > cap {
                output.drain(..output.len() - cap);
            }
        } else if output.len() < cap {
            output.extend_from_slice(&buf[..n.min(cap - output.len())]);
        }
    }
    output
}
pub fn run(spec: RunSpec<'_>) -> RunOutput {
    run_command(&spec, command(&spec))
}
fn run_command(spec: &RunSpec<'_>, mut command: Command) -> RunOutput {
    let failed = || RunOutput {
        exit: None,
        stdout: vec![],
        stderr: String::new(),
        timed_out: false,
        cancelled: false,
    };
    let Ok(mut child) = command.spawn() else {
        return failed();
    };
    let flag = Arc::new(AtomicBool::new(false));
    if let Some(id) = spec.request_id {
        spec.runs
            .0
            .lock()
            .unwrap()
            .insert(id.to_owned(), (child.id(), flag.clone()));
    }
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    let out_thread = std::thread::spawn(move || drain(stdout, 8 * 1024 * 1024, false));
    let err_thread = std::thread::spawn(move || drain(stderr, 4096, true));
    if let (Some(input), Some(mut pipe)) = (spec.stdin, child.stdin.take()) {
        let input = input.to_vec();
        std::thread::spawn(move || {
            let _ = pipe.write_all(&input);
        });
    }
    let start = Instant::now();
    let mut timed_out = false;
    let mut cancelled = false;
    let status = loop {
        cancelled |= flag.load(Ordering::SeqCst);
        if let Ok(Some(status)) = child.try_wait() {
            break Some(status);
        }
        timed_out |= start.elapsed() >= spec.timeout;
        if cancelled || timed_out {
            terminate_group(child.id());
            let deadline = Instant::now() + Duration::from_secs(2);
            break loop {
                if let Ok(Some(status)) = child.try_wait() {
                    break Some(status);
                }
                if Instant::now() >= deadline {
                    kill_group(child.id());
                    break child.wait().ok();
                }
                std::thread::sleep(Duration::from_millis(25));
            };
        }
        std::thread::sleep(Duration::from_millis(50));
    };
    kill_group(child.id());
    if let Some(id) = spec.request_id {
        spec.runs.0.lock().unwrap().remove(id);
    }
    RunOutput {
        exit: status.and_then(|s| s.code()),
        stdout: out_thread.join().unwrap_or_default(),
        stderr: String::from_utf8_lossy(&err_thread.join().unwrap_or_default()).into_owned(),
        timed_out,
        cancelled,
    }
}
#[tauri::command]
pub fn git_cancel(state: tauri::State<'_, GitRuns>, request_id: String) {
    cancel(&state, &request_id);
}
fn cancel(runs: &GitRuns, id: &str) {
    if let Some((pid, flag)) = runs.0.lock().unwrap().get(id) {
        flag.store(true, Ordering::SeqCst);
        terminate_group(*pid);
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn environment_is_allowlisted_and_git_dir_is_ignored() {
        let git = Path::new("/usr/bin/git");
        if !git.exists() {
            eprintln!("git unavailable");
            return;
        }
        let dir = std::env::temp_dir().join(format!("bugtext-git-run-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let status = Command::new(git)
            .arg("init")
            .arg(&dir)
            .env_remove("GIT_DIR")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        if !status.is_ok_and(|s| s.success()) {
            let _ = std::fs::remove_dir_all(&dir);
            eprintln!("git unavailable");
            return;
        }
        let env = RunEnv {
            home: dir.clone(),
            path: "/usr/bin:/bin".into(),
            tmpdir: dir.clone(),
            ssh_auth_sock: None,
            user: None,
            logname: None,
            lang: None,
        };
        let runs = GitRuns::default();
        let spec = RunSpec {
            git,
            repo_root: &dir,
            args: vec!["rev-parse".into(), "--show-toplevel".into()],
            stdin: None,
            timeout: Duration::from_secs(5),
            request_id: None,
            env: &env,
            runs: &runs,
        };
        let built = command(&spec);
        let names: Vec<_> = built
            .get_envs()
            .map(|(k, _)| k.to_string_lossy().into_owned())
            .collect();
        assert_eq!(names.len(), 6);
        assert!(!names.iter().any(|s| s == "GIT_DIR" || s == "GIT_ASKPASS"));
        let out = run(spec);
        assert_eq!(out.exit, Some(0));
        assert_eq!(
            PathBuf::from(String::from_utf8_lossy(&out.stdout).trim())
                .canonicalize()
                .unwrap(),
            dir.canonicalize().unwrap()
        );
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn inherited_hostile_git_environment_is_cleared() {
        const CHILD: &str = "BUGTEXT_HOSTILE_ENV_CHILD";
        if std::env::var_os(CHILD).is_some() {
            environment_is_allowlisted_and_git_dir_is_ignored();
            return;
        }
        let status = Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "git_run::tests::inherited_hostile_git_environment_is_cleared",
            ])
            .env(CHILD, "1")
            .env("GIT_DIR", "/nonexistent")
            .env("GIT_WORK_TREE", "/nonexistent")
            .env("GIT_ASKPASS", "/bin/false")
            .env("GIT_CONFIG_COUNT", "1")
            .env("GIT_CONFIG_KEY_0", "alias.rev-parse")
            .env("GIT_CONFIG_VALUE_0", "!false")
            .status()
            .unwrap();
        assert!(status.success());
    }

    #[cfg(unix)]
    #[test]
    fn timeout_and_cancel_kill_grandchild() {
        let dir = std::env::temp_dir().join(format!("bugtext-git-tree-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let env = RunEnv {
            home: dir.clone(),
            path: "/usr/bin:/bin".into(),
            tmpdir: dir.clone(),
            ssh_auth_sock: None,
            user: None,
            logname: None,
            lang: None,
        };
        let runs = GitRuns::default();
        for cancel_run in [false, true] {
            let pidfile = dir.join("pid");
            let _ = std::fs::remove_file(&pidfile);
            let spec = RunSpec {
                git: Path::new("/bin/sh"),
                repo_root: &dir,
                args: vec![],
                stdin: None,
                timeout: Duration::from_millis(if cancel_run { 5000 } else { 500 }),
                request_id: Some("tree"),
                env: &env,
                runs: &runs,
            };
            let mut cmd = Command::new("/bin/sh");
            cmd.arg("-c")
                .arg(r#"/bin/sleep 30 & echo $! > "$1"; wait"#)
                .arg("test")
                .arg(&pidfile)
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .process_group(0);
            let start = Instant::now();
            std::thread::scope(|scope| {
                let handle = scope.spawn(|| run_command(&spec, cmd));
                while !pidfile.exists() && start.elapsed() < Duration::from_secs(2) {
                    std::thread::sleep(Duration::from_millis(10));
                }
                let pid: u32 = std::fs::read_to_string(&pidfile)
                    .unwrap()
                    .trim()
                    .parse()
                    .unwrap();
                if cancel_run {
                    cancel(&runs, "tree");
                }
                let out = handle.join().unwrap();
                assert!(if cancel_run {
                    out.cancelled
                } else {
                    out.timed_out
                });
                assert!(start.elapsed() < Duration::from_secs(3));
                assert!(!Command::new("/bin/kill")
                    .args(["-0", &pid.to_string()])
                    .status()
                    .unwrap()
                    .success());
            });
        }
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn timeout_and_cancel_stop_slow_git_requests() {
        use std::net::TcpListener;
        let git = Path::new("/usr/bin/git");
        if !git.exists() {
            eprintln!("git unavailable");
            return;
        }
        let dir = std::env::temp_dir().join(format!("bugtext-git-timeout-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let env = RunEnv {
            home: dir.clone(),
            path: "/usr/bin:/bin".into(),
            tmpdir: dir.clone(),
            ssh_auth_sock: None,
            user: None,
            logname: None,
            lang: None,
        };
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        listener.set_nonblocking(true).unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let ending = stop.clone();
        let server = std::thread::spawn(move || {
            let mut clients = Vec::new();
            while !ending.load(Ordering::SeqCst) {
                if let Ok((client, _)) = listener.accept() {
                    clients.push(client);
                }
                std::thread::sleep(Duration::from_millis(10));
            }
        });
        let runs = GitRuns::default();
        let url = format!("http://{addr}/repo.git");
        let spec = || RunSpec {
            git,
            repo_root: &dir,
            args: vec!["ls-remote".into(), url.clone().into()],
            stdin: None,
            timeout: Duration::from_millis(500),
            request_id: Some("request"),
            env: &env,
            runs: &runs,
        };
        let start = Instant::now();
        let out = run(spec());
        assert!(out.timed_out);
        assert!(start.elapsed() < Duration::from_secs(3));
        std::thread::scope(|scope| {
            let handle = scope.spawn(|| run(spec()));
            std::thread::sleep(Duration::from_millis(150));
            cancel(&runs, "request");
            let out = handle.join().unwrap();
            assert!(out.cancelled);
        });
        stop.store(true, Ordering::SeqCst);
        server.join().unwrap();
        std::fs::remove_dir_all(dir).unwrap();
    }
}
