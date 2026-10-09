import { ipcMain, BrowserWindow, app, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'crypto';
import { BotManager } from '../bot/botManager';
import { SupertonicBridge } from '../tts/supertonicBridge';
import {
  AppSettings,
  BotCommand,
  ChatMessage,
  IPC_CHANNELS,
  TtsGenerateRequest,
} from '../../shared/types';
import { parseChat } from '../../shared/parseCommand';

const DEFAULT_SETTINGS: AppSettings = {
  host: '127.0.0.1',
  port: 25565,
  username: 'SteveBot',
  version: '',
  muted: false,
  voiceHelpEnabled: false,
  voiceHelpVoice: 'M2',
  voiceHelpLanguage: 'en',
  botPlayers: ['', '', '', ''],
};

function resourceDataDir(): string {
  return path.join(process.resourcesPath ?? app.getAppPath(), 'data');
}

function userDataDir(): string {
  const dir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function dataDir(): string {
  return app.isPackaged ? userDataDir() : path.join(process.cwd(), 'data');
}

function commandsPath(): string {
  return path.join(userDataDir(), 'commands.json');
}

function deletedCommandsPath(): string {
  return path.join(userDataDir(), 'deleted-commands.json');
}

function readDeletedCommandIds(): Set<string> {
  try {
    if (!fs.existsSync(deletedCommandsPath())) return new Set();
    const ids = JSON.parse(fs.readFileSync(deletedCommandsPath(), 'utf-8')) as unknown;
    return new Set(Array.isArray(ids) ? ids.map((id) => String(id)) : []);
  } catch {
    return new Set();
  }
}

function writeDeletedCommandIds(ids: Set<string>): void {
  fs.mkdirSync(userDataDir(), { recursive: true });
  fs.writeFileSync(deletedCommandsPath(), JSON.stringify([...ids], null, 2), 'utf-8');
}

function voicesDir(): string {
  return path.join(userDataDir(), 'voices');
}

function bundledCommandsPath(): string {
  const baseDataDir = app.isPackaged
    ? resourceDataDir()
    : path.join(process.cwd(), 'data');
  return path.join(baseDataDir, 'commands.json');
}

function readCommands(): BotCommand[] {
  const deletedIds = readDeletedCommandIds();
  let bundledCommands: BotCommand[] = [];
  try {
    const bundled = bundledCommandsPath();
    if (fs.existsSync(bundled)) {
      bundledCommands = JSON.parse(fs.readFileSync(bundled, 'utf-8')) as BotCommand[];
      bundledCommands = bundledCommands.filter((command) => !deletedIds.has(command.id));
    }
  } catch {
    bundledCommands = [];
  }

  try {
    const file = commandsPath();
    if (fs.existsSync(file)) {
      const savedCommands = JSON.parse(fs.readFileSync(file, 'utf-8')) as BotCommand[];
      const activeSavedCommands = savedCommands.filter((command) => !deletedIds.has(command.id));
      const savedById = new Map(activeSavedCommands.map((command) => [command.id, command]));
      const merged = bundledCommands.map((command) => savedById.get(command.id) ?? command);
      const bundledIds = new Set(bundledCommands.map((command) => command.id));
      return [...merged, ...activeSavedCommands.filter((command) => !bundledIds.has(command.id))];
    }
  } catch {
    // Fall through to bundled default commands.
  }

  return bundledCommands;
}

function writeCommands(commands: BotCommand[]): void {
  fs.mkdirSync(userDataDir(), { recursive: true });
  fs.writeFileSync(commandsPath(), JSON.stringify(commands, null, 2), 'utf-8');
}

function readJsonFile<T>(relativePath: string, fallback: T): T {
  const userPath = path.join(userDataDir(), relativePath);
  if (fs.existsSync(userPath)) {
    try {
      return JSON.parse(fs.readFileSync(userPath, 'utf-8')) as T;
    } catch {
      return fallback;
    }
  }

  if (app.isPackaged) {
    const resourcePath = path.join(resourceDataDir(), relativePath);
    if (fs.existsSync(resourcePath)) {
      try {
        return JSON.parse(fs.readFileSync(resourcePath, 'utf-8')) as T;
      } catch {
        return fallback;
      }
    }
  }

  return fallback;
}

function readSettings(): AppSettings {
  const settings = readJsonFile<AppSettings>('settings.json', { ...DEFAULT_SETTINGS });
  return normalizeSettings({ ...DEFAULT_SETTINGS, ...settings });
}

function normalizeSettings(settings: AppSettings): AppSettings {
  const next: AppSettings = { ...DEFAULT_SETTINGS, ...settings };
  const seen = new Set<string>();
  next.botPlayers = Array.from({ length: 4 }, (_, index) => {
    const value = String(next.botPlayers?.[index] ?? '').trim();
    const normalized = value.toLowerCase();
    if (!value || normalized === String(next.username).trim().toLowerCase()) return '';
    if (seen.has(normalized)) return '';
    seen.add(normalized);
    return value;
  });
  return next;
}

function writeSettings(settings: AppSettings): void {
  fs.mkdirSync(userDataDir(), { recursive: true });
  fs.writeFileSync(path.join(userDataDir(), 'settings.json'), JSON.stringify(normalizeSettings(settings), null, 2), 'utf-8');
}

function chatHistoryPath(): string {
  return path.join(userDataDir(), 'chat-history.jsonl');
}

function legacyChatHistoryPath(): string {
  return path.join(userDataDir(), 'chat-history.json');
}

function readChatHistory(): ChatMessage[] {
  try {
    const file = chatHistoryPath();
    if (fs.existsSync(file)) {
      return fs.readFileSync(file, 'utf-8')
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as ChatMessage);
    }
    if (fs.existsSync(legacyChatHistoryPath())) {
      const legacy = JSON.parse(fs.readFileSync(legacyChatHistoryPath(), 'utf-8')) as ChatMessage[];
      return Array.isArray(legacy) ? legacy : [];
    }
    return [];
  } catch {
    return [];
  }
}

function appendChatMessage(message: ChatMessage): void {
  fs.mkdirSync(userDataDir(), { recursive: true });
  fs.appendFileSync(chatHistoryPath(), `${JSON.stringify(message)}\n`, 'utf-8');
}

export function registerIpcHandlers(
  botManager: BotManager,
  getMainWindow: () => BrowserWindow | null
): SupertonicBridge {
  const ttsBridge = new SupertonicBridge();
  const voiceHelpCache = new Map<string, string>();
  let voiceGenerationQueue = Promise.resolve();
  botManager.commandEngine.setCommands(readCommands());
  botManager.loadChatHistory(readChatHistory());
  const initialSettings = readSettings();
  botManager.setMuted(initialSettings.muted);
  botManager.setVoiceHelp(initialSettings.voiceHelpEnabled, initialSettings.voiceHelpVoice, initialSettings.voiceHelpLanguage);

  const sendToRenderer = (channel: string, ...args: unknown[]): void => {
    getMainWindow()?.webContents.send(channel, ...args);
  };

  botManager.on('statusChanged', (status, error) => {
    sendToRenderer(IPC_CHANNELS.BOT_STATUS_CHANGED, { status, error });
  });
  botManager.on('chatMessage', (message) => {
    appendChatMessage(message);
    sendToRenderer(IPC_CHANNELS.CHAT_MESSAGE, message);
  });
  botManager.on('playVoice', (audioPath: string) => {
    sendToRenderer(IPC_CHANNELS.TTS_PLAY, audioPath);
  });
  botManager.on('voiceHelp', (text: string, voice: string) => {
    // Runtime playback is offline-only. Supertonic is reserved for the manual developer generator.
    return;
    voiceGenerationQueue = voiceGenerationQueue.then(async () => {
    const cacheDir = path.join(userDataDir(), 'voices', 'voice-help-cache');
    fs.mkdirSync(cacheDir, { recursive: true });

    const hash = createHash('sha256').update(`${text}\u0000${voice}`).digest('hex').slice(0, 16);
    const outputPath = path.join(cacheDir, `${hash}-${voice}.wav`);
    const cacheKey = `${text}\u0000${voice}`;

    if (voiceHelpCache.has(cacheKey)) {
      sendToRenderer(IPC_CHANNELS.TTS_PLAY, voiceHelpCache.get(cacheKey) ?? outputPath);
      return;
    }

    if (fs.existsSync(outputPath)) {
      voiceHelpCache.set(cacheKey, outputPath);
      sendToRenderer(IPC_CHANNELS.TTS_PLAY, outputPath);
      return;
    }

    try {
      const result = await ttsBridge.generateSpeech({ text, voice, outputPath });
      if (result.success && result.outputPath) {
        voiceHelpCache.set(cacheKey, result.outputPath);
        sendToRenderer(IPC_CHANNELS.TTS_PLAY, result.outputPath);
      } else {
        sendToRenderer(IPC_CHANNELS.CHAT_MESSAGE, {
          id: `voice-error-${Date.now()}`,
          timestamp: Date.now(),
          sender: 'System',
          text: `Voice help failed: ${result.error ?? 'unknown TTS error'}`,
          isBot: false,
        });
      }
    } catch (error) {
      sendToRenderer(IPC_CHANNELS.CHAT_MESSAGE, {
        id: `voice-error-${Date.now()}`,
        timestamp: Date.now(),
        sender: 'System',
        text: `Voice help failed: ${error instanceof Error ? error.message : String(error)}`,
        isBot: false,
      });
    }
    }).catch((error) => {
      sendToRenderer(IPC_CHANNELS.CHAT_MESSAGE, {
        id: `voice-error-${Date.now()}`,
        timestamp: Date.now(),
        sender: 'System',
        text: `Voice help failed: ${error instanceof Error ? error.message : String(error)}`,
        isBot: false,
      });
    });
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => readSettings());

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SAVE, (_event, newSettings: AppSettings) => {
    writeSettings(newSettings);
    botManager.setMuted(newSettings.muted);
    botManager.setVoiceHelp(newSettings.voiceHelpEnabled, newSettings.voiceHelpVoice, newSettings.voiceHelpLanguage);
    return readSettings();
  });

  ipcMain.handle(IPC_CHANNELS.BOT_CONNECT, async (_event, partial?: Partial<AppSettings>) => {
    const merged = { ...readSettings(), ...partial };
    writeSettings(merged);
    try {
      await botManager.connect({
        host: merged.host,
        port: merged.port,
        username: merged.username,
        version: merged.version,
        botPlayers: merged.botPlayers,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|connect/i.test(detail)) {
        throw new Error(`Minecraft server is unreachable at ${merged.host}:${merged.port}. Check that the game is running and that this port is open.`);
      }
      throw error;
    }
    return botManager.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.BOT_DISCONNECT, async () => {
    await botManager.disconnect();
    return botManager.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.BOT_RUN_COMMAND, async (_event, payload?: { message?: string; username?: string }) => {
    const message = String(payload?.message ?? '').trim();
    if (!message) return false;
    const username = String(payload?.username ?? '').trim() || botManager.getBotUsername();
    await botManager.processCommand(username, message);
    return true;
  });

  ipcMain.handle('bot:set-skin', async (_event, payload?: { skinId?: string; target?: string }) => {
    const skinId = String(payload?.skinId ?? '').trim();
    const target = String(payload?.target ?? '').trim();
    if (!skinId || !['bot1', 'bot2', 'bot3', 'bot4', 'user'].includes(target)) {
      return { success: false, error: 'Invalid skin selection.' };
    }
    return botManager.setSkin(target as 'bot1' | 'bot2' | 'bot3' | 'bot4' | 'user', skinId);
  });

  ipcMain.handle(IPC_CHANNELS.BOT_STATUS, () => ({
    status: botManager.getStatus(),
    history: botManager.getChatHistory(),
  }));

  ipcMain.handle(IPC_CHANNELS.CHAT_HISTORY, () => botManager.getChatHistory());

  ipcMain.handle(IPC_CHANNELS.COMMANDS_GET, () => botManager.commandEngine.getCommands());

  ipcMain.handle(IPC_CHANNELS.COMMANDS_ADD, (_event, command: BotCommand) => {
    const deletedIds = readDeletedCommandIds();
    deletedIds.delete(command.id);
    writeDeletedCommandIds(deletedIds);
    const list = readCommands();
    list.push(command);
    writeCommands(list);
    botManager.commandEngine.setCommands(list);
    void botManager.publishMenu();
    return list;
  });

  ipcMain.handle(IPC_CHANNELS.COMMANDS_REMOVE, (_event, commandId: string) => {
    const deletedIds = readDeletedCommandIds();
    deletedIds.add(commandId);
    writeDeletedCommandIds(deletedIds);
    const list = readCommands().filter((c) => c.id !== commandId);
    writeCommands(list);
    botManager.commandEngine.setCommands(list);
    void botManager.publishMenu();
    return list;
  });

  ipcMain.handle(IPC_CHANNELS.BOT_TEST_MATCH, (_event, message: string) => {
    const { saved, intent } = botManager.commandEngine.resolve(message);
    const parsed = intent ?? parseChat(message);
    if (!parsed && !saved) return { matched: false };
    return {
      matched: true,
      label: parsed?.label ?? saved?.actionType,
      startText: parsed?.startText,
      doneText: parsed?.doneText,
    };
  });

  ipcMain.handle(IPC_CHANNELS.TTS_GENERATE, async (_event, request: TtsGenerateRequest) => {
    if (app.isPackaged) {
      return { success: false, error: 'Voice generation is available only during development.' };
    }
    fs.mkdirSync(voicesDir(), { recursive: true });
    const filename = request.filename ?? `voice-${Date.now()}.wav`;
    const dest = path.join(voicesDir(), filename);
    const result = await ttsBridge.generateSpeech({ ...request, outputPath: dest });
    if (result.success && result.outputPath) {
      const buf = fs.readFileSync(result.outputPath);
      return {
        ...result,
        dataUrl: `data:audio/wav;base64,${buf.toString('base64')}`,
      };
    }
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.TTS_CANCEL, () => {
    ttsBridge.cancelGeneration();
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.TTS_BUILTIN_READ, (_event, request: { slug?: string; language?: string; voice?: string }) => {
    const slug = String(request?.slug ?? '').replace(/[^a-z0-9-]/gi, '');
    const language = request?.language === 'ar' ? 'ar' : 'en';
    const voice = request?.voice === 'M2' ? 'M2' : 'F1';
    const builtinsRoot = app.isPackaged
      ? path.join(resourceDataDir(), 'voices', 'builtin')
      : path.join(dataDir(), 'voices', 'builtin');
    const file = path.join(builtinsRoot, language, voice, `${slug}-start.wav`);
    if (!slug || !fs.existsSync(file)) return null;
    const buf = fs.readFileSync(file);
    return `data:audio/wav;base64,${buf.toString('base64')}`;
  });

  ipcMain.handle(IPC_CHANNELS.TTS_IMPORT, async () => {
    const picked = await dialog.showOpenDialog({
      title: 'Import voice file',
      filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg'] }],
      properties: ['openFile'],
    });
    if (picked.canceled || picked.filePaths.length === 0) return null;
    fs.mkdirSync(voicesDir(), { recursive: true });
    const src = picked.filePaths[0];
    const ext = path.extname(src);
    const dest = path.join(voicesDir(), `import-${Date.now()}${ext}`);
    fs.copyFileSync(src, dest);
    const buf = fs.readFileSync(dest);
    const mime = ext === '.mp3' ? 'audio/mpeg' : ext === '.ogg' ? 'audio/ogg' : 'audio/wav';
    return { path: dest, dataUrl: `data:${mime};base64,${buf.toString('base64')}` };
  });

  ipcMain.handle(IPC_CHANNELS.AUDIO_READ, (_event, filePath: string) => {
    if (!filePath) return null;
    const candidates = [
      filePath,
      path.join(process.cwd(), filePath),
      path.join(app.getAppPath(), filePath),
      path.join(app.getAppPath(), 'data', filePath.replace(/^data[\\/]/, '')),
      path.join(resourceDataDir(), filePath.replace(/^data[\\/]/, '')),
      path.join(resourceDataDir(), 'voices', path.basename(filePath)),
    ];
    const resolved = candidates.find((candidate) => fs.existsSync(candidate));
    if (!resolved) return null;
    const buf = fs.readFileSync(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const mime = ext === '.mp3' ? 'audio/mpeg' : ext === '.ogg' ? 'audio/ogg' : 'audio/wav';
    return `data:${mime};base64,${buf.toString('base64')}`;
  });

  ipcMain.handle(IPC_CHANNELS.CHAT_CLEAR, () => {
    const history = botManager.clearChat();
    try {
      fs.unlinkSync(chatHistoryPath());
    } catch {
      // The history may already be empty.
    }
    try {
      fs.unlinkSync(legacyChatHistoryPath());
    } catch {
      // Ignore a missing legacy history file.
    }
    return history;
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, () => {
    getMainWindow()?.close();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    getMainWindow()?.minimize();
  });

  ipcMain.handle(IPC_CHANNELS.MENU_PUSH, async () => {
    await botManager.publishMenu();
    return true;
  });

  return ttsBridge;
}
