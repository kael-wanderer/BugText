use std::path::{Component, Path, PathBuf};

const OUTSIDE: &str = "That path is outside the folders open in BugText.";
const EXTENSION: &str = "Only .md, .markdown and .txt notes are supported.";
const CREATE_NEEDS_ROOT: &str = "Creating notes needs a folder open in BugText.";

pub struct Roots {
    pub folders: Vec<PathBuf>,
    pub open_files: Vec<PathBuf>,
    pub config_dir: PathBuf,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Access {
    Read,
    Write,
    Create,
}

pub fn text_ext_ok(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            ["md", "markdown", "txt"]
                .iter()
                .any(|allowed| extension.eq_ignore_ascii_case(allowed))
        })
}

fn normalize_absolute(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err(OUTSIDE.to_string());
    }
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Prefix(prefix) => out.push(prefix.as_os_str()),
            Component::RootDir => out.push(component.as_os_str()),
            Component::CurDir => {}
            Component::ParentDir => {
                if !out.pop() || out.as_os_str().is_empty() {
                    return Err(OUTSIDE.to_string());
                }
            }
            Component::Normal(part) => out.push(part),
        }
    }
    Ok(out)
}

fn canonical_for_create(path: &Path) -> Result<PathBuf, String> {
    let mut ancestor = path;
    let mut tail = Vec::new();
    while !ancestor.exists() {
        let Some(name) = ancestor.file_name() else {
            return Err(OUTSIDE.to_string());
        };
        tail.push(name.to_os_string());
        ancestor = ancestor.parent().ok_or_else(|| OUTSIDE.to_string())?;
    }
    let mut canonical = ancestor.canonicalize().map_err(|_| OUTSIDE.to_string())?;
    for part in tail.into_iter().rev() {
        canonical.push(part);
    }
    Ok(canonical)
}

fn canonical_root(path: &Path) -> Option<PathBuf> {
    path.canonicalize().ok()
}

fn has_hidden_component(path: &Path, roots: &[PathBuf]) -> bool {
    roots.iter().any(|root| {
        path.strip_prefix(root).ok().is_some_and(|relative| {
            relative.components().any(|component| {
                component
                    .as_os_str()
                    .to_str()
                    .is_some_and(crate::files::should_skip)
            })
        })
    })
}

