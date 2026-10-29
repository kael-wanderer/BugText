use serde::Deserialize;
use std::path::Path;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPreset {
    pub id: String,
    pub name: String,
    pub built_in: Option<String>,
    pub page: Page,
    #[serde(rename = "type")]
    pub typography: Typography,
    pub title: Title,
    pub contents: Contents,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    pub size: String,
    pub margin_mm: i32,
    pub numbers: String,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Typography {
    pub font: Option<String>,
    pub size_pt: i32,
    pub line_spacing: f64,
}
#[derive(Clone, Deserialize)]
pub struct Title {
    pub mode: String,
    pub author: String,
    pub date: String,
}
#[derive(Clone, Deserialize)]
pub struct Contents {
    pub toc: bool,
    pub depth: i32,
    pub numbered: bool,
}
#[derive(Default, Deserialize)]
pub struct ExportMeta {
    pub title: String,
    pub author: String,
    pub date: String,
}

pub fn preset_args(
    format: &str,
    preset: Option<&ExportPreset>,
    meta: Option<&ExportMeta>,
    metadata_file: &Path,
) -> Result<Vec<String>, String> {
    let Some(p) = preset else {
        return Ok(vec![]);
    };
    if p.built_in.as_deref() == Some("standard") || p.id == "standard" {
        return Err("Standard must be sent without a preset".into());
    }
    let font_ok = p.typography.font.as_ref().is_none_or(|s| {
        !s.is_empty()
            && s.len() <= 64
            && s.bytes()
                .all(|c| c.is_ascii_alphanumeric() || b" ._-".contains(&c))
    });
    if p.id.is_empty()
        || p.name.trim().is_empty()
        || p.name.chars().count() > 40
        || !matches!(
            p.built_in.as_deref(),
            None | Some("handout") | Some("report")
        )
        || !matches!(p.page.size.as_str(), "a4" | "us-letter" | "a5" | "us-legal")
        || !(10..=50).contains(&p.page.margin_mm)
        || !matches!(p.page.numbers.as_str(), "none" | "n" | "n-of-total")
        || !font_ok
        || !(9..=16).contains(&p.typography.size_pt)
        || ![1.0, 1.15, 1.5].contains(&p.typography.line_spacing)
        || !matches!(
            p.title.mode.as_str(),
            "none" | "first-heading" | "file-name"
        )
        || p.title.author.chars().count() > 80
        || !matches!(p.title.date.as_str(), "none" | "export")
        || !(1..=3).contains(&p.contents.depth)
    {
        return Err("Invalid export preset".into());
    }
    if !matches!(format, "pdf" | "docx") {
        return Err("Invalid export format".into());
    }
    let mut args = Vec::new();
    if format == "pdf" {
        args.extend([
            "-V".into(),
            format!("papersize={}", p.page.size),
            format!("--metadata-file={}", metadata_file.display()),
        ]);
        match p.page.numbers.as_str() {
            "n" => args.extend(["-V".into(), "page-numbering=1".into()]),
            "n-of-total" => args.extend(["-V".into(), "page-numbering=1 / 1".into()]),
            _ => {}
        }
        if let Some(font) = &p.typography.font {
            args.extend(["-V".into(), format!("mainfont={font}")]);
        }
        args.extend([
            "-V".into(),
            format!("fontsize={}pt", p.typography.size_pt),
            "-V".into(),
            format!("linestretch={}", p.typography.line_spacing),
        ]);
    }
    if p.contents.toc {
        args.extend(["--toc".into(), format!("--toc-depth={}", p.contents.depth)]);
    }
    if p.contents.numbered {
        if format == "pdf" {
            args.extend(["-V".into(), "section-numbering=1.1.1".into()]);
        } else {
            args.push("--number-sections".into());
        }
    }
    if let Some(m) = meta {
        if m.author.chars().count() > 80
            || m.title.len() > 16384
            || m.date.len() > 256
            || [&m.title, &m.author, &m.date]
                .iter()
                .any(|s| s.contains('\0'))
        {
            return Err("Invalid export metadata".into());
        }
        for (key, value) in [
            ("title", &m.title),
            ("author", &m.author),
            ("date", &m.date),
        ] {
            if !value.is_empty() {
                args.extend(["-M".into(), format!("{key}={value}")]);
            }
        }
    }
    Ok(args)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn report() -> ExportPreset {
        serde_json::from_str(r#"{"id":"report","name":"Report","builtIn":"report","page":{"size":"a4","marginMm":25,"numbers":"n-of-total"},"type":{"font":null,"sizePt":11,"lineSpacing":1.15},"title":{"mode":"first-heading","author":"","date":"export"},"contents":{"toc":true,"depth":2,"numbered":true}}"#).unwrap()
    }
    #[test]
    fn standard_adds_nothing_and_explicit_standard_is_refused() {
        assert!(preset_args("pdf", None, None, Path::new("x"))
            .unwrap()
            .is_empty());
        let mut p = report();
        p.id = "standard".into();
        p.built_in = Some("standard".into());
        assert!(preset_args("pdf", Some(&p), None, Path::new("x")).is_err());
    }
    #[test]
    fn report_arguments_and_metadata_are_safe() {
        let p = report();
        let meta = ExportMeta {
            title: "#import \"x\": ]".into(),
            ..Default::default()
        };
        let pdf = preset_args("pdf", Some(&p), Some(&meta), Path::new("margin.yaml")).unwrap();
        assert!(pdf.contains(&"--metadata-file=margin.yaml".into()));
        assert!(pdf.contains(&"page-numbering=1 / 1".into()));
        assert!(pdf
            .windows(2)
            .any(|w| w == ["-M", "title=#import \"x\": ]"]));
        let doc = preset_args("docx", Some(&p), None, Path::new("x")).unwrap();
        assert!(doc.contains(&"--number-sections".into()));
        assert!(!doc
            .iter()
            .any(|x| x.contains("papersize") || x.contains("metadata-file")));
    }
    #[test]
    fn invalid_values_are_refused() {
        let mut variants = Vec::new();
        let mut p = report();
        p.page.margin_mm = 9;
        variants.push(p);
        let mut p = report();
        p.page.margin_mm = 51;
        variants.push(p);
        let mut p = report();
        p.typography.size_pt = 8;
        variants.push(p);
        let mut p = report();
        p.typography.size_pt = 17;
        variants.push(p);
        let mut p = report();
        p.typography.line_spacing = 1.2;
        variants.push(p);
        let mut p = report();
        p.typography.font = Some("bad\"font".into());
        variants.push(p);
        let mut p = report();
        p.contents.depth = 0;
        variants.push(p);
        let mut p = report();
        p.contents.depth = 4;
        variants.push(p);
        let mut p = report();
        p.title.author = "x".repeat(81);
        variants.push(p);
        let mut p = report();
        p.page.size = "bad".into();
        variants.push(p);
        let mut p = report();
        p.page.numbers = "bad".into();
        variants.push(p);
        let mut p = report();
        p.title.mode = "bad".into();
        variants.push(p);
        let mut p = report();
        p.title.date = "bad".into();
        variants.push(p);
        for p in variants {
            assert!(preset_args("pdf", Some(&p), None, Path::new("x")).is_err());
        }
    }
}

#[cfg(test)]
mod pandoc_test {
    use std::io::Write;
    use std::process::{Command, Stdio};
    #[test]
    fn pandoc_escapes_metadata_and_reads_margin_map() {
        if Command::new("pandoc")
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_err()
        {
            return;
        }
        let path =
            std::env::temp_dir().join(format!("bugtext-test-margin-{}.yaml", std::process::id()));
        std::fs::write(&path, "margin:\n  x: 25mm\n  y: 25mm\n").unwrap();
        let mut child = Command::new("pandoc")
            .args([
                "-f",
                "html",
                "-t",
                "typst",
                "--standalone",
                "-M",
                "title=#import \"x\": ]",
                "--metadata-file",
            ])
            .arg(&path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        child
            .stdin
            .take()
            .unwrap()
            .write_all(b"<p>hello</p>")
            .unwrap();
        let output = child.wait_with_output().unwrap();
        let _ = std::fs::remove_file(path);
        assert!(output.status.success());
        let text = String::from_utf8(output.stdout).unwrap();
        assert!(text.contains("\\#import") && text.contains("25mm"));
    }
}
