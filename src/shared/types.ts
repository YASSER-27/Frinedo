export type ActionType =
  | 'followPlayer'
  | 'followGuard'
  | 'goToPlayer'
  | 'stop'
  | 'stay'
  | 'collectBlocks'
  | 'searchBlock'
  | 'giveItem'
  | 'giveAll'
  | 'craft'
  | 'placeBlock'
  | 'attack'
  | 'goToBed'
  | 'eat'
  | 'jump'
  | 'equip'
  | 'showInventory'
  | 'runAway'
  | 'findEntity'
  | 'saveLocation'
  | 'helpGuide'
  | 'fish'
  | 'tame'
  | 'farm'
  | 'showMenu'
  | 'custom';

export interface BotCommand {
  id: string;
  triggerPhrases: string[];
  actionType: ActionType;
  actionParams?: Record<string, unknown>;
  responseStart: string;
  responseDone: string;
  voiceStartPath?: string;
  voiceStartVariants?: Record<string, string>;
  voiceDonePath?: string;
  /** @deprecated use responseStart */
  responseText?: string;
  voiceResponsePath?: string;
  isBuiltIn?: boolean;
}

export interface ServerSettings {
  host: string;
  port: number;
  username: string;
  version?: string;
  botPlayers?: string[];
}

export interface AppSettings extends ServerSettings {
  muted: boolean;
  voiceHelpEnabled: boolean;
  voiceHelpVoice: string;
  voiceHelpLanguage: 'en' | 'ar';
}

export type BotConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export interface ChatMessage {
  id: string;
  timestamp: number;
  sender: string;
  text: string;
  isBot: boolean;
}

export interface ParsedIntent {
  actionType: ActionType;
  actionParams: Record<string, unknown>;
  label: string;
  startText: string;
  doneText: string;
}

export const IPC_CHANNELS = {
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

export const TTS_VOICES = [
  { id: 'F1', label: 'Female 1' },
  { id: 'F2', label: 'Female 2' },
  { id: 'F3', label: 'Female 3' },
  { id: 'F4', label: 'Female 4' },
  { id: 'M1', label: 'Male 1' },
  { id: 'M2', label: 'Male 2' },
  { id: 'M3', label: 'Male 3' },
  { id: 'M4', label: 'Male 4' },
] as const;

export interface TtsGenerateRequest {
  text: string;
  voice?: string;
  emotion?: string;
  filename?: string;
  speed?: number;
  pitch?: number;
}

export interface TtsGenerateResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  duration?: number;
  dataUrl?: string;
}

export interface TestMatchResult {
  matched: boolean;
  label?: string;
  startText?: string;
  doneText?: string;
}
