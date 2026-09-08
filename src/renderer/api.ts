import { AppSettings, BotCommand, BotConnectionStatus, ChatMessage, TestMatchResult } from '@shared/types';

const noop = () => {};

const stub = {
  settings: {
    get: async (): Promise<AppSettings> => ({
      host: '127.0.0.1',
      port: 25565,
      username: 'SteveBot',
      version: '',
      muted: false,
      voiceHelpEnabled: false,
      voiceHelpVoice: 'M2',
      voiceHelpLanguage: 'en',
      botPlayers: ['SteveBot'],
    }),
    save: async (s: AppSettings) => s,
  },
  bot: {
    connect: async (): Promise<BotConnectionStatus> => 'disconnected',
    disconnect: async (): Promise<BotConnectionStatus> => 'disconnected',
    getStatus: async () => ({ status: 'disconnected' as BotConnectionStatus, history: [] as ChatMessage[] }),
    testMatch: async (): Promise<TestMatchResult> => ({ matched: false }),
    onStatusChanged: () => noop,
  },
  chat: {
    getHistory: async (): Promise<ChatMessage[]> => [],
    clear: async (): Promise<ChatMessage[]> => [],
    onMessage: () => noop,
  },
  commands: {
    getAll: async (): Promise<BotCommand[]> => [],
    add: async () => [],
    remove: async () => [],
  },
  tts: {
    generate: async () => ({ success: false, error: 'Open the Electron app window, not the browser.' }),
    cancel: async () => ({ success: false, error: 'Open the Electron app window, not the browser.' }),
    readBuiltinAudio: async () => null,
    importFile: async () => null,
    readAudio: async () => null,
    onPlay: () => noop,
  },
  window: {
    close: async () => undefined,
  },
};

export function getApi() {
  return window.electronAPI ?? stub;
}
