pub const MAX_TEXT_UNITS: usize = 100_000;
pub const MAX_WORD_UNITS: usize = 100;
pub const MAX_SUGGESTIONS: usize = 5;
const FAILED: &str = "Spell check failed.";

pub fn valid_text(text: &str) -> bool {
    text.encode_utf16().count() <= MAX_TEXT_UNITS
}

pub fn valid_word(word: &str) -> bool {
    let len = word.encode_utf16().count();
    (1..=MAX_WORD_UNITS).contains(&len)
        && !word.chars().any(|c| c.is_whitespace() || c.is_control())
}

#[tauri::command]
pub async fn spell_check(text: String) -> Result<Vec<[usize; 2]>, String> {
    if !valid_text(&text) {
        return Err(FAILED.into());
    }
    native::check(&text)
}

#[tauri::command]
pub async fn spell_suggest(word: String) -> Result<Vec<String>, String> {
    if !valid_word(&word) {
        return Ok(vec![]);
    }
    native::suggest(&word)
}

#[tauri::command]
pub async fn spell_ignore(word: String) -> Result<(), String> {
    if !valid_word(&word) {
        return Err(FAILED.into());
    }
    native::ignore(&word)
}

#[tauri::command]
pub async fn spell_learn(word: String) -> Result<(), String> {
    if !valid_word(&word) {
        return Err(FAILED.into());
    }
    native::learn(&word)
}

#[cfg(target_os = "macos")]
mod native {
    use super::{FAILED, MAX_SUGGESTIONS};
    use objc2_app_kit::NSSpellChecker;
    use objc2_foundation::{NSRange, NSString, NSTextCheckingType};
    use std::sync::{Mutex, OnceLock};

    static LOCK: Mutex<()> = Mutex::new(());
    static TAG: OnceLock<isize> = OnceLock::new();

    fn tag() -> isize {
        *TAG.get_or_init(NSSpellChecker::uniqueSpellDocumentTag)
    }

    pub fn check(text: &str) -> Result<Vec<[usize; 2]>, String> {
        let _guard = LOCK.lock().map_err(|_| FAILED.to_string())?;
        let text = NSString::from_str(text);
        let checker = NSSpellChecker::sharedSpellChecker();
        // No options or output pointers are passed to the system checker.
        let results = unsafe {
            checker.checkString_range_types_options_inSpellDocumentWithTag_orthography_wordCount(
                &text,
                NSRange::new(0, text.length()),
                NSTextCheckingType::Spelling.0,
                None,
                tag(),
                None,
                std::ptr::null_mut(),
            )
        };
        Ok(results
            .to_vec()
            .iter()
            // The system may include orthography results even for a spelling request.
            .filter(|result| result.resultType() == NSTextCheckingType::Spelling)
            .map(|result| {
                let r = result.range();
                [r.location, r.length]
            })
            .collect())
    }

    pub fn suggest(word: &str) -> Result<Vec<String>, String> {
        let _guard = LOCK.lock().map_err(|_| FAILED.to_string())?;
        let word = NSString::from_str(word);
        let guesses = NSSpellChecker::sharedSpellChecker()
            .guessesForWordRange_inString_language_inSpellDocumentWithTag(
                NSRange::new(0, word.length()),
                &word,
                None,
                tag(),
            );
        Ok(guesses
            .map(|items| {
                items
                    .to_vec()
                    .iter()
                    .take(MAX_SUGGESTIONS)
                    .map(|s| s.to_string())
                    .collect()
            })
            .unwrap_or_default())
    }

    pub fn ignore(word: &str) -> Result<(), String> {
        let _guard = LOCK.lock().map_err(|_| FAILED.to_string())?;
        NSSpellChecker::sharedSpellChecker()
            .ignoreWord_inSpellDocumentWithTag(&NSString::from_str(word), tag());
        Ok(())
    }

    pub fn learn(word: &str) -> Result<(), String> {
        let _guard = LOCK.lock().map_err(|_| FAILED.to_string())?;
        NSSpellChecker::sharedSpellChecker().learnWord(&NSString::from_str(word));
        Ok(())
    }
}

#[cfg(not(target_os = "macos"))]
mod native {
    pub fn check(_: &str) -> Result<Vec<[usize; 2]>, String> {
        Ok(vec![])
    }
    pub fn suggest(_: &str) -> Result<Vec<String>, String> {
        Ok(vec![])
    }
    pub fn ignore(_: &str) -> Result<(), String> {
        Ok(())
    }
    pub fn learn(_: &str) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "macos")]
    #[test]
    fn orthography_is_not_a_misspelling() {
        let text = "Code stays literal:                 ";
        let ranges = super::native::check(text).unwrap();
        assert!(!ranges.contains(&[0, text.len()]));
    }

    #[test]
    fn word_validation() {
        for word in [
            "",
            "two words",
            "a\tb",
            "a\nb",
            "a\u{0001}",
            &"a".repeat(101),
        ] {
            assert!(!valid_word(word));
        }
        for word in ["naïve", "café"] {
            assert!(valid_word(word));
        }
    }

    #[test]
    fn text_validation_counts_utf16() {
        assert!(valid_text(&"😀".repeat(50_000)));
        assert!(!valid_text(&("😀".repeat(50_000) + "a")));
    }

    #[test]
    fn invalid_check_returns_generic_error() {
        assert_eq!(
            tauri::async_runtime::block_on(spell_check("a".repeat(100_001))),
            Err(FAILED.into())
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn system_checker_ranges_suggestions_and_ignore() {
        tauri::async_runtime::block_on(async {
            assert_eq!(
                spell_check("The rollout recieve plan".into())
                    .await
                    .unwrap(),
                vec![[12, 7]]
            );
            assert_eq!(
                spell_check("😀 recieve".into()).await.unwrap(),
                vec![[3, 7]]
            );
            assert!(spell_suggest("recieve".into())
                .await
                .unwrap()
                .contains(&"receive".to_string()));
            spell_ignore("zzqvx".into()).await.unwrap();
            assert!(spell_check("zzqvx".into()).await.unwrap().is_empty());
        });
    }
}
