# AI settings — local coding CLIs and folder safety

The AI panel is Chat only. Interactive agent sessions run in the user's own
terminal. These checks cover Settings ▸ AI ▸ Local CLI and Chat's safe agent runs.

### CLI-01 — Detection and rescan
- Steps: Open Local CLI, then click Rescan.
- Expected: Claude Code, Codex CLI and Pi cards appear in that order. Pending cards
  say “Looking…”; missing tools say “Not found on PATH” without a Test button.
  Test and Rescan cannot run concurrently.
- Status: [ ] Notes:

### CLI-02 — Claude accounts
- Steps: With two detected Claude config directories, select another Account.
- Expected: `localCli.claude.configDir` persists. The Account select is hidden when
  there is only one account. The selected account is used by Test and Chat.
- Status: [ ] Notes:

### CLI-03 — Per-feature usage
- Steps: Choose Codex CLI for Rewrite under Use for, then open Local CLI.
- Expected: Codex's usage tags include Rewrite. Features without an explicit
  engine inherit Chat/default resolution. Disabling a feature keeps its choices.
- Status: [ ] Notes:

### CLI-04 — Advanced paths and proxy
- Steps: Edit config/home, executable path and proxy. Try `http://evil.com`, then
  an HTTPS address or `http://localhost:1234/v1`.
- Expected: Valid changes save on blur; the non-local HTTP address is rejected
  without saving. Changing an executable path rescans the tools.
- Status: [ ] Notes:

### CLI-05 — Keychain controls
- Steps: Save, replace and remove a CLI proxy API key.
- Expected: The password input clears after save and stays empty when reopening.
  “A key is saved” reflects the keychain. The key never appears in `agent.json`.
- Status: [ ] Notes:

### CLI-06 — Answer-only tests and sign-out
- Steps: Click Test for an installed tool, including a signed-out account.
- Expected: Test uses the first matching feature's model/effort in answer-only
  mode, returning “It answered: ok” or the tool's sign-in instructions.
- Status: [ ] Notes:

### CLI-07 — Folder writes and escape denial
- Steps: Chat with Claude Code and Codex in an open folder. Request a note inside
  the folder and an attempted write to the home directory.
- Expected: The folder note succeeds; the escape is denied. The changed-files
  card lists the note. Without a folder both tools are answer-only; Pi is always
  answer-only. Cancellation waits for termination before checking changed files.
- Status: [ ] Notes:

### CLI-08 — Unsaved text recovery
- Steps: Edit a saved note without saving. Ask an agent to modify that file.
- Expected: Version History includes “Before <tool> run” with the unsaved text.
  The existing Reload / Keep mine dialog protects the open dirty tab afterward.
- Status: [ ] Notes:
