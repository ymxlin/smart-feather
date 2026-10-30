# Smart Feather

All along, I've been looking for the "best" mail client for me, someone who works across Windows, Linux desktop and Mac. The alternatives I tried didn't stay, each for its own reason, and I found myself back on Thunderbird, by way of its fork Betterbird.

Thanks to the help of AI and inspiring conversations with group members, I'm now making it my own. Feel free to try it if it helps, and don't complain if it doesn't.

## What it does

An add-on for [Betterbird](https://www.betterbird.eu/) 153 ESR with extra features:

- **Hover toolbar:** reply, reply all, archive, delete and AI Summary at the right edge of each message in the list.
- **Document-style writing:** Normal text and Heading 1–3, Enter for a paragraph, Shift+Enter for a line break, and one-click highlight (Ctrl+Alt+H). Ctrl+Alt+0–3 switch styles.
- **AI help:** suggests a revision of a new letter, or drafts a reply from the message you're answering. You edit the suggestion before it goes into your letter.
- **AI Summary:** summarizes a message in a small window, from the hover toolbar or the button on the message.

## AI help

AI help works with any OpenAI-compatible server, local or remote, and stays off until you set one up in the add-on's Options tab. Enter the server address, API key if needed, and model, then use **Test connection**. AI help and AI Summary share these settings, and each kind of request has its own prompt you can edit there.

In the compose window, click **AI help**. If you've selected text, only that part is revised. In a reply, anything you've written above or below the quote is used as notes for the draft.

AI Summary is on the hover toolbar and on the message itself. Some add-ons, such as NovaBird-Conversation, hide the message's button; the hover toolbar still works. Long messages are cut off at 12,000 characters before they're sent.

Text is sent only when you click AI Summary or a button in the AI help window, and only to the server you chose. That means a remote server receives your letter, or the message you're replying to or summarizing. The API key is stored unencrypted in your Betterbird profile.

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
