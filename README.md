# Smart Feather

All along, I've been looking for the "best" mail client for me, someone who works across Windows, Linux desktop and Mac. The alternatives I tried didn't stay, each for its own reason, and I found myself back on Thunderbird, by way of its fork Betterbird. This add-on is meant to be as thin as possible and let models be the smart part. All UI is AI generated, as UI design has been one of my area to improve. The name `Smart Feather` means this add-on is intended to make your email client smarter while getting along with others "feathers".

Thanks to the help of AI and inspiring conversations with group members, I'm now making it my own. Feel free to try it if it helps, and don't complain if it doesn't.

## What it does

An add-on for [Betterbird](https://www.betterbird.eu/) 153 ESR with extra features:

- **Hover toolbar:** reply, reply all, archive, delete, AI Summary and More like this at the right edge of each message in the list.
- **Document-style writing:** Normal text and Heading 1–3, Enter for a paragraph, Shift+Enter for a line break, and one-click highlight (Ctrl+Alt+H). Ctrl+Alt+0–3 switch styles.
- **AI Writing Assistant:** suggests a revision of a new letter, or drafts a reply from the message you're answering. You edit the suggestion before it goes into your letter.
- **AI Summary:** summarizes a message in a small window, from the hover toolbar or the button on the message.
- **Semantic Search:** finds mail by meaning across languages as well as by exact words, including Chinese words inside longer text.

## AI Writing Assistant

The AI Writing Assistant works with any OpenAI-compatible server, local or remote, and stays off until you set one up in the add-on's Options tab. Enter the server address, API key if needed, and model, then use **Test connection**. The AI Writing Assistant and AI Summary share these settings, and each kind of request has its own prompt you can edit there.

In the compose window, click **AI Writing Assistant**. If you've selected text, only that part is revised. In a reply, anything you've written above or below the quote is used as notes for the draft. It also checks the subject once the letter is written, and offers a new one if the letter has none or has moved to another topic. Replies stay in their thread when the subject changes.

AI Summary is on the hover toolbar and on the message itself. Some add-ons, such as NovaBird-Conversation, hide the message's button; the hover toolbar still works. Long messages are cut off at 12,000 characters before they're sent.

Text is sent only when you click AI Summary or a button in the AI Writing Assistant window, and only to the server you chose. That means a remote server receives your letter, or the message you're replying to or summarizing. The API key is stored unencrypted in your Betterbird profile.

## Semantic Search

Semantic Search finds mail by meaning, so a Chinese question can find an English letter. It stays off until you set it up, and it needs an embedding server with an OpenAI-compatible `/embeddings` address.

### Set it up

1. Start an embedding server. For example, with llama.cpp and the model file from [ggml-org/bge-m3-Q8_0-GGUF](https://huggingface.co/ggml-org/bge-m3-Q8_0-GGUF):

   ```bash
   llama-server -m bge-m3-q8_0.gguf --embedding -c 16384 -b 8192 -ub 8192 -np 2 -ngl 99 --port 9933
   ```

2. In the add-on's Options tab, under Semantic Search, enter the server address, such as `http://127.0.0.1:9933/v1`, and the embedding model, such as `bge-m3`. Use **Test connection** to check them.
3. Choose a time window and click **Start indexing**.

Newest mail is indexed first, and indexing continues after a restart until you click **Pause**. New mail is added every 15 minutes while the server is running. Changing the time window, or removing mail from the index, takes effect the next time Betterbird starts or you click **Start indexing**.

### Search

Open the search window with the **Semantic Search** button in the toolbar or Alt+Shift+F, type a few words or a question, and press Enter. Clicking a result opens the message in a tab. Each result says how it was found:

- **meaning:** among the 30 messages closest in meaning. There's no minimum score, so the last few may be only loosely related.
- **exact words:** contains every word you typed. This works for names, numbers and Chinese words inside longer text.

Messages found both ways rank highest. If the server is off, exact word search still works on what's already indexed.

### More like this

**More like this** on the hover toolbar searches from a message, and remembers your last choice:

- **Same sender and similar subject:** mail from that address, closest in meaning first.
- **Same sender:** mail from that address, newest first.
- **Similar subject:** mail from anyone. Identical subjects come first, ignoring `Re:` and `Fwd:`, then the closest in meaning. The subject is compared with the subject and text of each message, so a match can come from the body.

It looks only through indexed mail, and shows up to 30 results. Similar subject sends the message's subject to the server.

### Privacy

Indexing sends the text of your mail in the time window to the server, and each search sends your words there too. Trash, junk, drafts and templates are left out, along with quoted lines and links. Use a server you trust. Up to 12,000 characters of each message stay in your Betterbird profile for exact word search, with the first 5,550 or so used for meaning. Changing the embedding model rebuilds the index, and **Delete index** removes it.

## Test Env
- FileLink Provider for Dropbox (v7)
- Filter on Folder Button (v1.6.2)
- [NovaBird](https://github.com/Novabird-Addons/NovaBird)
- Signature Switch (v2.20.2)
- XNote++ (v4.10.31)

## Install

Download the `.xpi` from the [latest release](https://github.com/ymxlin/smart-feather/releases/latest), then in Betterbird go to Add-ons Manager → gear icon → Install Add-on From File.

The add-on asks for full access because it changes Betterbird's own windows.

## Updates

Betterbird handles updates: it checks the releases in this repository once a day and installs new versions by itself.

- **Turn automatic updates off:** set "Allow Automatic Updates" to Off on the add-on's page in the Add-ons Manager.
- **Update now:** use the gear icon → Check for Updates.
- **Change how often:** set `extensions.update.interval` (in seconds) in the Config Editor. This applies to all add-ons.

## Version history

| Version | Date | Changes |
| --- | --- | --- |
| 0.4.0 | 2026-10-31 | Added Semantic Search, with an embedding server setting, a time window, and search by meaning and exact words. Added More like this to the hover toolbar. |
| 0.3.1 | 2026-10-30 | The AI Writing Assistant suggests a subject when a letter has none or has moved to another topic. The subject prompt can be edited in Options. |
| 0.3.0 | 2026-10-30 | Added the AI Writing Assistant for revising letters and drafting replies, AI Summary with Markdown formatting, and an Options page for an OpenAI-compatible server, with prompts and Test connection. |
| 0.2.3 | 2026-10-30 | The update address now comes from the GitHub repository, so template copies watch their own releases. |
| 0.2.2 | 2026-10-30 | First public release: hover toolbar, document-style writing and automatic updates. |

## Release

Bump `version` in `manifest.json`, commit and push, then run `release.ps1`. It builds the add-on and publishes a release with the `.xpi` and `updates.json`. It needs PowerShell 7 and the GitHub CLI, signed in.

## Make your own copy

This repository is a template, so the updater comes with it:

1. Click **Use this template**. The new repository must be public, because Betterbird can't sign in to download from a private one.
2. Clone it and run `release.ps1`.
3. Install the `.xpi` from your release by hand once.

The build reads the update address from the repository's GitHub remote, so your copy watches only your releases and gets its own add-on ID. It never checks this repository.
