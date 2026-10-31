use crate::{
    git_args, git_locate,
    git_run::{run, GitRuns, RunEnv, RunSpec},
};
use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

pub struct Repo {
    pub root: PathBuf,
    pub folder: PathBuf,
    pub subfolder: String,
    pub git: PathBuf,
}
pub fn resolve(folder: &str) -> Result<Repo, &'static str> {
    let folder = PathBuf::from(folder)
        .canonicalize()
        .map_err(|_| "not_repo")?;
    if !folder.is_dir() {
        return Err("not_repo");
    }
    let (info, git) = git_locate::cached(false);
    if !info.found {
        return Err("not_found");
    }
    if !info.supported {
        return Err("unsupported");
    }
    let env = RunEnv::from_process();
    let runs = GitRuns::default();
    let call = |args| {
        run(RunSpec {
            git: &git,
            repo_root: &folder,
            args,
            stdin: None,
            timeout: Duration::from_secs(15),
            request_id: None,
            env: &env,
            runs: &runs,
        })
    };
    let output = call(git_args::toplevel());
    if output.exit != Some(0) {
        return Err("not_repo");
    }
    let root = PathBuf::from(String::from_utf8_lossy(&output.stdout).trim())
        .canonicalize()
        .map_err(|_| "not_repo")?;
    if !folder.starts_with(&root) {
        return Err("not_repo");
    }
    let bare = call(git_args::is_bare());
    if bare.exit != Some(0) || String::from_utf8_lossy(&bare.stdout).trim() != "false" {
        return Err("not_repo");
    }
    let subfolder = folder
        .strip_prefix(&root)
        .map_err(|_| "not_repo")?
        .to_string_lossy()
        .replace('\\', "/");
    Ok(Repo {
        root,
        folder,
        subfolder,
        git,
    })
}
pub fn valid_rel(rel: &str) -> bool {
    !rel.is_empty()
        && !rel.contains('\0')
        && !rel.contains('\\')
        && Path::new(rel)
            .components()
            .all(|p| matches!(p, Component::Normal(_)))
}
pub fn to_repo_rel(repo: &Repo, rel: &str) -> Result<String, &'static str> {
    if !valid_rel(rel) {
        return Err("outside");
    }
    let joined = repo.folder.join(rel);
    let parent = joined
        .parent()
        .ok_or("outside")?
        .canonicalize()
        .map_err(|_| "outside")?;
    if !parent.starts_with(&repo.folder) {
        return Err("outside");
    }
    if joined.symlink_metadata().is_ok()
        && !joined
            .canonicalize()
            .map_err(|_| "outside")?
            .starts_with(&repo.folder)
    {
        return Err("outside");
    }
    Ok(if repo.subfolder.is_empty() {
        rel.replace('\\', "/")
    } else {
        format!("{}/{}", repo.subfolder, rel.replace('\\', "/"))
    })
}
#[derive(Default)]
pub struct RepoLocks(Mutex<HashSet<PathBuf>>);
pub struct RepoGuard<'a> {
    locks: &'a RepoLocks,
    root: PathBuf,
}
impl RepoLocks {
    pub fn lock(&self, root: &Path) -> Result<RepoGuard<'_>, &'static str> {
        if !self.0.lock().unwrap().insert(root.to_owned()) {
            return Err("busy");
        }
        Ok(RepoGuard {
            locks: self,
            root: root.to_owned(),
        })
    }
}
impl Drop for RepoGuard<'_> {
    fn drop(&mut self) {
        self.locks.0.lock().unwrap().remove(&self.root);
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn confines_untrusted_paths_and_serializes_repository_actions() {
        let dir = std::env::temp_dir().join(format!("bugtext-git-path-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let dir = dir.canonicalize().unwrap();
        let repo = Repo {
            root: dir.clone(),
            folder: dir.clone(),
            subfolder: String::new(),
            git: PathBuf::new(),
        };
        for path in ["../x", "/etc/passwd", "a/../../x", "a\0b", "a\\..\\x"] {
            assert_eq!(to_repo_rel(&repo, path), Err("outside"));
        }
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink("/tmp", dir.join("escape")).unwrap();
            assert_eq!(to_repo_rel(&repo, "escape/file"), Err("outside"));
        }
        assert_eq!(to_repo_rel(&repo, "-rf.md"), Ok("-rf.md".into()));
        let locks = RepoLocks::default();
        let guard = locks.lock(&dir).unwrap();
        assert!(locks.lock(&dir).is_err());
        drop(guard);
        assert!(locks.lock(&dir).is_ok());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
