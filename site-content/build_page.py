#!/usr/bin/env python3
"""Single source for the BugText product page copy.

Run `python3 site-content/build_page.py` to check every admin character limit and
write BugText-page.md and BugText-sections.json next to this file. It exits with
status 1 and prints the offending fields when any limit is exceeded.
"""
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
SHOTS = HERE / "screenshots"

catalog = {
    "name": "BugText",
    "pronunciation": "bug-text",
    "summary": (
        "A Markdown editor and document workspace for Mac. Write with live preview, "
        "read and mark up PDFs, search a whole folder, and ask an AI about your notes."
    ),
    "details": (
        "BugText opens a folder of Markdown, text, HTML and PDF files in one window. "
        "Write in a code-style editor with a live preview that renders tables, math "
        "and Mermaid diagrams. Search every file at once, jump anywhere with a "
        "command palette, and split the window to work on two documents side by side. "
        "PDFs open in a built-in reader where you can add text, cover areas and run "
        "offline OCR. An optional AI panel answers questions about your notes using "
        "Claude Code, Codex, a local model or your own API key. Your files stay "
        "ordinary files on your disk."
    ),
    "category": "Productivity",
    "tags": "markdown, editor, notes, pdf, ai, macos",
    "platform": "macOS",
    "license": "MIT (free and open source)",
    "requirements": "macOS · Apple Silicon & Intel · Pandoc + Typst for PDF/DOCX export",
    "accent": "#2F5BD3",
}

screenshots = [
    ("01-hero.png", "Editor and live preview with a Mermaid diagram"),
    ("02-reading-view.png", "Reading view with math and tables, light theme"),
    ("03-find-in-folder.png", "Find in Folder across notes and PDFs"),
    ("04-command-palette.png", "⌘K palette: files, headings and commands"),
    ("05-pdf-editing.png", "PDF reader with a text note added"),
    ("06-ai-chat.png", "AI chat answering from the open folder"),
    ("07-ai-settings.png", "Settings: pick an engine for each AI feature"),
    ("08-split-nord-theme.png", "Main and Sub panes side by side, Nord theme"),
]

