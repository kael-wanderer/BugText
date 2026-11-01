use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

const ERROR: &str = "Bibliography could not be read.";
const FILTER: &str = r#"
function Span(el)
  if not el.classes:includes('bugtext-cite') then return nil end
  local source = el.attributes['source'] or el.attributes['data-source'] or ''
  local ok, doc = pcall(pandoc.read, source, 'markdown-raw_html-raw_attribute-raw_tex-native_spans-native_divs-inline_code_attributes-tex_math_dollars')
  if not ok then return pandoc.Str(source) end
  local raw = false
  doc:walk({ RawInline = function() raw = true end, RawBlock = function() raw = true end, Code = function() raw = true end })
  if raw or #doc.blocks ~= 1 or doc.blocks[1].t ~= 'Para' or #doc.blocks[1].content ~= 1 or doc.blocks[1].content[1].t ~= 'Cite' then
    return pandoc.Str(source)
  end
  return doc.blocks[1].content[1]
end
"#;
const APA: &str = include_str!("../resources/csl/apa.csl");
const IEEE: &str = include_str!("../resources/csl/ieee.csl");
static NEXT: AtomicU64 = AtomicU64::new(0);
#[derive(serde::Deserialize)]
pub struct CitationArgs { pub bibliography: String, pub folder: String, pub style: String }
pub(crate) struct CitationFiles { pub args: Vec<String>, temp: Vec<PathBuf> }
impl Drop for CitationFiles { fn drop(&mut self) { for path in &self.temp { let _ = fs::remove_file(path); } } }
impl CitationFiles {
    fn write(&mut self, suffix: &str, data: &str) -> Result<PathBuf, String> {
        let path = std::env::temp_dir().join(format!("bugtext-cite-{}-{}.{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed), suffix));
        let mut file = OpenOptions::new().write(true).create_new(true).open(&path).map_err(|_| ERROR.to_string())?;
        self.temp.push(path.clone());
        file.write_all(data.as_bytes()).map_err(|_| ERROR.to_string())?;
        Ok(path)
    }
}
pub(crate) fn citation_args(c: &CitationArgs) -> Result<CitationFiles, String> {
    let folder = fs::canonicalize(&c.folder).map_err(|_| ERROR.to_string())?;
    let bibliography = fs::canonicalize(&c.bibliography).map_err(|_| ERROR.to_string())?;
    let meta = fs::metadata(&bibliography).map_err(|_| ERROR.to_string())?;
    let extension = bibliography.extension().and_then(|x| x.to_str()).unwrap_or("");
    if !folder.is_dir() || !bibliography.starts_with(&folder) || !meta.is_file() || meta.len() > 5 * 1024 * 1024 || !["bib", "json"].iter().any(|x| extension.eq_ignore_ascii_case(x)) { return Err(ERROR.into()); }
    let style = match c.style.as_str() { "chicago" => None, "apa" => Some(APA), "ieee" => Some(IEEE), _ => return Err(ERROR.into()) };
    let mut files = CitationFiles { args: Vec::new(), temp: Vec::new() };
    let filter = files.write("lua", FILTER)?;
    files.args.extend(["--lua-filter".into(), filter.to_string_lossy().into_owned(), "--citeproc".into(), "--bibliography".into(), bibliography.to_string_lossy().into_owned()]);
    if let Some(style) = style { let path = files.write("csl", style)?; files.args.extend(["--csl".into(), path.to_string_lossy().into_owned()]); }
    files.args.extend(["-M".into(), "reference-section-title=References".into()]);
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_paths_style_and_cleans_temporary_files() {
        let root = std::env::temp_dir().join(format!("bugtext-cite-test-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap(); let bib = root.join("refs.bib"); fs::write(&bib, "@book{x,title={Title}}").unwrap();
        let mut c = CitationArgs { bibliography: bib.to_string_lossy().into(), folder: root.to_string_lossy().into(), style: "apa".into() };
        let files = citation_args(&c).unwrap(); assert_eq!(files.args[0], "--lua-filter"); assert_eq!(files.args[2], "--citeproc"); assert_eq!(files.args[3], "--bibliography"); assert_eq!(files.args[5], "--csl");
        let temps = files.temp.clone(); drop(files); assert!(temps.iter().all(|p| !p.exists()));
        c.style = "invalid".into(); assert!(citation_args(&c).is_err()); c.style = "chicago".into();
        c.bibliography = root.join("../outside.bib").to_string_lossy().into(); assert!(citation_args(&c).is_err());
        let wrong = root.join("bad.txt"); fs::write(&wrong, "x").unwrap(); c.bibliography = wrong.to_string_lossy().into(); assert!(citation_args(&c).is_err());
        fs::write(&bib, vec![0u8; 5 * 1024 * 1024 + 1]).unwrap(); c.bibliography = bib.to_string_lossy().into(); assert!(citation_args(&c).is_err());
        #[cfg(unix)] { let link = root.join("outside.json"); let outside = std::env::temp_dir().join(format!("outside-{}.json", std::process::id())); fs::write(&outside, "[]").unwrap(); std::os::unix::fs::symlink(&outside, &link).unwrap(); c.bibliography = link.to_string_lossy().into(); assert!(citation_args(&c).is_err()); let _ = fs::remove_file(outside); }
        let _ = fs::remove_dir_all(root);
    }
    #[test]
    #[ignore = "requires pandoc"]
    fn rejects_raw_typst_in_citation_source() {
        use std::process::{Command, Stdio};
        let root = std::env::temp_dir().join(format!("bugtext-cite-raw-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap(); let bib = root.join("refs.bib"); fs::write(&bib, "@book{lee2023,title={Test}}").unwrap();
        let c = CitationArgs { bibliography: bib.to_string_lossy().into(), folder: root.to_string_lossy().into(), style: "chicago".into() };
        let files = citation_args(&c).unwrap();
        let mut child = Command::new("pandoc").args(["--from", "html", "--to", "native", "--lua-filter", &files.args[1]]).stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().unwrap();
        child.stdin.take().unwrap().write_all(br#"<span class="bugtext-cite" data-source="[see `#read(&quot;/etc/hosts&quot;)`{=typst} @lee2023]">x</span>"#).unwrap();
        let out = child.wait_with_output().unwrap(); assert!(out.status.success()); let native = String::from_utf8_lossy(&out.stdout); assert!(!native.contains("RawInline")); assert!(!native.contains("Cite")); assert!(native.contains("read"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    #[ignore = "requires pandoc"]
    fn pandoc_formats_citation_and_references() {
        use std::process::{Command, Stdio};
        let root = std::env::temp_dir().join(format!("bugtext-cite-export-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap(); let bib = root.join("refs.bib"); fs::write(&bib, "@book{smith,author={Smith, Jane},title={A Book},year={2024}}").unwrap();
        for style in ["chicago", "apa", "ieee"] {
            let c = CitationArgs { bibliography: bib.to_string_lossy().into(), folder: root.to_string_lossy().into(), style: style.into() };
            let files = citation_args(&c).unwrap();
            let mut child = Command::new("pandoc").args(["--from", "html", "--to", "plain"]).args(&files.args).stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().unwrap();
            child.stdin.take().unwrap().write_all(br#"<p><span class="bugtext-cite" data-source="[@smith]">source</span></p>"#).unwrap();
            let out = child.wait_with_output().unwrap(); let text = String::from_utf8_lossy(&out.stdout);
            assert!(out.status.success()); assert!(text.contains("Smith"), "{style}: {text}"); assert!(text.to_lowercase().contains("a book"), "{style}: {text}");
        }
        let _ = fs::remove_dir_all(root);
    }

}
