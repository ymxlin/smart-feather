# Smart Feather

An add-on for [Betterbird](https://www.betterbird.eu/) 153 ESR with extra features:

- **Hover toolbar:** reply, reply all, archive and delete at the right edge of each message in the list.
- **Document-style writing:** Normal text and Heading 1–3, Enter for a paragraph, Shift+Enter for a line break, and one-click highlight (Ctrl+Alt+H). Ctrl+Alt+0–3 switch styles.

## Install

Download the `.xpi` from the [latest release](https://github.com/ymxlin/smart-feather/releases/latest), then in Betterbird go to Add-ons Manager → gear icon → Install Add-on From File.

The add-on asks for full access because it changes Betterbird's own windows.

## Updates

Betterbird handles updates: it checks the releases in this repository once a day and installs new versions by itself.

- **Turn automatic updates off:** set "Allow Automatic Updates" to Off on the add-on's page in the Add-ons Manager.
- **Update now:** use the gear icon → Check for Updates.
- **Change how often:** set `extensions.update.interval` (in seconds) in the Config Editor. This applies to all add-ons.

## Release

Bump `version` in `manifest.json`, commit and push, then run `release.ps1`. It builds the add-on and publishes a release with the `.xpi` and `updates.json`. It needs PowerShell 7 and the GitHub CLI, signed in.

## Make your own copy

This repository is a template, so the updater comes with it:

1. Click **Use this template**. The new repository must be public, because Betterbird can't sign in to download from a private one.
2. Clone it and run `release.ps1`.
3. Install the `.xpi` from your release by hand once.

The build reads the update address from the repository's GitHub remote, so your copy watches only your releases and gets its own add-on ID. It never checks this repository.
