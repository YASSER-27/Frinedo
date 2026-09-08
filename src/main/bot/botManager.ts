import mineflayer, { Bot } from 'mineflayer';
import { ping } from 'minecraft-protocol';
import { pathfinder } from 'mineflayer-pathfinder';
import { EventEmitter } from 'events';
import {
  BotConnectionStatus,
  ChatMessage,
  ServerSettings,
} from '../../shared/types';
import { CommandEngine } from './commandEngine';
import { ensurePlugins, nearestHostile, setDefaultMovements, attackTarget, followPlayer, collectByName, craftItem, placeNearby, tossInventoryIndex } from './skills';
import { buildMenuEntries, isMenuOpenPhrase, menuPageFromMessage, pickMenuEntry, sendInGameMenu } from './gameMenu';

async function detectVersion(host: string, port: number, fallback?: string): Promise<string | false> {
  if (fallback && fallback.trim() && fallback.trim().toLowerCase() !== 'auto') {
    return fallback.trim();
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 5000);
    try {
      ping({ host, port, closeTimeout: 4000 }, (err, result) => {
        clearTimeout(timer);
        if (err || !result) {
          resolve(false);
          return;
        }
        const raw = String((result as { version?: { name?: string } }).version?.name ?? '');
        const match = raw.match(/(\d+\.\d+(?:\.\d+)?)/);
        resolve(match ? match[1] : false);
      });
    } catch {
      clearTimeout(timer);
      resolve(false);
    }
  });
}

export class BotManager extends EventEmitter {
  private bot: Bot | null = null;
  private status: BotConnectionStatus = 'disconnected';
  private chatHistory: ChatMessage[] = [];
  readonly commandEngine = new CommandEngine();
  private muted = false;
  private guard = false;
  private followUser = '';
  private busy = false;
  private lastPlayer = '';
  private guardTimer: ReturnType<typeof setInterval> | null = null;
  private idleMode = false;
  private idleTaskAt = 0;
  private inventoryListOpen = false;
  private menuPage = 1;
  private voiceHelpEnabled = false;
  private voiceHelpVoice = 'M2';
  private voiceHelpLanguage: 'en' | 'ar' = 'en';
  private extraBots = new Map<number, Bot>();
  private primaryName = '';

  getStatus(): BotConnectionStatus {
    return this.status;
  }

  getChatHistory(): ChatMessage[] {
    return [...this.chatHistory];
  }

  loadChatHistory(history: ChatMessage[]): void {
    this.chatHistory = history.slice(-500);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  setVoiceHelp(enabled: boolean, voice: string, language: 'en' | 'ar' = 'en'): void {
    this.voiceHelpEnabled = enabled;
    this.voiceHelpVoice = voice;
    this.voiceHelpLanguage = language;
  }

  private localizeVoiceHelp(text: string): string {
    if (this.voiceHelpLanguage === 'en') return text;
    const translations: Record<string, string> = {
      'Running away from danger.': 'سأهرب من الخطر.',
      'I am safe for now.': 'أنا بأمان الآن.',
      'I will search nearby.': 'سأبحث في المنطقة القريبة.',
      'Search finished.': 'انتهى البحث.',
      'Saving this location.': 'أحفظ هذا المكان.',
      'Location saved.': 'تم حفظ المكان.',
      'I will guide you step by step.': 'سأرشدك خطوة بخطوة.',
    };
    return translations[text] ?? text;
  }

  private setStatus(status: BotConnectionStatus, error?: string): void {
    this.status = status;
    this.emit('statusChanged', status, error);
  }

  private addChatMessage(sender: string, text: string, isBot: boolean): void {
    const message: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      sender,
      text,
      isBot,
    };
    this.chatHistory.push(message);
    if (this.chatHistory.length > 500) this.chatHistory.shift();
    this.emit('chatMessage', message);
  }

  private say(text: string, voicePath?: string, allowVoiceHelp = true): void {
    if (this.bot) this.sayFrom(this.bot, text, voicePath, allowVoiceHelp);
  }

  private sayFrom(bot: Bot, text: string, voicePath?: string, allowVoiceHelp = true): void {
    if (!text) return;
    for (const line of text.split('\n').map((value) => value.trim()).filter(Boolean)) {
      bot.chat(line);
      this.addChatMessage(bot.username ?? 'Bot', line, true);
      if (!this.muted) {
        if (voicePath) this.emit('playVoice', voicePath);
        else if (allowVoiceHelp && this.voiceHelpEnabled) this.emit('voiceHelp', this.localizeVoiceHelp(line), this.voiceHelpVoice);
      }
    }
  }

