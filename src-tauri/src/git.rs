use crate::{
    git_args, git_errors,
    git_repo::{self, Repo},
    git_run::{run, GitRuns, RunEnv, RunOutput, RunSpec},
    git_status::{self, GitDiff, GitStatus},
};
use serde::{Deserialize, Serialize};
use std::{ffi::OsString, io::Read, time::Duration};

#[derive(Serialize, Debug)]
pub struct GitError {
    pub(crate) kind: &'static str,
    pub(crate) log: Vec<GitLogEntry>,
}
#[derive(Serialize, Clone, Debug)]
pub struct GitLogEntry {
    pub at_ms: u64,
    pub action: String,
    pub args: String,
    pub exit: Option<i32>,
    pub stderr_tail: String,
}
impl From<&'static str> for GitError {
    fn from(kind: &'static str) -> Self {
        Self { kind, log: vec![] }
    }
}
#[derive(Deserialize)]
pub struct GitFolder {
    folder: String,
}
#[derive(Deserialize)]
pub struct GitPathReq {
    folder: String,
    path: String,
}
#[derive(Serialize, Debug)]
pub struct GitRepoInfo {
    in_repo: bool,
    repo_name: String,
    subfolder: String,
}
fn call(repo: &Repo, args: Vec<OsString>) -> RunOutput {
    run(RunSpec {
        git: &repo.git,
        repo_root: &repo.root,
        args,
        stdin: None,
        timeout: Duration::from_secs(15),
        request_id: None,
        env: &RunEnv::from_process(),
        runs: &GitRuns::default(),
    })
}
fn status(repo: &Repo) -> Result<GitStatus, GitError> {
    let merging = call(repo, git_args::merging()).exit == Some(0);
    let out = call(
        repo,
        git_args::status(if repo.subfolder.is_empty() {
            "."
        } else {
            &repo.subfolder
        }),
    );
    if out.exit != Some(0) {
        return Err(git_errors::classify("status", &out).into());
    }
    Ok(git_status::parse_status(
        &out.stdout,
        &repo.subfolder,
        merging,
    ))
}
fn diff(repo: &Repo, path: &str) -> Result<GitDiff, GitError> {
    let rel = git_repo::to_repo_rel(repo, path)?;
    let state = status(repo)?;
    if let Some(entry) = state.entries.iter().find(|e| e.path == path) {
        if entry.group == "new" || entry.group == "conflicted" {
            let file = std::fs::File::open(repo.folder.join(path))
                .map_err(|_| GitError::from("failed"))?;
            let mut bytes = Vec::new();
            file.take(512 * 1024 + 1)
                .read_to_end(&mut bytes)
                .map_err(|_| GitError::from("failed"))?;
            return Ok(git_status::file_diff(&bytes, entry.group == "conflicted"));
        }
    }
    let head = call(repo, git_args::head()).exit == Some(0);
    let out = call(repo, git_args::diff(&rel, head));
    if out.exit != Some(0) {
        return Err(git_errors::classify("diff", &out).into());
    }
    Ok(git_status::parse_diff(&String::from_utf8_lossy(
        &out.stdout,
    )))
}
#[tauri::command]
pub async fn git_repo(req: GitFolder) -> Result<GitRepoInfo, GitError> {
    tauri::async_runtime::spawn_blocking(move || match git_repo::resolve(&req.folder) {
        Ok(repo) => Ok(GitRepoInfo {
            in_repo: true,
            repo_name: repo
                .root
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            subfolder: repo.subfolder,
        }),
        Err("not_repo") => Ok(GitRepoInfo {
            in_repo: false,
            repo_name: String::new(),
            subfolder: String::new(),
        }),
        Err(e) => Err(e.into()),
    })
    .await
    .map_err(|_| GitError::from("failed"))?
}
#[tauri::command]
pub async fn git_status(req: GitFolder) -> Result<GitStatus, GitError> {
    tauri::async_runtime::spawn_blocking(move || status(&git_repo::resolve(&req.folder)?))
        .await
        .map_err(|_| GitError::from("failed"))?
}
#[tauri::command]
pub async fn git_diff(req: GitPathReq) -> Result<GitDiff, GitError> {
    if !git_repo::valid_rel(&req.path) {
        return Err("outside".into());
    }
    tauri::async_runtime::spawn_blocking(move || diff(&git_repo::resolve(&req.folder)?, &req.path))
        .await
        .map_err(|_| GitError::from("failed"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        path::Path,
        process::{Command, Stdio},
    };
    struct Fixture {
        root: std::path::PathBuf,
    }
    impl Fixture {
        fn new(name: &str) -> Option<Self> {
            if !Path::new("/usr/bin/git").exists() {
                eprintln!("git unavailable");
                return None;
            }
            let root =
                std::env::temp_dir().join(format!("bugtext-git-{name}-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&root);
            std::fs::create_dir_all(&root).unwrap();
            let fixture = Self {
                root: root.canonicalize().unwrap(),
            };
            if !fixture.git(&["init"]) {
                eprintln!("git unavailable");
                return None;
            }
            assert!(fixture.git(&["config", "user.name", "Test"]));
            assert!(fixture.git(&["config", "user.email", "test@example.invalid"]));
            Some(fixture)
        }
        fn git(&self, args: &[&str]) -> bool {
            Command::new("/usr/bin/git")
                .current_dir(&self.root)
                .env_clear()
                .env("PATH", "/usr/bin:/bin")
                .env("HOME", &self.root)
                .args(args)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .unwrap()
                .success()
        }
        fn write(&self, path: &str, contents: impl AsRef<[u8]>) {
            std::fs::write(self.root.join(path), contents).unwrap();
        }
        fn repo(&self) -> Repo {
            Repo {
                root: self.root.clone(),
                folder: self.root.clone(),
                subfolder: String::new(),
                git: "/usr/bin/git".into(),
            }
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn real_repository_status_scope_and_diff() {
        let Some(f) = Fixture::new("integration") else {
            return;
        };
        std::fs::create_dir(f.root.join("notes")).unwrap();
        f.write("notes/-rf.md", "original\n");
        f.write("outside.md", "original\n");
        assert!(f.git(&["add", "."]));
        assert!(f.git(&["commit", "-m", "initial"]));
        f.write("notes/-rf.md", "changed\n");
        f.write("outside.md", "changed\n");
        f.write("notes/<img src=x onerror=alert(1)>.md", "new\n");
        let repo = Repo {
            folder: f.root.join("notes"),
            subfolder: "notes".into(),
            ..f.repo()
        };
        let state = status(&repo).unwrap();
        assert_eq!(state.total, 2);
        assert!(state
            .entries
            .iter()
            .any(|e| e.path == "-rf.md" && e.group == "changed"));
        assert!(state
            .entries
            .iter()
            .any(|e| e.path == "<img src=x onerror=alert(1)>.md" && e.group == "new"));
        assert!(diff(&repo, "-rf.md")
            .unwrap()
            .lines
            .iter()
            .any(|l| l.text == "+changed"));
        assert!(diff(&repo, "<img src=x onerror=alert(1)>.md")
            .unwrap()
            .lines
            .iter()
            .any(|l| l.text == "new"));
        assert!(diff(&repo, "../outside.md").is_err());
    }

    #[test]
    fn real_repository_deleted_renamed_and_option_like_diff() {
        let Some(f) = Fixture::new("entries") else {
            return;
        };
        for name in ["deleted.md", "old.md", "--amend.md"] {
            f.write(name, "original\n");
        }
        assert!(f.git(&["add", "."]));
        assert!(f.git(&["commit", "-m", "initial"]));
        std::fs::remove_file(f.root.join("deleted.md")).unwrap();
        assert!(f.git(&["mv", "old.md", "renamed.md"]));
        f.write("--amend.md", "changed\n");
        let state = status(&f.repo()).unwrap();
        assert!(state
            .entries
            .iter()
            .any(|e| e.path == "deleted.md" && e.group == "changed" && e.badge == "D"));
        assert!(state.entries.iter().any(|e| e.path == "renamed.md"
            && e.group == "changed"
            && e.badge == "R"
            && e.orig_path.as_deref() == Some("old.md")));
        assert!(diff(&f.repo(), "--amend.md")
            .unwrap()
            .lines
            .iter()
            .any(|l| l.text == "+changed"));
    }

    #[test]
    fn status_and_diff_ignore_external_programs_and_limit_output() {
        use std::os::unix::fs::PermissionsExt;
        let Some(f) = Fixture::new("safe-diff") else {
            return;
        };
        f.write("large.md", "before\n");
        f.write("binary.dat", b"before\0data");
        assert!(f.git(&["add", "."]));
        assert!(f.git(&["commit", "-m", "initial"]));
        let marker = f.root.join("marker");
        let script = f.root.join("hook.sh");
        std::fs::write(
            &script,
            format!("#!/bin/sh\ntouch '{}'\n", marker.display()),
        )
        .unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert!(f.git(&["config", "core.fsmonitor", script.to_str().unwrap()]));
        assert!(f.git(&["config", "diff.external", script.to_str().unwrap()]));
        f.write("large.md", "new line\n".repeat(2100));
        f.write("binary.dat", b"after\0data");
        let repo = f.repo();
        status(&repo).unwrap();
        assert!(diff(&repo, "large.md").unwrap().truncated);
        assert!(diff(&repo, "binary.dat").unwrap().binary);
        assert!(!marker.exists());
    }

    #[test]
    fn resolution_rejects_non_repos_and_ignores_inherited_git_dir() {
        const CHILD: &str = "BUGTEXT_GIT_RESOLUTION_CHILD";
        if let Some(root) = std::env::var_os(CHILD) {
            let root = std::path::PathBuf::from(root);
            let repo = git_repo::resolve(root.to_str().unwrap()).unwrap();
            assert_eq!(repo.root, root);
            assert_eq!(
                git_repo::resolve(root.join("outside").to_str().unwrap()).err(),
                Some("not_repo")
            );
            assert_eq!(
                git_repo::resolve(root.join("bare.git").to_str().unwrap()).err(),
                Some("not_repo")
            );
            return;
        }
        let Some(f) = Fixture::new("resolution") else {
            return;
        };
        // The unrelated folder and bare repository are siblings of the worktree.
        let base = f.root.parent().unwrap();
        let outside = base.join(format!("bugtext-outside-{}", std::process::id()));
        let bare = base.join(format!("bugtext-bare-{}.git", std::process::id()));
        std::fs::create_dir_all(&outside).unwrap();
        assert!(Command::new("/usr/bin/git")
            .args(["init", "--bare", bare.to_str().unwrap()])
            .env_clear()
            .env("PATH", "/usr/bin:/bin")
            .env("HOME", &f.root)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .unwrap()
            .success());
        // Symlinks allow the child to locate siblings without changing its environment.
        std::os::unix::fs::symlink(&outside, f.root.join("outside")).unwrap();
        std::os::unix::fs::symlink(&bare, f.root.join("bare.git")).unwrap();
        let result = Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "git::tests::resolution_rejects_non_repos_and_ignores_inherited_git_dir",
            ])
            .env(CHILD, &f.root)
            .env("GIT_DIR", &bare)
            .status()
            .unwrap();
        let _ = std::fs::remove_dir_all(outside);
        let _ = std::fs::remove_dir_all(bare);
        assert!(result.success());
    }
}
