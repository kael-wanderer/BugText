use std::path::{Path, PathBuf};

pub struct SandboxPaths {
    pub workdir: PathBuf,
    pub tmpdir: PathBuf,
    pub config_dirs: Vec<PathBuf>,
    pub config_files: Vec<PathBuf>,
    pub exec_roots: Vec<PathBuf>,
}

pub fn profile() -> &'static str {
    r#"(version 1)
(deny default)
(allow process-exec)
(allow process-fork)
(allow signal (target self))
(allow sysctl-read)
(allow mach-lookup)
(allow ipc-posix-shm)
(allow ipc-posix-sem)
(allow network*)
(allow file-read-metadata)
(allow file-read* (literal "/"))
(allow file-read* (subpath "/private/var/db/timezone"))
(allow file-read* (subpath (param "KEYCHAINS")))
(allow file-map-executable)
(allow file-read* (subpath "/usr"))
(allow file-read* (subpath "/bin"))
(allow file-read* (subpath "/sbin"))
(allow file-read* (subpath "/System"))
(allow file-read* (subpath "/Library"))
(allow file-read* (subpath "/opt/homebrew"))
(allow file-read* (subpath "/private/etc"))
(allow file-read* (subpath "/private/var/db/dyld"))
(allow file-read* (subpath "/dev"))
(allow file-read* (subpath (param "WORKDIR")))
(allow file-write* (subpath (param "WORKDIR")))
(allow file-read* (subpath (param "TMPDIR")))
(allow file-write* (subpath (param "TMPDIR")))
(allow file-read* (subpath (param "CONFIG_DIR_0")))
(allow file-write* (subpath (param "CONFIG_DIR_0")))
(allow file-read* (subpath (param "CONFIG_DIR_1")))
(allow file-write* (subpath (param "CONFIG_DIR_1")))
(allow file-read* (literal (param "CONFIG_FILE_0")))
(allow file-write* (literal (param "CONFIG_FILE_0")))
(allow file-read* (literal (param "CONFIG_FILE_1")))
(allow file-write* (literal (param "CONFIG_FILE_1")))
(allow file-read* (subpath (param "EXEC_ROOT_0")))
(allow file-read* (subpath (param "EXEC_ROOT_1")))
(allow file-read* (subpath (param "EXEC_ROOT_2")))
(allow file-read* (literal "/dev/null"))
(allow file-write* (literal "/dev/null"))
(allow file-read* (literal "/dev/tty"))
(allow file-write* (literal "/dev/tty"))
"#
}

pub fn sandbox_args(paths: &SandboxPaths) -> Vec<String> {
    let mut args = vec!["-p".into(), profile().into()];
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/Users"));
    add_param(&mut args, "KEYCHAINS", &home.join("Library/Keychains"));
    add_param(&mut args, "WORKDIR", &paths.workdir);
    add_param(&mut args, "TMPDIR", &paths.tmpdir);
    for index in 0..2 {
        let path = paths
            .config_dirs
            .get(index)
            .cloned()
            .unwrap_or_else(|| PathBuf::from("/nonexistent"));
        add_param(&mut args, &format!("CONFIG_DIR_{index}"), &path);
    }
    for index in 0..2 {
        let path = paths
            .config_files
            .get(index)
            .cloned()
            .unwrap_or_else(|| PathBuf::from("/nonexistent"));
        add_param(&mut args, &format!("CONFIG_FILE_{index}"), &path);
    }
    for index in 0..3 {
        let path = paths
            .exec_roots
            .get(index)
            .cloned()
            .unwrap_or_else(|| PathBuf::from("/nonexistent"));
        add_param(&mut args, &format!("EXEC_ROOT_{index}"), &path);
    }
    args
}

fn add_param(args: &mut Vec<String>, name: &str, path: &Path) {
    args.push("-D".into());
    args.push(format!("{name}={}", path.to_string_lossy()));
}

#[cfg(test)]
mod tests {
    use super::{profile, sandbox_args, SandboxPaths};
    use std::fs;
    use std::path::PathBuf;

