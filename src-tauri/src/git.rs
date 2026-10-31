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
    kind: &'static str,
    log: Vec<String>,
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
    #[test]
    fn real_repository_status_scope_and_diff() {
        let git = Path::new("/usr/bin/git");
        if !git.exists() {
            eprintln!("git unavailable");
            return;
        }
        let root =
            std::env::temp_dir().join(format!("bugtext-git-integration-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("notes")).unwrap();
        let invoke = |args: &[&str]| {
            Command::new(git)
                .current_dir(&root)
                .env_clear()
                .env("PATH", "/usr/bin:/bin")
                .env("HOME", &root)
                .args(args)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .unwrap()
                .success()
        };
        if !invoke(&["init"]) {
            eprintln!("git unavailable");
            let _ = std::fs::remove_dir_all(root);
            return;
        }
        assert!(invoke(&["config", "user.name", "Test"]));
        assert!(invoke(&["config", "user.email", "test@example.invalid"]));
        std::fs::write(root.join("notes/-rf.md"), "original\n").unwrap();
        std::fs::write(root.join("outside.md"), "original\n").unwrap();
        assert!(invoke(&["add", "."]));
        assert!(invoke(&["commit", "-m", "initial"]));
        std::fs::write(root.join("notes/-rf.md"), "changed\n").unwrap();
        std::fs::write(root.join("outside.md"), "changed\n").unwrap();
        std::fs::write(root.join("notes/<img src=x onerror=alert(1)>.md"), "new\n").unwrap();
        let root = root.canonicalize().unwrap();
        let repo = Repo {
            folder: root.join("notes"),
            root: root.clone(),
            subfolder: "notes".into(),
            git: git.into(),
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
        std::fs::remove_dir_all(root).unwrap();
    }
}
