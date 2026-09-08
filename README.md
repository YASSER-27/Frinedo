# Frinedo

Frinedo is an offline desktop Minecraft companion project built with Electron, React, TypeScript, Mineflayer, and optional local Supertonic TTS. It is made for enjoying Minecraft with bot friends that can follow you, protect you, gather resources, craft tools, explore the world, and help you learn the game.

Version: **0.1.4**

Author: **YASSER-27**

GitHub: https://github.com/YASSER-27

## Project Idea

Frinedo is designed for offline Minecraft play with bot friends. You can play normally while one or more companion bots join your LAN world, respond to commands, help with early-game tasks, and make the world feel more alive without requiring an online AI service.

## Features

- Connect an offline-mode Mineflayer bot to a Minecraft LAN server.
- Control up to four bot players from Settings.
- Address bots with `bot1`, `bot2`, `bot3`, `bot4`, or their configured names.
- Use commands for following, guarding, collecting, crafting, searching, farming, fishing, sleeping, escaping, attacking, taming, and beginner guidance.
- Browse the in-game command menu in pages of ten commands: `menu 1`, `menu 2`, and so on.
- Persistent chat history stored in `data/chat-history.json`.
- Local English and Arabic Supertonic voice assets with Female 1 and Male 2 variants during development.
- Optional Voice Help in English or Arabic during development.
- Built-in command audio previews from the Add Command panel.

## Requirements

- Windows 10 or later for the NSIS installer.
- Node.js 18 or newer.
- Python 3.11 recommended for local TTS development only.
- Minecraft Java Edition with Open to LAN enabled.
- A compatible local Supertonic model in `tts/onnx` and voice styles in `tts/voice_styles`.

## Development

Install JavaScript dependencies:

```bash
npm install
```

Start the development application:

```bash
npm run dev
```

Build the main process and renderer:

```bash
npm run build
```

Run the packaged application from the build output:

```bash
npm start
```

## Build the Windows Setup

Create the installer and unpacked distribution:

```bash
npm run dist
```

The NSIS installer is written to `release/`.

TTS model files are development-only and are intentionally excluded from the Setup to keep it small. Voice generation and Voice Help display a development-only message in the installed app.

## Minecraft Setup

1. Open a single-player world in Minecraft Java Edition.
2. Choose **Open to LAN**.
3. Enable cheats if you want clickable commands and command-related actions.
4. Note the LAN port shown by Minecraft.
5. Enter that exact same LAN port in the `Port` field in Frinedo Settings. The ports must match.
6. Enter the host, usually `127.0.0.1` for the local computer.
7. Set the primary bot name and optionally enable Bot 2, Bot 3, or Bot 4.
8. Save Settings and connect.

Minecraft must be running and the world must already be opened with **Open to LAN**. Frinedo cannot connect before the LAN world is active, and it will not connect if the Port in Settings is different from Minecraft's LAN Port.

Use `menu` in chat to open page one. Use `menu 2`, `menu 3`, or another page number for later commands. Type a page-local number to run a command. To target another bot, use for example:

```text
bot2 follow me
b3 find village
MyHelper bring me stone
```

## Adding a Command

For a new built-in command, update these files:

- `src/shared/parseCommand.ts`: recognize the phrase and create the intent.
- `src/shared/types.ts`: add a new `ActionType` when needed.
- `src/main/bot/commandEngine.ts`: connect the intent to execution.
- `src/main/bot/skills.ts`: implement the Minecraft behavior.
- `src/shared/parseCommand.ts` `EXAMPLE_TRIGGERS`: show the command in the UI and menu.

For built-in voice previews, add the phrase and slug to:

- `scripts/generate_builtin_voice_assets.py`
- `src/renderer/components/AddCommandModal.tsx` in `BUILTIN_SLUGS`
- `scripts/register_builtin_voice_commands.js`

Then generate and register the audio:

```bash
py -3 scripts/generate_builtin_voice_assets.py
node scripts/register_builtin_voice_commands.js
```

Only Start voice files are used for built-in commands. Done messages remain text-only so audio does not overlap.

## Project Data

- `data/commands.json`: saved commands and their voice mappings.
- `data/settings.json`: server, bot, and voice-help settings.
- `data/chat-history.json`: persistent chat history.
- `data/voices/`: generated and imported voice files.
- `tts/`: local Supertonic worker, model files, and voice styles.

## License

MIT
