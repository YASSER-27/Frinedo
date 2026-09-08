import { contextBridge, ipcRenderer } from 'electron';

const C = {
  BOT_CONNECT: 'bot:connect',
  BOT_DISCONNECT: 'bot:disconnect',
  BOT_STATUS: 'bot:status',
  BOT_STATUS_CHANGED: 'bot:status-changed',
  BOT_TEST_MATCH: 'bot:test-match',
  CHAT_MESSAGE: 'chat:message',
  CHAT_HISTORY: 'chat:history',
  COMMANDS_GET: 'commands:get',
  COMMANDS_ADD: 'commands:add',
  COMMANDS_REMOVE: 'commands:remove',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
  TTS_GENERATE: 'tts:generate',
  TTS_CANCEL: 'tts:cancel',
  TTS_BUILTIN_READ: 'tts:builtin-read',
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_STATUS: 'update:status',
  TTS_PLAY: 'tts:play',
  TTS_IMPORT: 'tts:import',
  AUDIO_READ: 'audio:read',
  CHAT_CLEAR: 'chat:clear',
  WINDOW_CLOSE: 'window:close',
  WINDOW_MINIMIZE: 'window:minimize',
  MENU_PUSH: 'menu:push',
} as const;

contextBridge.exposeInMainWorld('electronAPI', {
  settings: {
    get: () => ipcRenderer.invoke(C.SETTINGS_GET),
    save: (settings: unknown) => ipcRenderer.invoke(C.SETTINGS_SAVE, settings),
  },
  bot: {
    connect: (settings?: unknown) => ipcRenderer.invoke(C.BOT_CONNECT, settings),
    disconnect: () => ipcRenderer.invoke(C.BOT_DISCONNECT),
    getStatus: () => ipcRenderer.invoke(C.BOT_STATUS),
    testMatch: (message: string) => ipcRenderer.invoke(C.BOT_TEST_MATCH, message),
    onStatusChanged: (callback: (data: unknown) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, data: unknown) => callback(data);
      ipcRenderer.on(C.BOT_STATUS_CHANGED, handler);
      return () => ipcRenderer.removeListener(C.BOT_STATUS_CHANGED, handler);
    },
  },
  chat: {
    getHistory: () => ipcRenderer.invoke(C.CHAT_HISTORY),
    clear: () => ipcRenderer.invoke(C.CHAT_CLEAR),
    onMessage: (callback: (message: unknown) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, message: unknown) => callback(message);
      ipcRenderer.on(C.CHAT_MESSAGE, handler);
      return () => ipcRenderer.removeListener(C.CHAT_MESSAGE, handler);
    },
  },
  commands: {
    getAll: () => ipcRenderer.invoke(C.COMMANDS_GET),
    add: (command: unknown) => ipcRenderer.invoke(C.COMMANDS_ADD, command),
    remove: (id: string) => ipcRenderer.invoke(C.COMMANDS_REMOVE, id),
  },
  tts: {
    generate: (request: unknown) => ipcRenderer.invoke(C.TTS_GENERATE, request),
    cancel: () => ipcRenderer.invoke(C.TTS_CANCEL),
    readBuiltinAudio: (request: unknown) => ipcRenderer.invoke(C.TTS_BUILTIN_READ, request),
    importFile: () => ipcRenderer.invoke(C.TTS_IMPORT),
    readAudio: (filePath: string) => ipcRenderer.invoke(C.AUDIO_READ, filePath),
    onPlay: (callback: (p: string) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, audioPath: string) => callback(audioPath);
      ipcRenderer.on(C.TTS_PLAY, handler);
      return () => ipcRenderer.removeListener(C.TTS_PLAY, handler);
    },
  },
  window: {
    minimize: () => ipcRenderer.invoke(C.WINDOW_MINIMIZE),
    close: () => ipcRenderer.invoke(C.WINDOW_CLOSE),
  },
  updates: {
    check: () => ipcRenderer.invoke(C.UPDATE_CHECK),
    download: () => ipcRenderer.invoke(C.UPDATE_DOWNLOAD),
    install: () => ipcRenderer.invoke(C.UPDATE_INSTALL),
    onStatus: (callback: (data: unknown) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, data: unknown) => callback(data);
      ipcRenderer.on(C.UPDATE_STATUS, handler);
      return () => ipcRenderer.removeListener(C.UPDATE_STATUS, handler);
    },
  },
});
