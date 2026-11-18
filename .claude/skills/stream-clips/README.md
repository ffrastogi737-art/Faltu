# Stream Clips: a free AI clipping skill

Give it a topic ("GTA 6", "Valorant", "Fortnite", "chess", a podcast...) or a few stream links.
It finds the biggest streams, listens to every minute, and an AI picks the moments most likely
to go viral. You get ready-to-post vertical clips: facecam on top, gameplay below, a title bar,
word-by-word captions, plus a caption and hashtags for each clip.

- **Any topic, any game.** You tell it what to look for.
- **Free.** Speech-to-text (Whisper) runs on your computer. The moments are picked by the AI
  app you already pay for (Claude Code, ChatGPT's Codex, Gemini CLI or OpenCode). No API keys,
  no credits.
- **Light on disk.** It downloads the stream's audio, plus video only for the clips.
- **macOS and Windows.**

## What you need

- One of: **Claude Code**, **Codex** (comes with ChatGPT plans), **Gemini CLI** (free with a
  Google account) or **OpenCode**. The ChatGPT and Gemini *chat* apps can't run programs on your
  computer, so use Codex or Gemini CLI.
- **ffmpeg** and **deno** (or Node.js):
  - macOS: `brew install ffmpeg deno`
  - Windows: `winget install Gyan.FFmpeg` and `winget install DenoLand.Deno`
- **Python 3.9 or newer** (Windows: `winget install Python.Python.3.12`)
- About 1 GB of free disk space

## Install

Download the zip (don't unzip it). Open your AI coding app in a new session and paste this:

> Install the skill in stream-clips.zip from my Downloads folder. Unzip it so the folder
> `stream-clips` sits in my skills folder: `~/.claude/skills/` for Claude Code,
> `~/.codex/skills/` for Codex, `~/.gemini/skills/` for Gemini CLI, `~/.config/opencode/skills/`
> for OpenCode. If my app has no skills folder, put it in my home folder. Then read SKILL.md
> inside it, run its setup until it prints READY (install anything it says is missing, the
> official way), and run `find --topic "GTA 6"` and tell me what it found.

Then just ask, for example:

- *"Find today's biggest Valorant streams and make 3 clips from each."*
- *"Clip this stream: <link>. Focus on the funniest moments."*
- *"Make clips from the last 2 hours of this live GTA 6 stream."*

## Good to know

- Age-restricted YouTube streams, Kick and sub-only Twitch VODs need your browser login. Your AI
  will add `--cookies chrome`.
- Put the streamers you clip for in `~/StreamClips/watchlist.txt` (e.g. `twitch:tarik`).
- Watch each clip before posting. Only clip creators who allow clipping; many big streamers run
  paid clipping programs.

Files: `SKILL.md` (instructions the AI follows) · `scripts/streamclips.py` (the command) ·
`scripts/setup_env.py` · `scripts/sc/` (find, download, listen, pick, frame, captions, title, render)
· `watchlist.txt` (template).