features = [
    {
        "background": "plain",
        "kicker": "What it is",
        "title": "A Markdown editor that shows the finished page as you type",
        "description": (
            "Open a folder and BugText lists every note in an Explorer beside the "
            "editor. Type on the left and the rendered page updates on the right, "
            "with tables, task lists, KaTeX math and Mermaid diagrams drawn in place."
        ),
        "layout": "split",
        "bullets": [
            "Editor, Read or Editor + Preview mode for each tab",
            "Formatting toolbar for headings, links, lists, tables and task lists",
            "Syntax highlighting for Markdown, HTML, JSON, YAML, SQL and JavaScript",
            "Tabs with unsaved markers, pinning and session restore",
            "Six themes: System, Light, Dark, Catppuccin Mocha, Everforest Dark, Nord",
        ],
        "side": "right",
        "media": {"pictures": ["01-hero.png", "02-reading-view.png"]},
    },
    {
        "background": "tint",
        "kicker": "Find and read",
        "title": "Notes, search and PDFs in the same window",
        "description": (
            "Search a whole folder, open any file from the keyboard, read PDFs next "
            "to your notes and keep two documents open side by side."
        ),
        "layout": "showcase",
        "tiles": [
            {
                "title": "Find in Folder",
                "caption": "Search every text file and PDF at once, with case, whole-word and regex options.",
                "picture": "03-find-in-folder.png",
            },
            {
                "title": "Command palette",
                "caption": "⌘K finds files, headings in the open note, and every command.",
                "picture": "04-command-palette.png",
            },
            {
                "title": "PDF reader and editor",
                "caption": "Add text and cover boxes, rewrite selected text, or OCR a scanned page offline.",
                "picture": "05-pdf-editing.png",
            },
            {
                "title": "Main and Sub panes",
                "caption": "Split any window into two panes with their own tabs and view modes.",
                "picture": "08-split-nord-theme.png",
            },
        ],
    },
    {
        "background": "dark",
        "kicker": "Optional AI",
        "title": "Ask about your notes with the AI tools you already use",
        "description": (
            "The AI panel reads the open note and the most relevant passages from "
            "your folder, then shows which files it used. It runs Claude Code, Codex "
            "CLI or Pi from your Mac, or any API connection you add."
        ),
        "layout": "split",
        "bullets": [
            "Choose an engine and model separately for Chat and each quick action",
            "Proofread, Rewrite, Summarize and Generate outline from ⌘K or right-click",
            "Every AI edit is shown as a diff before it touches your text",
            "Attach files with 📎, drag and drop, or an @-mention",
            "Works with Ollama, LM Studio, Anthropic, OpenAI and OpenRouter",
        ],
        "side": "left",
        "media": {"pictures": ["06-ai-chat.png", "07-ai-settings.png"]},
    },
    {
        "background": "plain",
        "kicker": "How it works",
        "title": "From folder to finished document in four steps",
        "description": "BugText works on the files you already have. Nothing to import.",
        "layout": "cards",
        "numbered": True,
        "cards": [
            {
                "title": "Open a folder",
                "text": "Pick any folder of notes. The Explorer shows its files, and you can create, rename, move and delete them there.",
            },
            {
                "title": "Write and preview",
                "text": "Edit Markdown with the preview beside you. Diagrams, math and tables render as you type.",
            },
            {
                "title": "Find and ask",
                "text": "Search the folder, jump with ⌘K, or ask the AI panel a question about your notes.",
            },
            {
                "title": "Save or export",
                "text": "Save with ⌘S. Export to PDF, Word (DOCX), PNG or SVG with math and diagrams included.",
            },
        ],
    },
    {
        "background": "tint",
        "kicker": "Local first",
        "title": "Your files stay on your Mac",
        "description": (
            "BugText has no account and no cloud storage. It edits plain files in "
            "folders you choose, and keeps its own safety copies beside them."
        ),
        "layout": "cards",
        "numbered": False,
        "cards": [
            {
                "title": "Plain files",
                "text": "Notes are ordinary .md and .txt files. Open them in any other editor, or put the folder in your own sync service.",
            },
            {
                "title": "Recovery and history",
                "text": "Unsaved edits are drafted in the background and offered back after a crash. Each save keeps a local snapshot you can compare and restore.",
            },
            {
                "title": "Keys in the Keychain",
                "text": "API keys are stored in the macOS Keychain, never in settings files.",
            },
            {
                "title": "Sandboxed AI runs",
                "text": "Coding agents run in a macOS sandbox limited to the open folder, and BugText lists every file they changed.",
            },
            {
                "title": "Offline OCR",
                "text": "PDF text recognition runs inside the app with no network connection. English and Vietnamese are included.",
            },
            {
                "title": "Open source",
                "text": "BugText is MIT licensed and its source code is public on GitHub.",
            },
        ],
    },
]