    #[test]
    fn sandbox_args_pass_paths_as_parameters() {
        let paths = SandboxPaths {
            workdir: PathBuf::from("/tmp/a \"b\" (c)"),
            tmpdir: PathBuf::from("/tmp/run temp"),
            config_dirs: vec![PathBuf::from("/Users/example/.claude")],
            config_files: vec![PathBuf::from("/Users/example/.claude.json")],
            exec_roots: vec![PathBuf::from("/opt/homebrew")],
        };
        let args = sandbox_args(&paths);
        assert!(args
            .windows(2)
            .any(|pair| { pair[0] == "-D" && pair[1] == "WORKDIR=/tmp/a \"b\" (c)" }));
        let profile_text = profile();
        assert!(profile_text.contains("(param \"WORKDIR\")"));
        assert!(!profile_text.contains("/tmp/a"));
        assert!(!profile_text.contains("/Users/example"));
    }

    #[cfg(target_os = "macos")]
    fn run_sandboxed(paths: &SandboxPaths, script: &str) -> std::process::Output {
        use std::process::Command;
        let mut command = Command::new("/usr/bin/sandbox-exec");
        command.args(sandbox_args(paths));
        command.env("WORKDIR", &paths.workdir);
        command.env("TMPDIR", &paths.tmpdir);
        command.current_dir(&paths.workdir);
        command.args(["/bin/sh", "-c", script]);
        command.output().unwrap()
    }

    #[cfg(target_os = "macos")]
    fn test_paths(label: &str) -> (SandboxPaths, PathBuf) {
        use std::time::{SystemTime, UNIX_EPOCH};
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = PathBuf::from("/tmp").join(format!(
            "bugtext_sandbox_{}_{}_{}",
            std::process::id(),
            nanos,
            label
        ));
        let workdir = root.join("work");
        let tmpdir = root.join("private_tmp");
        fs::create_dir_all(&workdir).unwrap();
        fs::create_dir_all(&tmpdir).unwrap();
        let root = fs::canonicalize(root).unwrap();
        let workdir = fs::canonicalize(workdir).unwrap();
        let tmpdir = fs::canonicalize(tmpdir).unwrap();
        (
            SandboxPaths {
                workdir: workdir.clone(),
                tmpdir,
                config_dirs: Vec::new(),
                config_files: Vec::new(),
                exec_roots: vec![PathBuf::from("/bin")],
            },
            root,
        )
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn sandbox_denies_home_read() {
        let (paths, root) = test_paths("home-read");
        let home = PathBuf::from(std::env::var_os("HOME").unwrap());
        let outside = home.join(format!(".bugtext-sandbox-probe-{}", std::process::id()));
        fs::write(&outside, "private").unwrap();
        let output = run_sandboxed(
            &paths,
            &format!("cat '{}'", outside.to_string_lossy().replace('\'', "'\\''")),
        );
        assert!(!output.status.success());
        assert!(output.status.code().is_some(), "{output:?}");
        assert!(
            !output.stdout.is_empty() || !output.stderr.is_empty(),
            "{output:?}"
        );
        let _ = fs::remove_file(outside);
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn sandbox_denies_slash_tmp_write() {
        let (paths, root) = test_paths("tmp-write");
        let target = format!("/tmp/bugtext-sbx-{}", std::process::id());
        let output = run_sandboxed(&paths, &format!("touch '{target}'"));
        assert!(!output.status.success());
        let _ = fs::remove_file(target);
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn sandbox_allows_workdir_write() {
        let (paths, root) = test_paths("work-write");
        let output = run_sandboxed(&paths, "touch \"$WORKDIR/x\"");
        assert!(output.status.success(), "{output:?}");
        assert!(paths.workdir.join("x").is_file());
        let _ = fs::remove_dir_all(root);
    }
    #[cfg(target_os = "macos")]
    #[test]
    fn sandbox_allows_root_listing() {
        let (paths, root) = test_paths("root-listing");
        let output = run_sandboxed(&paths, "ls / >/dev/null");
        assert!(output.status.success(), "{output:?}");
        let _ = fs::remove_dir_all(root);
    }
}