pub fn check(path: &str, roots: &Roots, access: Access) -> Result<PathBuf, String> {
    let lexical = normalize_absolute(Path::new(path))?;
    let canonical = if access == Access::Create {
        canonical_for_create(&lexical)?
    } else {
        lexical.canonicalize().map_err(|_| OUTSIDE.to_string())?
    };

    let folders: Vec<_> = roots.folders.iter().filter_map(|root| canonical_root(root)).collect();
    let open_files: Vec<_> = roots
        .open_files
        .iter()
        .filter_map(|file| file.canonicalize().ok())
        .collect();
    let config = canonical_for_create(&roots.config_dir).ok();

    if config.as_ref().is_some_and(|config| canonical.starts_with(config)) {
        return Err(OUTSIDE.to_string());
    }
    if has_hidden_component(&canonical, &folders)
        || open_files.iter().any(|file| {
            canonical == *file
                && canonical
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(crate::files::should_skip)
        })
    {
        return Err(OUTSIDE.to_string());
    }

    let in_folder = folders.iter().any(|root| canonical.starts_with(root));
    let is_open_file = access != Access::Create && open_files.iter().any(|file| canonical == *file);
    if !in_folder && !is_open_file {
        if access == Access::Create && folders.is_empty() {
            return Err(CREATE_NEEDS_ROOT.to_string());
        }
        return Err(OUTSIDE.to_string());
    }
    if !text_ext_ok(&canonical) {
        return Err(EXTENSION.to_string());
    }
    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::{check, Access, Roots};
    use std::fs;
    use std::path::PathBuf;

    struct TempDir(PathBuf);

    impl TempDir {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "bugtext-mcp-{name}-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn roots(folder: &std::path::Path) -> Roots {
        Roots {
            folders: vec![folder.to_path_buf()],
            open_files: vec![],
            config_dir: folder.join("config"),
        }
    }

    #[test]
    fn relative_path_refused() {
        let dir = TempDir::new("relative");
        let result = check("notes/a.md", &roots(&dir.0), Access::Read);
        assert_eq!(result.unwrap_err(), "That path is outside the folders open in BugText.");
    }

    #[test]
    fn dotdot_escape_refused() {
        let dir = TempDir::new("dotdot");
        let path = dir.0.join("sub/../../x.md");
        assert_eq!(check(path.to_str().unwrap(), &roots(&dir.0), Access::Read).unwrap_err(), "That path is outside the folders open in BugText.");
    }

    #[cfg(unix)]
    #[test]
    fn symlink_out_refused() {
        use std::os::unix::fs::symlink;
        let dir = TempDir::new("symlink-out");
        let outside = TempDir::new("symlink-target");
        fs::write(outside.0.join("a.md"), "x").unwrap();
        symlink(outside.0.join("a.md"), dir.0.join("link.md")).unwrap();
        assert_eq!(check(dir.0.join("link.md").to_str().unwrap(), &roots(&dir.0), Access::Read).unwrap_err(), "That path is outside the folders open in BugText.");
    }

    #[cfg(unix)]
    #[test]
    fn symlink_in_allowed() {
        use std::os::unix::fs::symlink;
        let dir = TempDir::new("symlink-in");
        let alias = dir.0.join("alias");
        symlink(&dir.0, &alias).unwrap();
        let file = dir.0.join("a.md");
        fs::write(&file, "x").unwrap();
        assert_eq!(check(alias.join("a.md").to_str().unwrap(), &roots(&alias), Access::Read).unwrap(), file.canonicalize().unwrap());
    }

    #[test]
    fn config_dir_refused() {
        let dir = TempDir::new("config");
        let mut r = roots(&dir.0);
        r.config_dir = dir.0.join("private-config");
        fs::create_dir_all(&r.config_dir).unwrap();
        fs::write(r.config_dir.join("agent.json"), "{}").unwrap();
        assert_eq!(check(r.config_dir.join("agent.json").to_str().unwrap(), &r, Access::Read).unwrap_err(), "That path is outside the folders open in BugText.");
    }

    #[test]
    fn git_and_hidden_refused() {
        let dir = TempDir::new("hidden");
        fs::create_dir_all(dir.0.join(".git")).unwrap();
        fs::create_dir_all(dir.0.join(".hidden")).unwrap();
        fs::write(dir.0.join(".git/x.md"), "x").unwrap();
        fs::write(dir.0.join(".hidden/x.md"), "x").unwrap();
        let r = roots(&dir.0);
        for path in [dir.0.join(".git/x.md"), dir.0.join(".hidden/x.md")] {
            assert_eq!(check(path.to_str().unwrap(), &r, Access::Read).unwrap_err(), "That path is outside the folders open in BugText.");
        }
    }

    #[test]
    fn wrong_extension() {
        let dir = TempDir::new("extension");
        fs::write(dir.0.join("a.pdf"), "x").unwrap();
        fs::write(dir.0.join("A.MD"), "x").unwrap();
        let r = roots(&dir.0);
        assert_eq!(check(dir.0.join("a.pdf").to_str().unwrap(), &r, Access::Read).unwrap_err(), "Only .md, .markdown and .txt notes are supported.");
        assert!(check(dir.0.join("A.MD").to_str().unwrap(), &r, Access::Read).is_ok());
    }

    #[test]
    fn create_nested_missing_parents_ok() {
        let dir = TempDir::new("create");
        let path = dir.0.join("new/deeper/n.md");
        assert!(check(path.to_str().unwrap(), &roots(&dir.0), Access::Create).is_ok());
    }

    #[test]
    fn open_file_without_folder() {
        let dir = TempDir::new("open-file");
        let path = dir.0.join("a.md");
        fs::write(&path, "x").unwrap();
        let r = Roots { folders: vec![], open_files: vec![path.clone()], config_dir: dir.0.join("config") };
        assert!(check(path.to_str().unwrap(), &r, Access::Read).is_ok());
        assert!(check(path.to_str().unwrap(), &r, Access::Write).is_ok());
        assert_eq!(check(path.to_str().unwrap(), &r, Access::Create).unwrap_err(), "Creating notes needs a folder open in BugText.");
    }
}