faq = [
    {
        "question": "What is BugText?",
        "answer": (
            "BugText is a desktop Markdown editor and document workspace. It opens a "
            "folder of Markdown, text, HTML and PDF files in one window, with a live "
            "preview, folder search, a command palette, a PDF reader with editing "
            "tools, and an optional AI panel."
        ),
    },
    {
        "question": "Who is it for?",
        "answer": (
            "People who keep notes, documentation or project files as Markdown in "
            "folders: developers, technical writers, students and researchers who want "
            "an IDE-style layout without a heavy IDE."
        ),
    },
    {
        "question": "Which platforms does it run on?",
        "answer": (
            "BugText is built for macOS and runs natively on Apple Silicon and Intel "
            "Macs. PDF and DOCX export need Pandoc and Typst, which you can install "
            "with `brew install pandoc typst`. The AI panel needs either a supported "
            "command-line agent or an API connection."
        ),
    },
    {
        "question": "How much does it cost?",
        "answer": (
            "BugText is free. It is open source under the MIT license. AI providers "
            "you connect may charge for their own service."
        ),
    },
    {
        "question": "Where are my files and settings stored?",
        "answer": (
            "Your notes stay where you put them, as plain files. Settings live in the "
            "app's configuration folder on your Mac, and API keys are kept in the macOS "
            "Keychain. BugText has no account and does not upload your files. When you "
            "use AI, the note text and passages you send go to the engine you chose."
        ),
    },
    {
        "question": "Does it work offline? Does it sync?",
        "answer": (
            "Everything except cloud AI and update checks works offline, including "
            "PDF OCR. BugText has no sync service of its own. Because notes are normal "
            "files, you can keep the folder in iCloud Drive, Dropbox or a Git repo, and "
            "BugText reloads files that change on disk."
        ),
    },
    {
        "question": "How do I install and update it?",
        "answer": (
            "Download the .dmg from the GitHub releases page and drag BugText to "
            "Applications. The app is not signed with an Apple Developer ID yet, so the "
            "first launch shows a Gatekeeper warning. Open System Settings ▸ Privacy & "
            "Security and click Open Anyway, then launch it again. Updates are "
            "signed and BugText always asks before installing one. Checks are manual "
            "by default; you can turn on a daily automatic check."
        ),
    },
    {
        "question": "Can I import and export documents?",
        "answer": (
            "There is nothing to import: open any folder of .md, .txt, .html or .pdf "
            "files. Markdown documents export to PDF and Word (DOCX) with math and "
            "diagrams rendered, or to PNG and SVG images. HTML documents export to PNG "
            "and SVG."
        ),
    },
    {
        "question": "How is it different from Obsidian or VS Code?",
        "answer": (
            "BugText has no vault format or plugin system to learn: it opens plain "
            "folders. Unlike VS Code it is built around reading and writing documents, "
            "with a rendered preview, a PDF reader and editor, and document export in "
            "the box. It does not have VS Code's extension ecosystem or Obsidian's "
            "linked-note graph."
        ),
    },
    {
        "question": "Which AI tools does it work with?",
        "answer": (
            "BugText detects Claude Code, Codex CLI and Pi installed on your Mac. It "
            "can also connect to Anthropic, OpenAI, OpenRouter, or any OpenAI- or "
            "Anthropic-compatible server, including local models in Ollama, LM Studio "
            "and MLX. Each AI feature can use a different engine, and each can be "
            "turned off."
        ),
    },
    {
        "question": "Can terminal agents read my notes?",
        "answer": (
            "Yes, if you turn it on. BugText includes an MCP server that lets Claude "
            "Code and Codex list, search, read, update and create notes in the folders "
            "open in the app. It is off by default, is limited to open folders, and "
            "takes a snapshot before every edit so you can undo it."
        ),
    },
    {
        "question": "How do I report a bug or ask for a feature?",
        "answer": (
            "Open an issue at github.com/kael-wanderer/BugText/issues. Include your "
            "macOS version, the BugText version from Settings ▸ General, and the steps "
            "that cause the problem."
        ),
    },
]

release = {
    "version": "0.3.0",
    "whats_new": [
        "New name: mdFlow is now BugText, with a new icon. Settings, recent files and saved API keys from mdFlow do not carry over.",
        "Settings: a full-window Settings screen (⌘,) with search and General, Editing, Theme, Shortcuts and AI pages.",
        "AI engines: pick Claude Code, Codex CLI, Pi or an API connection, with its model and effort, for Chat and each quick action.",
        "Safer agents: coding agents run in a macOS sandbox limited to the open folder, and BugText lists every file they changed.",
        "MCP server: Claude Code and Codex can search, read and edit your open notes. Off by default; each edit is snapshotted first.",
        "Also new since 0.2.7: SQL highlighting, drag files between folders, interactive HTML previews and offline PDF OCR.",
        "Fixed: files reload when changed elsewhere, settings sync across windows, and a restored pane no longer shows a PDF over its tab.",
        "Removed: Excalidraw boards. .excalidraw files now open as plain JSON text; open them in BugMind to keep drawing.",
        "Removed: jsMind mind maps. .mind files stay on disk and open as plain JSON text; no BugText or BugMind importer reads them.",
        "Removed: the Agent Console and built-in terminal. Run Claude Code, Codex or Pi in your own terminal app.",
    ],
}

questions = [
    "This page describes the current main branch. Several described features (rename, "
    "Settings screen, per-feature AI engines, sandboxed agents, MCP server) ship only "
    "once that release is published. Confirm the page goes live with it.",
    "Platforms: CI also builds Windows (.exe/.msi) and Linux (.deb/.rpm/.AppImage) "
    "installers, but the app is macOS-focused (Keychain, Seatbelt sandbox, Dock icon). "
    "Should the page list Windows and Linux, and are they tested?",
    "Minimum macOS version: the bundle inherits Tauri's default (10.13) and no "
    "minimum is set or tested. What should the requirements line state?",
    "Signing: the build is ad hoc signed and not notarized, so the FAQ mentions the "
    "Gatekeeper prompt. Confirm, or tell me if Developer ID signing is planned.",
    "Download link: should the page point to GitHub releases, or will kael.io.vn host "
    "the .dmg?",
    "Category: I used Productivity. The admin's category list was not available to me.",
    "Accent colour: #2F5BD3 is the icon's blue background. The in-app accent is "
    "amber #B9762A. Pick one.",
    "AI chat replies show raw Markdown (## and **) instead of formatted text, visible "
    "in 06-ai-chat.png. Fine to show, or fix before the screenshots are used?",
    "The roadmap still lists a removed Agent Console/Terminal and the README describes "
    "a Terminal tab and HTML/JPG export that no longer exist. I described the code, "
    "not those docs.",
]

