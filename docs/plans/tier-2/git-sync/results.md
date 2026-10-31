# S9 Git backup and sync — acceptance

Automated checks name the relevant tests below. Run every native check on display 2.

- Modified, deleted, renamed and new entries and their diffs: automated by `real_repository_status_scope_and_diff`, `real_repository_deleted_renamed_and_option_like_diff` and `Git panel` grouping tests. Native: compare all four diffs with Git in the sidebar.
- Commit two of four; leave an unrelated staged file staged: automated by `selected_commits_new_rename_and_literal_messages`. Native: check selection and saved/dirty tab interaction.
- Fast-forward pull, Recovery snapshot and changed-tab checks: automated by `pull_diverge_conflicts_resolve_and_abort` and `snapshots dirty repository tabs before pull and checks only open changed paths`. Native: verify clean reload and dirty Reload / Keep mine prompt.
- Divergence and conflicting merge without automatic commit: automated by `pull_diverge_conflicts_resolve_and_abort` and `passes diverged and conflict outcomes through without starting further actions`. Native: verify Merge button, conflict banner and editor navigation.
- Push ahead branch and reset indicator: automated remote update by `clean_merge_push_rejection_no_upstream_and_busy`. Native: verify indicator refreshes to ↑0.
- Cancel slow fetch, stop process group, refresh: automated by `timeout_and_cancel_kill_grandchild`, `timeout_and_cancel_stop_slow_git_requests` and `the running action's cancel button passes its request id`. Native: verify status re-read after cancel.
- Hostile HTML filename and diff: automated by `real_repository_status_scope_and_diff` and `renders untrusted branch, file names and diff text safely below the list`.
- Literal option and shell-like commit messages: automated by `selected_commits_new_rename_and_literal_messages`.
- Outside and absolute paths refused: automated by `confines_untrusted_paths_and_serializes_repository_actions`; native: exercise crafted IPC and confirm no Git call.
- HTTPS authentication failure without prompts or token leakage: local 401 failure and timeout automated by `remote_auth_timeout_and_redacted_log`. Native: verify the actual HTTPS credential-helper case and generic sign-in message without prompts.
- Remote credentials redacted: automated by `remote_diagnostic_credentials_are_redacted_in_action_log`.
- Conflict markers prevent resolution: automated by `pull_diverge_conflicts_resolve_and_abort`.
- Inherited GIT_DIR ignored: automated by `resolution_rejects_non_repos_and_ignores_inherited_git_dir` and `inherited_hostile_git_environment_is_cleared`.
- Configured fsmonitor and external diff do not run: automated by `status_and_diff_ignore_external_programs_and_limit_output`.
- Missing Git and Xcode shim: settings message automated by `shows diagnostics as text, checks again, and sets the toggle`. Native: verify no executable starts when Git and command-line tools are unavailable.
- Rejected push never forced: automated by `clean_merge_push_rejection_no_upstream_and_busy` and `push_command_contains_only_fixed_prefix_and_push`.
