import {
  AppSettings,
  BotConnectionStatus,
  ChatMessage,
  BotCommand,
  TestMatchResult,
} from '@shared/types';

declare global {
  interface Window {
    electronAPI?: {
      settings: {
        get: () => Promise<AppSettings>;
        save: (settings: AppSettings) => Promise<AppSettings>;
      };
      bot: {
        connect: (settings?: Partial<AppSettings>) => Promise<BotConnectionStatus>;
        disconnect: () => Promise<BotConnectionStatus>;
        getStatus: () => Promise<{ status: BotConnectionStatus; history: ChatMessage[] }>;
        testMatch: (message: string) => Promise<TestMatchResult>;
        onStatusChanged: (callback: (data: { status: BotConnectionStatus; error?: string }) => void) => () => void;
      };
      chat: {
        getHistory: () => Promise<ChatMessage[]>;
        clear: () => Promise<ChatMessage[]>;
        onMessage: (callback: (message: ChatMessage) => void) => () => void;
      };
      commands: {
        getAll: () => Promise<BotCommand[]>;
        add: (command: BotCommand) => Promise<BotCommand[]>;
        remove: (id: string) => Promise<BotCommand[]>;
      };
      tts: {
        generate: (request: {
          text: string;
          filename?: string;
          voice?: string;
          speed?: number;
          pitch?: number;
        }) => Promise<{
          success: boolean;
          outputPath?: string;
          error?: string;
          dataUrl?: string;
        }>;
        cancel: () => Promise<{ success: boolean; error?: string }>;
        readBuiltinAudio: (request: { slug: string; language: 'en' | 'ar'; voice: string }) => Promise<string | null>;
        importFile: () => Promise<{ path: string; dataUrl: string } | null>;
        readAudio: (filePath: string) => Promise<string | null>;
        onPlay: (callback: (path: string) => void) => () => void;
      };
      window: {
        minimize: () => Promise<void>;
        close: () => Promise<void>;
      };
      updates: {
        check: () => Promise<{ available: boolean; version?: string; error?: string }>;
        download: () => Promise<{ success: boolean; error?: string }>;
        install: () => Promise<void>;
        onStatus: (callback: (data: { status: string; version?: string; error?: string }) => void) => () => void;
      };
    };
  }
}

export {};