LIMITS = {
    "summary": 200,
    "requirements": 80,
    "kicker": 40,
    "title": 70,
    "description": 320,
    "bullet": 120,
    "tile_title": 40,
    "tile_caption": 120,
    "card_title": 40,
    "card_text": 200,
    "question": 120,
    "answer": 600,
    "label": 60,
}


def check() -> list[str]:
    errors: list[str] = []

    def limit(path: str, text: str, key: str) -> None:
        if len(text) > LIMITS[key]:
            errors.append(f"{path}: {len(text)} > {LIMITS[key]}")

    limit("summary", catalog["summary"], "summary")
    limit("requirements", catalog["requirements"], "requirements")
    if not 300 <= len(catalog["details"]) <= 600:
        errors.append(f"details: {len(catalog['details'])} not in 300-600")
    if not 3 <= len(catalog["tags"].split(",")) <= 6:
        errors.append("tags: need 3-6")
    if not 6 <= len(screenshots) <= 10:
        errors.append("screenshots: need 6-10")
    for name, label in screenshots:
        limit(f"label {name}", label, "label")
        path = SHOTS / name
        if not path.exists():
            errors.append(f"missing screenshot {name}")
        elif path.stat().st_size >= 12 * 1024 * 1024:
            errors.append(f"{name} is 12 MB or larger")
    if not 3 <= len(features) <= 6:
        errors.append("features: need 3-6 sections")
    for i, f in enumerate(features, 1):
        p = f"section {i}"
        if f["background"] not in ("plain", "tint", "dark"):
            errors.append(f"{p}: bad background")
        if i > 1 and f["background"] == features[i - 2]["background"]:
            errors.append(f"{p}: background repeats previous section")
        for key in ("kicker", "title", "description"):
            limit(f"{p} {key}", f[key], key)
        if f["layout"] == "split":
            if len(f["bullets"]) > 5:
                errors.append(f"{p}: more than 5 bullets")
            for j, b in enumerate(f["bullets"], 1):
                limit(f"{p} bullet {j}", b, "bullet")
            if not 1 <= len(f["media"]["pictures"]) <= 2:
                errors.append(f"{p}: needs 1-2 pictures")
            for pic in f["media"]["pictures"]:
                if not (SHOTS / pic).exists():
                    errors.append(f"{p}: missing {pic}")
        elif f["layout"] == "showcase":
            if not 2 <= len(f["tiles"]) <= 4:
                errors.append(f"{p}: needs 2-4 tiles")
            for j, t in enumerate(f["tiles"], 1):
                limit(f"{p} tile {j} title", t["title"], "tile_title")
                limit(f"{p} tile {j} caption", t["caption"], "tile_caption")
                if not (SHOTS / t["picture"]).exists():
                    errors.append(f"{p}: missing {t['picture']}")
        elif f["layout"] == "cards":
            if not 2 <= len(f["cards"]) <= 6:
                errors.append(f"{p}: needs 2-6 cards")
            for j, c in enumerate(f["cards"], 1):
                limit(f"{p} card {j} title", c["title"], "card_title")
                limit(f"{p} card {j} text", c["text"], "card_text")
        else:
            errors.append(f"{p}: unknown layout")
    split_sides = [f["side"] for f in features if f["layout"] == "split"]
    if any(a == b for a, b in zip(split_sides, split_sides[1:])):
        errors.append("split sections must alternate sides")
    if not 6 <= len(faq) <= 12:
        errors.append("faq: need 6-12 items")
    for j, q in enumerate(faq, 1):
        limit(f"faq {j} question", q["question"], "question")
        limit(f"faq {j} answer", q["answer"], "answer")
    if not 6 <= len(release["whats_new"]) <= 10:
        errors.append("release: need 6-10 lines")
    for j, b in enumerate(release["whats_new"], 1):
        if len(b) + 2 > 140:
            errors.append(f"release line {j}: {len(b) + 2} > 140")
    banned = ("revolutionary", "seamless", "supercharge")
    blob = json.dumps([catalog, features, faq, release, screenshots]).lower()
    errors += [f"banned word: {w}" for w in banned if w in blob]
    return errors