  async connect(settings: ServerSettings): Promise<void> {
    if (this.bot) await this.disconnect();
    this.setStatus('connecting');

    const host = settings.host.trim() || '127.0.0.1';
    const port = Number(settings.port) || 25565;
    this.primaryName = settings.username;
    const version = await detectVersion(host, port, settings.version);
    this.addChatMessage(
      'System',
      version
        ? `Connecting to ${host}:${port} (Minecraft ${version})`
        : `Connecting to ${host}:${port} (auto-detect version)`,
      false
    );

    return new Promise((resolve, reject) => {
      try {
        const options: Parameters<typeof mineflayer.createBot>[0] = {
          host,
          port,
          username: settings.username,
          auth: 'offline',
          hideErrors: false,
        };
        if (version) {
          (options as { version?: string }).version = version;
        }
        this.bot = mineflayer.createBot(options);

        this.bot.loadPlugin(pathfinder);

        this.bot.once('spawn', () => {
          if (!this.bot) return;
          ensurePlugins(this.bot);
          setDefaultMovements(this.bot);
          this.setStatus('connected');
          this.addChatMessage('System', `Joined as ${settings.username}. Type menu in chat for clickable commands.`, false);
          void this.connectExtraBots(host, port, version, settings.botPlayers ?? []);
          this.startGuardLoop();
          resolve();
        });

        this.bot.on('chat', (username, message) => {
          if (username === this.bot?.username) return;
          this.addChatMessage(username, message, false);
          void this.handleChatMessage(username, message);
        });

        this.bot.on('whisper', (username, message) => {
          if (username === this.bot?.username) return;
          this.addChatMessage(username, `(whisper) ${message}`, false);
          void this.handleChatMessage(username, message);
        });

        this.bot.on('kicked', (reason) => {
          const reasonText = typeof reason === 'string' ? reason : JSON.stringify(reason);
          this.addChatMessage('System', `Kicked: ${reasonText}`, false);
          this.setStatus('error', reasonText);
        });

        this.bot.on('error', (err) => {
          this.addChatMessage('System', `Error: ${err.message}`, false);
          if (this.status === 'connecting') {
            this.setStatus('error', err.message);
            reject(err);
          }
        });

        this.bot.on('end', () => {
          this.addChatMessage('System', 'Disconnected', false);
          this.bot = null;
          this.stopGuardLoop();
          if (this.status === 'connecting') {
            this.setStatus('error', 'Connection ended before spawn');
            reject(new Error('Connection ended before spawn'));
          } else {
            this.setStatus('disconnected');
          }
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.setStatus('error', message);
        reject(err);
      }
    });
  }

  async disconnect(): Promise<void> {
    this.stopGuardLoop();
    if (this.bot) {
      this.bot.quit();
      this.bot = null;
    }
    for (const extra of this.extraBots.values()) extra.quit();
    this.extraBots.clear();
    this.setStatus('disconnected');
  }

  private async connectExtraBots(host: string, port: number, version: string | false, names: string[]): Promise<void> {
    for (let offset = 1; offset < 4; offset += 1) {
      const username = names[offset]?.trim();
      if (!username) continue;
      const index = offset + 1;
      if (this.extraBots.has(index)) continue;
      const options: Parameters<typeof mineflayer.createBot>[0] = { host, port, username, auth: 'offline', hideErrors: false };
      if (version) (options as { version?: string }).version = version;
      const extra = mineflayer.createBot(options);
      extra.loadPlugin(pathfinder);
      extra.once('spawn', () => {
        ensurePlugins(extra);
        setDefaultMovements(extra);
        this.extraBots.set(index, extra);
        this.addChatMessage('System', `${username} joined as bot${index}. Use bot${index} before a command.`, false);
      });
      extra.on('end', () => { this.extraBots.delete(index); });
      extra.on('error', (error) => this.addChatMessage('System', `${username}: ${error.message}`, false));
    }
  }

  private resolveTarget(message: string): { bot: Bot; message: string } | null {
    if (!this.bot) return null;
    const match = message.match(/^\s*(?:bot|b)([1-4])\s+(.+)$/i);
    if (match) {
      const index = Number(match[1]);
      const target = index === 1 ? this.bot : this.extraBots.get(index);
      return target ? { bot: target, message: match[2] } : null;
    }
    const nameMatch = message.match(/^\s*([^\s]+)\s+(.+)$/i);
    if (nameMatch) {
      const name = nameMatch[1].toLowerCase();
      if (name === this.primaryName.toLowerCase()) return { bot: this.bot, message: nameMatch[2] };
      for (const target of this.extraBots.values()) {
        if (target.username.toLowerCase() === name) return { bot: target, message: nameMatch[2] };
      }
    }
    return { bot: this.bot, message };
  }

  private startGuardLoop(): void {
    this.stopGuardLoop();
    this.guardTimer = setInterval(() => {
      void this.tickGuard();
    }, 900);
  }

  private stopGuardLoop(): void {
    if (this.guardTimer) clearInterval(this.guardTimer);
    this.guardTimer = null;
  }

  private async tickGuard(): Promise<void> {
    if (!this.bot || this.busy) return;
    if (this.idleMode) {
      await this.tickIdle();
      return;
    }
    if (!this.guard) return;
    const mob = nearestHostile(this.bot);
    if (!mob) return;

    this.busy = true;
    this.say('Monster nearby. Attacking!');
    try {
      await attackTarget(this.bot, 'hostile');
      if (this.guard && this.followUser && this.bot) {
        await followPlayer(this.bot, this.followUser, 3);
      }
    } catch {
      // ignore
    } finally {
      this.busy = false;
    }
  }

  private async tickIdle(): Promise<void> {
    if (!this.bot || this.busy) return;
    const player = this.lastPlayer ? this.bot.players[this.lastPlayer]?.entity : null;
    if (player && player.position.distanceTo(this.bot.entity.position) <= 6) {
      await this.bot.lookAt(player.position.offset(0, player.height, 0));
      return;
    }
    if (Date.now() < this.idleTaskAt) return;
    this.idleTaskAt = Date.now() + 45000;
    this.busy = true;
    try {
      const hasTool = this.bot.inventory.items().some((item) =>
        item.name.includes('pickaxe') || item.name.includes('axe') || item.name.includes('sword')
      );
      if (!hasTool) {
        await collectByName(this.bot, 'oak_log', 3);
        await craftItem(this.bot, 'oak_planks', 4);
        await craftItem(this.bot, 'stick', 4);
        const table = this.bot.findBlock({
          matching: this.bot.registry.blocksByName.crafting_table?.id ?? -1,
          maxDistance: 16,
        });
        if (!table) {
          await craftItem(this.bot, 'crafting_table', 1);
          await placeNearby(this.bot, 'crafting_table');
        }
        await craftItem(this.bot, 'wooden_pickaxe', 1);
        await craftItem(this.bot, 'wooden_axe', 1);
        await craftItem(this.bot, 'wooden_sword', 1);
      }
    } finally {
      this.busy = false;
    }
  }

  clearChat(): ChatMessage[] {
    this.chatHistory = [];
    this.emit('chatCleared');
    return [];
  }

  async publishMenu(username?: string, page = 1): Promise<void> {
    if (!this.bot) return;
    const entries = buildMenuEntries(this.commandEngine.getCommands());
    const target = username || this.lastPlayer || '@a';
    try {
      this.menuPage = page;
      await sendInGameMenu(this.bot, target, entries, page);
      this.addChatMessage('System', 'In-game command menu updated.', false);
    } catch (err) {
      this.addChatMessage(
        'System',
        `Menu send failed: ${err instanceof Error ? err.message : String(err)}`,
        false
      );
    }
  }

  private async handleChatMessage(username: string, message: string): Promise<void> {
    const target = this.resolveTarget(message);
    if (!target) return;
    const targetBot = target.bot;
    const commandMessage = target.message;
    this.lastPlayer = username;

    const inventoryNumber = Number(commandMessage.trim());
    if (this.inventoryListOpen && Number.isInteger(inventoryNumber) && inventoryNumber > 0) {
      this.inventoryListOpen = false;
      this.say('I will give you that item.');
      this.busy = true;
      try {
        this.sayFrom(targetBot, await tossInventoryIndex(targetBot, username, inventoryNumber));
      } finally {
        this.busy = false;
      }
      return;
    }

    if (isMenuOpenPhrase(commandMessage)) {
      await this.publishMenu(username, menuPageFromMessage(commandMessage) ?? 1);
      return;
    }

    const entries = buildMenuEntries(this.commandEngine.getCommands());
    const picked = pickMenuEntry(entries, commandMessage, this.menuPage);
    if (picked) {
      await this.handleChatMessage(username, `${targetBot.username} ${picked.phrase}`);
      return;
    }

    const { saved, intent } = this.commandEngine.resolve(commandMessage);
    if (!intent) return;

    if (intent.actionType === 'showMenu') {
      await this.publishMenu(username);
      return;
    }

    this.guard = intent.actionType === 'followGuard';
    this.idleMode = intent.actionType === 'stop' || intent.actionType === 'stay';
    if (this.idleMode) this.idleTaskAt = Date.now() + 45000;
    this.followUser =
      intent.actionType === 'followPlayer' || intent.actionType === 'followGuard'
        ? username
        : this.followUser;
    if (intent.actionType === 'stop' || intent.actionType === 'stay') {
      this.guard = false;
      this.followUser = '';
    } else {
      this.idleMode = false;
    }

    const voiceVariant = saved?.voiceStartVariants?.[`${this.voiceHelpLanguage}:${this.voiceHelpVoice}`];
    this.sayFrom(targetBot, intent.startText, voiceVariant || saved?.voiceStartPath || saved?.voiceResponsePath);
    this.busy = true;
    try {
      const result = await this.commandEngine.execute(targetBot, intent, username);
      if (intent.actionType === 'showInventory') this.inventoryListOpen = true;
      const done = intent.doneText || result;
      if (done && done !== intent.startText) {
        this.sayFrom(targetBot, done, saved?.voiceDonePath, false);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.sayFrom(targetBot, `I failed: ${errorMsg}`, undefined, false);
    } finally {
      this.busy = false;
    }
  }
}
