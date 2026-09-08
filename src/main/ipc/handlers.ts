import { ipcMain, BrowserWindow, app, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
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
  botPlayers: ['SteveBot'],
};

function dataDir(): string {
  if (app.isPackaged) {
    return path.join(path.dirname(app.getPath('exe')), 'data');
  }
  return path.join(process.cwd(), 'data');
}

function commandsPath(): string {
  return path.join(dataDir(), 'commands.json');
}

function voicesDir(): string {
  return path.join(dataDir(), 'voices');
}

function readCommands(): BotCommand[] {
  try {
    const file = commandsPath();
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as BotCommand[];
  } catch {
    return [];
  }
}

function writeCommands(commands: BotCommand[]): void {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(commandsPath(), JSON.stringify(commands, null, 2), 'utf-8');
}

function readSettings(): AppSettings {
  const file = path.join(dataDir(), 'settings.json');
  try {
    if (!fs.existsSync(file)) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(file, 'utf-8')) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(settings: AppSettings): void {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(path.join(dataDir(), 'settings.json'), JSON.stringify(settings, null, 2), 'utf-8');
}

function chatHistoryPath(): string {
  return path.join(dataDir(), 'chat-history.json');
}

function readChatHistory(): ChatMessage[] {
  try {
    const file = chatHistoryPath();
    if (!fs.existsSync(file)) return [];
    const history = JSON.parse(fs.readFileSync(file, 'utf-8')) as ChatMessage[];
    return Array.isArray(history) ? history.slice(-500) : [];
  } catch {
    return [];
  }
}

function writeChatHistory(history: ChatMessage[]): void {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(chatHistoryPath(), JSON.stringify(history.slice(-500), null, 2), 'utf-8');
}

export function registerIpcHandlers(
  botManager: BotManager,
  getMainWindow: () => BrowserWindow | null
): SupertonicBridge {
  const ttsBridge = new SupertonicBridge();
  botManager.commandEngine.setCommands(readCommands());
  botManager.loadChatHistory(readChatHistory());
  const initialSettings = readSettings();
  botManager.setMuted(initialSettings.muted);
  botManager.setVoiceHelp(!app.isPackaged && initialSettings.voiceHelpEnabled, initialSettings.voiceHelpVoice, initialSettings.voiceHelpLanguage);

  const sendToRenderer = (channel: string, ...args: unknown[]): void => {
    getMainWindow()?.webContents.send(channel, ...args);
  };

  botManager.on('statusChanged', (status, error) => {
    sendToRenderer(IPC_CHANNELS.BOT_STATUS_CHANGED, { status, error });
  });
  botManager.on('chatMessage', (message) => {
    writeChatHistory(botManager.getChatHistory());
    sendToRenderer(IPC_CHANNELS.CHAT_MESSAGE, message);
  });
  botManager.on('playVoice', (audioPath: string) => {
    sendToRenderer(IPC_CHANNELS.TTS_PLAY, audioPath);
  });
  botManager.on('voiceHelp', async (text: string, voice: string) => {
    const outputPath = path.join(voicesDir(), 'voice-help.wav');
    const result = await ttsBridge.generateSpeech({ text, voice, outputPath });
    if (result.success && result.outputPath) sendToRenderer(IPC_CHANNELS.TTS_PLAY, result.outputPath);
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => readSettings());

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SAVE, (_event, newSettings: AppSettings) => {
    writeSettings(newSettings);
    botManager.setMuted(newSettings.muted);
    botManager.setVoiceHelp(!app.isPackaged && newSettings.voiceHelpEnabled, newSettings.voiceHelpVoice, newSettings.voiceHelpLanguage);
    return readSettings();
  });

  ipcMain.handle(IPC_CHANNELS.BOT_CONNECT, async (_event, partial?: Partial<AppSettings>) => {
    const merged = { ...readSettings(), ...partial };
    writeSettings(merged);
    await botManager.connect({
      host: merged.host,
      port: merged.port,
      username: merged.username,
      version: merged.version,
      botPlayers: merged.botPlayers,
    });
    return botManager.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.BOT_DISCONNECT, async () => {
    await botManager.disconnect();
    return botManager.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.BOT_STATUS, () => ({
    status: botManager.getStatus(),
    history: botManager.getChatHistory(),
  }));

  ipcMain.handle(IPC_CHANNELS.CHAT_HISTORY, () => botManager.getChatHistory());

  ipcMain.handle(IPC_CHANNELS.COMMANDS_GET, () => readCommands());

  ipcMain.handle(IPC_CHANNELS.COMMANDS_ADD, (_event, command: BotCommand) => {
    const list = readCommands();
    list.push(command);
    writeCommands(list);
    botManager.commandEngine.setCommands(list);
    void botManager.publishMenu();
    return list;
  });

  ipcMain.handle(IPC_CHANNELS.COMMANDS_REMOVE, (_event, commandId: string) => {
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
    const file = path.join(voicesDir(), 'builtin', language, voice, `${slug}-start.wav`);
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
    if (!filePath || !fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.mp3' ? 'audio/mpeg' : ext === '.ogg' ? 'audio/ogg' : 'audio/wav';
    return `data:${mime};base64,${buf.toString('base64')}`;
  });

  ipcMain.handle(IPC_CHANNELS.CHAT_CLEAR, () => {
    const history = botManager.clearChat();
    writeChatHistory(history);
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