def n(text: str, cap: int | None = None) -> str:
    return f"({len(text)}/{cap})" if cap else f"({len(text)})"


def markdown() -> str:
    c = catalog
    out = [
        "# BugText — product page copy",
        "",
        "Generated by `site-content/build_page.py`; edit that file and rerun it.",
        "Counts in brackets are characters / admin limit.",
        "",
        "## Screenshots",
        "",
        "Window-only captures, 2880×1800 px (1440×900 pt at 2×), PNG, in `screenshots/`.",
        "",
        "| File | Label |",
        "|---|---|",
    ]
    out += [f"| `{f}` | {lbl} {n(lbl, 60)} |" for f, lbl in screenshots]
    out += [
        "",
        "No screen recording was made (optional).",
        "",
        "## Catalog fields",
        "",
        f"- **Name:** {c['name']}",
        f"- **Pronunciation:** {c['pronunciation']}",
        f"- **Summary / tagline** {n(c['summary'], 200)}: {c['summary']}",
        f"- **Details** {n(c['details'])}, target 300–600: {c['details']}",
        f"- **Category:** {c['category']}",
        f"- **Tags:** {c['tags']}",
        f"- **Platform / OS:** {c['platform']}",
        f"- **License:** {c['license']}",
        f"- **Requirements** {n(c['requirements'], 80)}: {c['requirements']}",
        f"- **Accent colour:** `{c['accent']}` (icon background blue)",
        "",
        "## Feature sections",
        "",
    ]
    for i, f in enumerate(features, 1):
        out += [
            f"### {i}. {f['kicker']}",
            "",
            f"- **Layout:** {f['layout']}",
            f"- **Background:** {f['background']}",
            f"- **Kicker** {n(f['kicker'], 40)}: {f['kicker']}",
            f"- **Title** {n(f['title'], 70)}: {f['title']}",
            f"- **Description** {n(f['description'], 320)}: {f['description']}",
        ]
        if f["layout"] == "split":
            out.append(f"- **Side:** {f['side']}")
            out.append(f"- **Media:** {', '.join(f['media']['pictures'])}")
            out.append("- **Bullets:**")
            out += [f"  - {b} {n(b, 120)}" for b in f["bullets"]]
        elif f["layout"] == "showcase":
            out.append("- **Tiles:**")
            for t in f["tiles"]:
                out.append(
                    f"  - **{t['title']}** {n(t['title'], 40)} — {t['caption']} "
                    f"{n(t['caption'], 120)} — `{t['picture']}`"
                )
        else:
            out.append(f"- **Numbered:** {'yes' if f['numbered'] else 'no'}")
            out.append("- **Cards:**")
            for t in f["cards"]:
                out.append(
                    f"  - **{t['title']}** {n(t['title'], 40)} — {t['text']} {n(t['text'], 200)}"
                )
        out.append("")
    out += ["## FAQ", ""]
    for j, q in enumerate(faq, 1):
        out += [
            f"**{j}. {q['question']}** {n(q['question'], 120)}",
            "",
            f"{q['answer']} {n(q['answer'], 600)}",
            "",
        ]
    out += [
        "## Release note",
        "",
        f"**Version:** {release['version']}",
        "",
        "What's new:",
        "",
    ]
    out += [f"- {b}" for b in release["whats_new"]]
    out += ["", "## Questions for owner", ""]
    out += [f"{i}. {q}" for i, q in enumerate(questions, 1)]
    out.append("")
    return "\n".join(out)


def sections_json() -> dict:
    return {"requirements": catalog["requirements"], "features": features, "faq": faq}


if __name__ == "__main__":
    problems = check()
    if problems:
        print("Limit check FAILED:")
        print("\n".join(f"  - {p}" for p in problems))
        sys.exit(1)
    (HERE / "BugText-page.md").write_text(markdown(), encoding="utf-8")
    (HERE / "BugText-sections.json").write_text(
        json.dumps(sections_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("All limits pass. Wrote BugText-page.md and BugText-sections.json.")
