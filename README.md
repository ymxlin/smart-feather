# Smart Feather

An add-on for [Betterbird](https://www.betterbird.eu/) 153 ESR with extra features:

- **Hover toolbar:** reply, reply all, archive and delete at the right edge of each message in the list.
- **Document-style writing:** Normal text and Heading 1–3, Enter for a paragraph, Shift+Enter for a line break, and one-click highlight (Ctrl+Alt+H). Ctrl+Alt+0–3 switch styles.

## Install

Download the `.xpi` from the [latest release](https://github.com/ymxlin/smart-feather/releases/latest), then in Betterbird go to Add-ons Manager → gear icon → Install Add-on From File.

The add-on asks for full access because it changes Betterbird's own windows. Installed copies update themselves from the releases in this repository.

## Release

Bump `version` in `manifest.json`, then run `release.ps1`. It builds the add-on and publishes a release with the `.xpi` and `updates.json`. It needs the GitHub CLI, signed in.
