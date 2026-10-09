import mineflayer, { Bot } from 'mineflayer';
import { ping } from 'minecraft-protocol';
import { pathfinder } from 'mineflayer-pathfinder';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import type { Server } from 'http';
import { app } from 'electron';
import {
  BotConnectionStatus,
  ChatMessage,
  ServerSettings,
} from '../../shared/types';
import { CommandEngine } from './commandEngine';
import {
  ensurePlugins,
  nearestHostile,
  setDefaultMovements,
  attackTarget,
  followPlayer,
  tossInventoryIndex,
  rideVehicle,
  exitVehicle,
  goToBed,
  collectNearbyFood,
  depositFoodToChest,
  nearestFoodAnimal,
  isFoodItem,
} from './skills';
import { resolveBlockVariants } from '../../shared/items';
import { SurvivalBrain } from './survivalBrain';
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
  private companionFollow = true;
  private busy = false;
  private lastPlayer = '';
  private guardTimer: ReturnType<typeof setInterval> | null = null;
  private idleMode = false;
  private idleTaskAt = 0;
  private lastActivityAt = Date.now();
  private lastPlayerMoveAt = Date.now();
  private lastPlayerPosition: { x: number; y: number; z: number } | null = null;
  private passiveVoiceIndex = new Map<string, number>();
  private disconnecting = false;
  private inventoryListOpen = false;
  private menuPage = 1;
  private voiceHelpEnabled = false;
  private voiceHelpVoice = 'M2';
  private voiceHelpLanguage: 'en' | 'ar' = 'en';
  private extraBots = new Map<number, Bot>();
  private primaryName = '';
  private skinServer: Server | null = null;
  private skinServerPort = 0;
  private selectedSkins = new Map<'bot1' | 'bot2' | 'bot3' | 'bot4', string>();
  private lastSkinRequests = new Map<'bot1' | 'bot2' | 'bot3' | 'bot4', { bot: Bot; skinId: string }>();
  private lastPassiveMobKey = '';
  private lastPassiveMobAt = 0;
  private lastPassiveScanAt = 0;
  private lastContextVoiceAt = new Map<string, number>();
  private lastCommandTimes = new Map<string, number>();
  private recentChatKeys = new Map<string, number>();
  private survivalBrain = new SurvivalBrain();
  private extraBrains = new Map<number, SurvivalBrain>();
  private extraBrainRunning = new Set<number>();
  private pendingCommand: { username: string; message: string } | null = null;
  private automationCancelled = false;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  getStatus(): BotConnectionStatus {
    return this.status;
  }

  getChatHistory(): ChatMessage[] {
    return [...this.chatHistory];
  }

  getBotUsername(): string {
    return this.primaryName || this.bot?.username || 'SteveBot';
  }

  loadChatHistory(history: ChatMessage[]): void {
    this.chatHistory = history;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  setVoiceHelp(enabled: boolean, voice: string, language: 'en' | 'ar' = 'en'): void {
    this.voiceHelpEnabled = enabled;
    this.voiceHelpVoice = voice;
    this.voiceHelpLanguage = language;
  }

  private skinFilePath(skinId: string): string | null {
    if (!/^skin(?:00[1-9]|0010)$/.test(skinId)) return null;
    const root = app.isPackaged
      ? path.join(app.getAppPath(), 'src', 'store')
      : path.join(process.cwd(), 'src', 'store');
    const file = path.join(root, skinId, `${skinId}-skin.png`);
    return fs.existsSync(file) ? file : null;
  }

  private async ensureSkinServer(): Promise<number> {
    if (this.skinServer && this.skinServerPort > 0) return this.skinServerPort;
    this.skinServer = http.createServer((request, response) => {
      const match = request.url?.match(/^\/skin\/(skin\d{3,4})\.png$/);
      const file = match ? this.skinFilePath(match[1]) : null;
      if (!file) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(response);
    });

    await new Promise<void>((resolve, reject) => {
      this.skinServer?.once('error', reject);
      this.skinServer?.listen(0, '0.0.0.0', () => resolve());
    });
    const address = this.skinServer.address();
    if (!address || typeof address === 'string') throw new Error('Could not start the local skin server.');
    this.skinServerPort = address.port;
    return this.skinServerPort;
  }

  async setSkin(target: 'bot1' | 'bot2' | 'bot3' | 'bot4' | 'user', skinId: string): Promise<{ success: boolean; error?: string }> {
    if (target === 'user') {
      return { success: false, error: 'The User skin is only used in Frinedo chat.' };
    }
    const file = this.skinFilePath(skinId);
    if (!file) return { success: false, error: 'Skin texture file was not found.' };
    this.selectedSkins.set(target, skinId);
    const bot = target === 'bot1' ? this.bot : this.extraBots.get(Number(target.slice(-1)));
    if (!bot) return { success: false, error: 'Connect the bot before applying a skin.' };
    const previous = this.lastSkinRequests.get(target);
    if (previous?.bot === bot && previous.skinId === skinId) return { success: true };
    this.lastSkinRequests.set(target, { bot, skinId });
    const port = await this.ensureSkinServer();
    bot.chat(`/skin url http://127.0.0.1:${port}/skin/${skinId}.png`);
    this.addChatMessage('System', `Requested ${skinId} for ${target}. The connected server must have SkinsRestorer.`, false);
    return { success: true };
  }

  private localizeVoiceHelp(text: string): string {
    if (this.voiceHelpLanguage === 'en') return text;
    const translations: Record<string, string> = {
      'Running away from danger.': 'سأهرب من الخطر.',
      'I am safe for now.': 'أنا بأمان الآن.',
      'Search finished.': 'انتهى البحث.',
      'Saving this location.': 'أحفظ هذا المكان.',
      'Location saved.': 'تم حفظ المكان.',
      'I will guide you step by step.': 'سأرشدك خطوة بخطوة.',
      'Fishing finished.': 'انتهى الصيد.',
      'I will work on the nearby crops.': 'سأعمل على المحاصيل القريبة.',
      'Crop work finished.': 'انتهى العمل في المحاصيل.',
      'Here is everything I have. Use the item number if you want one.': 'هذه كل ما لدي. استخدم رقم العنصر إذا أردت واحدًا.',
      'Okay, following you.': 'حسنًا، سأتابعك.',
      'I am right behind you.': 'أنا خلفك مباشرة.',
      'On my way to you.': 'في طريقي إليك.',
      'I reached you.': 'وصلت إليك.',
      'Stopping right here.': 'سأقف هنا.',
      'I am holding this exact spot.': 'أنا أحافظ على هذا المكان بالضبط.',
      'Stopping now.': 'أتوقف الآن.',
      'All actions stopped.': 'تم إيقاف جميع الأوامر.',
      'I will attack the nearest target.': 'سأهاجم أقرب هدف.',
      'Target attack finished.': 'انتهى الهجوم.',
      'Handing over everything I have.': 'أعطيك كل ما لدي.',
      'That is all I was carrying.': 'هذا كل ما كنت أحمله.',
      'Okay, I will get 8 oak log.': 'حسنًا، سأحضر 8 خشب البلوط.',
      'Finished collecting oak log.': 'انتهى جمع خشب البلوط.',
      'Okay, I will craft a furnace.': 'حسنًا، سأصنع فرنًا.',
      'Furnace is ready.': 'الفرن جاهز.',
      'Okay, I will craft a crafting table.': 'حسنًا، سأصنع طاولة صناعة.',
      'Crafting table is ready.': 'طاولة الصناعة جاهزة.',
      'Searching for diamond ore.': 'أبحث عن خام الماس.',
      'Search for diamond ore finished.': 'انتهى البحث عن خام الماس.',
      'I will search for treasure chests nearby.': 'سأبحث عن الصناديق في الجوار.',
      'Treasure search finished.': 'انتهى البحث عن الكنوز.',
      'I will try to tame that animal.': 'سأحاول تدجين هذا الحيوان.',
      'Taming attempt finished.': 'انتهت محاولة التدجين.',
      'I will go fishing nearby.': 'سأذهب للصيد في الجوار.',
      'A monster came near us. I am clearing the area before we sleep.': 'اقترب وحش منا. سأؤمن المكان قبل أن ننام.',
      'You are getting too far away. I am staying close.': 'أنت تبتعد كثيرًا. سأبقى قريبًا منك.',
      'I am eating so I can keep working.': 'سآكل حتى أستطيع مواصلة العمل.',
      'I caught food and will eat when it is ready.': 'اصطدت طعامًا وسآكله عندما يصبح جاهزًا.',
      'I placed the bed you gave me.': 'وضعت السرير الذي أعطيتني إياه.',
      'The night monster is too close. I am attacking it first.': 'وحش الليل قريب جدًا. سأهاجمه أولًا.',
      'It is night. I am sleeping with you so morning arrives safely.': 'حل الليل. سأنام معك حتى يأتي الصباح بأمان.',
      'I am gathering wood by hand first.': 'سأجمع الخشب بيدي أولًا.',
      'I made a crafting table.': 'أنشأت طاولة صناعة.',
      'My wooden tools are ready.': 'أدواتي الخشبية جاهزة.',
      'I upgraded from wood to stone tools.': 'طورت أدواتي من الخشب إلى الحجر.',
      'I made a furnace for the next upgrade.': 'أنشأت فرنًا للترقية التالية.',
      'I upgraded to iron tools.': 'طورت أدواتي إلى الحديد.',
      'I crafted a shield for protection.': 'صنعت درعًا للحماية.',
      'I built a stonecutter for efficient building.': 'أنشأت قاطع أحجار للبناء بكفاءة.',
      'I built a small shelter so we can survive here.': 'بنيت مأوى صغيرًا حتى نعيش بأمان هنا.',
      'I have a bed ready for the next night.': 'لدي سرير جاهز لليلة القادمة.',
      'Automatic survival mode is off.': 'تم إيقاف نمط البقاء التلقائي.',
      'Automatic survival continued from the current stage.': 'تمت متابعة البقاء من المرحلة الحالية.',
      'Automatic survival restarted from the beginning.': 'تمت إعادة البقاء من البداية.',
    };
    return translations[text] ?? text;
  }

  private voiceForBot(bot: Bot): string {
    if (bot === this.bot) return this.voiceHelpVoice || 'M2';
    for (const [index, extra] of this.extraBots.entries()) {
      if (extra === bot) return index % 2 === 0 ? 'F1' : 'M2';
    }
    return this.voiceHelpVoice;
  }

  private builtinVoicePathForPhrase(phrase: string, voice: string): string | undefined {
    const normalized = phrase.trim().toLowerCase();
    const slugMap: Record<string, string> = {
      flw: 'follow-me', dlw: 'follow-me', fol: 'follow-me',
      str: 'follow-me', srt: 'follow-me', sct: 'follow-me', stbe: 'build-house', stf: 'stop',
      'show me': 'show-me', 'run away': 'run-away', sleep: 'sleep', 'find village': 'find-village',
      this: 'take-front', 'take this': 'take-front', up: 'stay-awake', 'wake up': 'stay-awake',
      go: 'go-attack', attack: 'go-attack', 'go attack': 'go-attack',
      'find dog': 'find-dog', 'find cat': 'find-cat', 'find horse': 'find-horse', 'find camel': 'find-camel',
      'save house': 'save-house', 'save me': 'save-me', 'how do i craft a sword': 'how-craft-sword',
      'follow me': 'follow-me', 'follow me and help me': 'follow-me-help', 'stop here': 'stop-here', stop: 'stop',
      'come here': 'come-here', 'give me everything': 'give-everything', 'give me a sword': 'give-sword',
      'give me armor': 'give-armor', 'give me food': 'give-food', 'give me a boat': 'give-boat',
      'bring me 10 wood': 'bring-wood', 'bring me 16 stone': 'bring-stone', 'search for diamond': 'search-diamond',
      'search for gold': 'search-gold', 'create a furnace': 'create-furnace', 'craft a crafting table': 'craft-table',
      'go fishing': 'go-fishing', 'find treasure': 'find-treasure', 'find chest': 'find-chest', 'ride with me': 'ride-with-me',
      'kill this': 'kill-this', 'tame dog': 'tame-dog', 'tame cat': 'tame-cat', 'farm crops': 'farm-crops',
      'plant seeds': 'plant-seeds', 'harvest crops': 'harvest-crops', 'bring me sand': 'bring-sand',
      'bring me cobblestone': 'bring-cobblestone', 'bring me dirt': 'bring-dirt', 'bring me gravel': 'bring-gravel',
      'search for iron': 'search-iron', 'search for coal': 'search-coal', 'craft a sword': 'craft-sword',
      'craft a pickaxe': 'craft-pickaxe', 'craft an axe': 'craft-axe', 'craft a shovel': 'craft-shovel',
      'craft a shield': 'craft-shield', 'craft torches': 'craft-torches', 'find a bed': 'find-bed',
      'eat food': 'eat-food', 'equip sword': 'equip-sword',
      'build me a house': 'build-house', 'mine diamond': 'mine-diamond', 'make torches': 'make-torches',
      'fly with me': 'follow-me', 'entr': 'follow-me', 'enter': 'follow-me',
      'come get diamond': 'come-get-diamond', 'come get gold': 'come-get-gold', 'come get stone': 'come-get-stone',
      'dont follow me': 'stop-following', 'do not follow me': 'stop-following',
      'wear armor': 'wear-armor', 'put on armor': 'wear-armor',
      'ابني لي منزلا': 'build-house', 'احفر الماس': 'mine-diamond', 'اصنع المشاعل': 'make-torches',
      'اذهب للصيد': 'go-fishing', 'ابحث عن القرية': 'find-village', 'ابحث عن الصندوق': 'find-chest',
      'اهرب': 'run-away', 'كل الطعام': 'eat-food', 'نوم': 'sleep', 'اعطني طعام': 'give-food',
      'اعطني سيف': 'give-sword', 'اعطني كل شيء': 'give-everything', 'اتبعني': 'follow-me',
      'لا تتبعني': 'stop-following', 'طيري معي': 'follow-me', 'الانضمام': 'follow-me',
      'تعال واحضر الماس': 'come-get-diamond', 'تعال واحضر الذهب': 'come-get-gold',
      'تعال واحضر الحجر': 'come-get-stone', 'ارتدي الدروع': 'wear-armor',
      'خذ هذا': 'take-front', 'خد هذا': 'take-front', 'لا تنم': 'stay-awake', 'استيقظ': 'stay-awake',
      'هاجم': 'go-attack', 'اهجم': 'go-attack',
    };
    const slug = slugMap[normalized];
    if (!slug) return undefined;
    const builtinsRoot = app.isPackaged
      ? path.join(process.resourcesPath ?? app.getAppPath(), 'data', 'voices', 'builtin')
      : path.join(process.cwd(), 'data', 'voices', 'builtin');
    const file = path.join(builtinsRoot, this.voiceHelpLanguage, voice, `${slug}-start.wav`);
    return fs.existsSync(file) ? file : undefined;
  }

  private passiveMobVoicePath(name: string): string | undefined {
    const slug = ['creeper', 'spider', 'skeleton', 'zombie', 'enderman'].includes(name) ? `mob-${name}` : undefined;
    if (!slug) return undefined;
    const root = app.isPackaged
      ? path.join(process.resourcesPath ?? app.getAppPath(), 'data', 'voices', 'builtin')
      : path.join(process.cwd(), 'data', 'voices', 'builtin');
    const file = path.join(root, this.voiceHelpLanguage, this.voiceForBot(this.bot as Bot), `${slug}-start.wav`);
    return fs.existsSync(file) ? file : undefined;
  }

  private sayContext(key: string, cooldownMs = 45000): void {
    const now = Date.now();
    if (now - (this.lastContextVoiceAt.get(key) ?? 0) < cooldownMs) return;
    this.lastContextVoiceAt.set(key, now);
    const messages: Record<string, [string, string]> = {
      monsterAttack: ['I am attacking the monster.', 'أهاجم الوحش الآن.'],
      stayClose: ['Do not run. Stay close and follow me.', 'لا تهرب، ابق قريبًا واتبعني.'],
      village: ['Look, there is a village.', 'انظر، هناك قرية.'],
      fish: ['Look, I found fish.', 'انظر، وجدت سمكًا.'],
      sheep: ['Look, there is a sheep.', 'انظر، هناك خروف.'],
      cave: ['Look, we found a cave. Be careful, monsters may be inside.', 'انظر، وجدنا كهفًا. احذر، قد تكون الوحوش بداخله.'],
      hungry: ['I feel hungry.', 'أشعر بالجوع.'],
      foodLow: ['Our food will run out soon.', 'سينفد الطعام قريبًا.'],
      diamond: ['That is strange. I saw diamond, but I cannot remember where.', 'هذا غريب، رأيت دياموند لكنني لا أتذكر أين.'],
      nearbyMonster: ['Listen, I hear monsters close to us.', 'مهلًا، أسمع أصوات وحوش قريبة منا.'],
      sleep: ['You should sleep.', 'يجب عليك أن تنام.'],
      danger: ['Watch out, monsters are close to you.', 'احترس، الوحوش قريبة منك.'],
      behind: ['Watch your back!', 'انتبه خلفك!'],
      greeting: ['I missed you. I thought I would never meet you again.', 'اشتقت إليك، ظننت أنني لن ألتقيك مجددًا.'],
      bell: ['Look, a bell. Try touching it.', 'انظر، إنه جرس. حاول لمسه.'],
      hide: ['We should hide here.', 'يجب علينا الاختباء هنا.'],
      needsHelp: ['Do you need anything?', 'أتحتاج شيئًا؟'],
      actionOffer: ['I can do anything. Choose a task for me.', 'سأفعل أي شيء. اختر لي مهمة.'],
      map: ['I need a map. Do you have one?', 'أحتاج خريطة. هل لديك خريطة؟'],
      dragon: ['We must reach the dragon.', 'يجب علينا أن نصل إلى التنين.'],
    };
    const message = messages[key];
    if (message) this.say(message[this.voiceHelpLanguage === 'ar' ? 1 : 0], this.contextVoicePath(key));
  }

  private contextVoicePath(key: string): string | undefined {
    const slugs: Record<string, string> = {
      monsterAttack: 'monster-attack', stayClose: 'stay-close', foodLow: 'food-low',
      nearbyMonster: 'nearby-monster', sleep: 'sleep-advice', needsHelp: 'needs-help',
      actionOffer: 'action-offer',
    };
    const root = app.isPackaged
      ? path.join(process.resourcesPath ?? app.getAppPath(), 'data', 'voices', 'builtin')
      : path.join(process.cwd(), 'data', 'voices', 'builtin');
    const file = path.join(root, this.voiceHelpLanguage, this.voiceForBot(this.bot as Bot), `${slugs[key] ?? key}-start.wav`);
    return fs.existsSync(file) ? file : undefined;
  }

  private resolveVoicePath(voicePath?: string): string | undefined {
    if (!voicePath) return undefined;
    if (fs.existsSync(voicePath)) return voicePath;
    const filename = path.basename(voicePath);
    const roots = [
      app.isPackaged ? path.join(process.resourcesPath ?? app.getAppPath(), 'data', 'voices') : path.join(process.cwd(), 'data', 'voices'),
      path.join(app.getPath('userData'), 'data', 'voices'),
    ];
    for (const root of roots) {
      const candidate = path.join(root, filename);
      if (fs.existsSync(candidate)) return candidate;
    }
    return undefined;
  }

  private setStatus(status: BotConnectionStatus, error?: string): void {
    this.status = status;
    this.emit('statusChanged', status, error);
  }

  private addChatMessage(sender: string, text: string, isBot: boolean): void {
    const messageText = text.trim();
    if (!messageText) return;
    const dedupeKey = `${sender.toLowerCase()}::${messageText.toLowerCase()}`;
    const now = Date.now();
    const lastSeen = this.recentChatKeys.get(dedupeKey) ?? 0;
    if (now - lastSeen < 1200) return;
    this.recentChatKeys.set(dedupeKey, now);

    const message: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      sender,
      text,
      isBot,
    };
    this.chatHistory.push(message);
    this.emit('chatMessage', message);
  }

  private say(text: string, voicePath?: string, allowVoiceHelp = true): void {
    if (this.bot) this.sayFrom(this.bot, text, voicePath, allowVoiceHelp);
  }

  private botSocketOpen(bot: Bot): boolean {
    const socket = (bot as Bot & { _client?: { socket?: { destroyed?: boolean; writable?: boolean; readyState?: string } } })._client?.socket;
    if (socket) {
      if (socket.destroyed || socket.writable === false) return false;
      if (socket.readyState && !['open', 'readOnly', 'writeOnly'].includes(socket.readyState)) return false;
    }
    const client = (bot as Bot & { _client?: { connected?: boolean } })._client;
    if (client && typeof client.connected === 'boolean' && !client.connected) return false;
    return true;
  }

  private isBotUsable(bot: Bot | null | undefined): boolean {
    if (!bot) return false;
    const runtimeBot = bot as Bot & { endReason?: string; _client?: { connected?: boolean; socket?: { destroyed?: boolean; writable?: boolean; readyState?: string; _writableState?: { errored?: boolean | null } } } };
    const client = runtimeBot._client;
    const socket = client?.socket as { destroyed?: boolean; writable?: boolean; readyState?: string; _writableState?: { errored?: boolean | null } } | undefined;

    if (socket && (socket.destroyed || socket.writable === false || socket._writableState?.errored)) return false;
    if (socket?.readyState && !['open', 'readOnly', 'writeOnly'].includes(socket.readyState)) return false;
    if (typeof client?.connected === 'boolean' && !client.connected) return false;
    if (runtimeBot.endReason && /ECONNRESET|disconnect|closed/i.test(String(runtimeBot.endReason))) return false;
    return true;
  }

  private removeDeadBot(bot: Bot): void {
    if (this.bot === bot) {
      this.bot = null;
      this.stopGuardLoop();
      this.setStatus('disconnected');
      return;
    }
    for (const [index, target] of this.extraBots.entries()) {
      if (target === bot) {
        this.extraBots.delete(index);
        this.extraBrains.delete(index);
        break;
      }
    }
  }

  private pruneDeadBots(): void {
    if (this.bot && !this.isBotUsable(this.bot)) {
      this.removeDeadBot(this.bot);
    }
    for (const [index, bot] of [...this.extraBots.entries()]) {
      if (!this.isBotUsable(bot)) {
        this.extraBots.delete(index);
        this.extraBrains.delete(index);
      }
    }
  }

  private attachSocketGuard(bot: Bot, label: string, onClosed?: () => void): void {
    const client = (bot as Bot & {
      _client?: {
        on?: (event: string, listener: (error: Error) => void) => void;
        socket?: { on?: (event: string, listener: () => void) => void };
      };
    })._client;

    const cleanup = () => {
      this.pruneDeadBots();
      onClosed?.();
      this.addChatMessage('System', `${label} connection closed. Other bots can continue.`, false);
    };

    client?.socket?.on?.('close', cleanup);
    client?.socket?.on?.('error', cleanup);
    client?.on?.('error', (error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (/ECONNRESET|socket|destroyed/i.test(message)) {
        cleanup();
      }
    });

    bot.on('end', () => {
      this.removeDeadBot(bot);
      onClosed?.();
    });
  }

  private sayFrom(bot: Bot, text: string, voicePath?: string, allowVoiceHelp = true): void {
    if (!text) return;
    if (!this.isBotUsable(bot)) {
      this.removeDeadBot(bot);
      return;
    }
    for (const line of text.split('\n').map((value) => value.trim()).filter(Boolean)) {
      try {
        bot.chat(line);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/ECONNRESET|socket|destroyed|not connected/i.test(message)) {
          this.removeDeadBot(bot);
          return;
        }
        throw error;
      }
      this.addChatMessage(bot.username ?? 'Bot', line, true);
      if (!this.muted) {
        const readyVoicePath = voicePath || this.readyVoicePathForText(line, this.voiceForBot(bot));
        if (readyVoicePath) this.emit('playVoice', readyVoicePath);
      }
    }
  }

  private readyVoicePathForText(text: string, voice: string): string | undefined {
    const slugMap: Record<string, string> = {
      'Okay, following you.': 'follow-me',
      'I will take what is in front of me.': 'take-front',
      'I will stay awake.': 'stay-awake',
      'I am attacking the nearby monster.': 'go-attack',
      'Running away from danger.': 'run-away',
      'I will go fishing nearby.': 'go-fishing',
      'I will search nearby.': 'find-village',
      'I am gathering wood by hand first.': 'take-front',
      'I made a crafting table.': 'craft-table',
      'My wooden tools are ready.': 'craft-axe',
      'I upgraded from wood to stone tools.': 'bring-stone',
      'I made a furnace for the next upgrade.': 'create-furnace',
      'I upgraded to iron tools.': 'craft-pickaxe',
      'I crafted a shield for protection.': 'craft-shield',
      'I built a stonecutter for efficient building.': 'cave',
      'I built a small shelter so we can survive here.': 'build-house',
      'I have a bed ready for the next night.': 'sleep-advice',
      'Automatic survival mode is off.': 'stop',
      'Automatic survival continued from the current stage.': 'follow-me',
      'Automatic survival restarted from the beginning.': 'build-house',
      'سأجمع الخشب بيدي أولًا.': 'take-front',
      'أنشأت طاولة صناعة.': 'craft-table',
      'أدواتي الخشبية جاهزة.': 'craft-axe',
      'طورت أدواتي من الخشب إلى الحجر.': 'bring-stone',
      'أنشأت فرنًا للترقية التالية.': 'create-furnace',
      'طورت أدواتي إلى الحديد.': 'craft-pickaxe',
      'صنعت درعًا للحماية.': 'craft-shield',
      'أنشأت قاطع أحجار للبناء بكفاءة.': 'cave',
      'بنيت مأوى صغيرًا حتى نعيش بأمان هنا.': 'build-house',
      'لدي سرير جاهز لليلة القادمة.': 'sleep-advice',
      'تم إيقاف نمط البقاء التلقائي.': 'stop',
      'تمت متابعة البقاء من المرحلة الحالية.': 'follow-me',
      'تمت إعادة البقاء من البداية.': 'build-house',
    };
    const slug = slugMap[text.trim()];
    if (!slug) return undefined;
    const root = app.isPackaged
      ? path.join(process.resourcesPath ?? app.getAppPath(), 'data', 'voices', 'builtin')
      : path.join(process.cwd(), 'data', 'voices', 'builtin');
    const file = path.join(root, this.voiceHelpLanguage, voice, `${slug}-start.wav`);
    return fs.existsSync(file) ? file : undefined;
  }

  async connect(settings: ServerSettings): Promise<void> {
    if (this.bot || this.extraBots.size > 0) await this.disconnect();
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
        this.attachSocketGuard(this.bot, settings.username);

        this.bot.loadPlugin(pathfinder);

        this.bot.once('spawn', () => {
          if (!this.bot) return;
          ensurePlugins(this.bot);
          setDefaultMovements(this.bot);
          this.idleMode = false;
          this.followUser = '';
          this.companionFollow = true;
          this.guard = false;
          this.survivalBrain.reset();
          this.lastPlayer = '';
          this.setStatus('connected');
          this.addChatMessage('System', `Joined as ${settings.username}. Type menu in chat for clickable commands.`, false);
          void this.connectExtraBots(host, port, version, settings.botPlayers ?? []);
          this.startGuardLoop();
          resolve();
        });

        this.bot.on('chat', (username, message) => {
          if (this.knownBotUsernames().has(username.toLowerCase())) return;
          this.addChatMessage(username, message, false);
          void this.handleChatMessage(username, message);
        });

        this.bot.on('move', () => {
          this.lastActivityAt = Date.now();
          this.lastPlayerMoveAt = Date.now();
        });

        this.bot.on('whisper', (username, message) => {
          if (this.knownBotUsernames().has(username.toLowerCase())) return;
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
          if (this.status === 'connecting' && !this.disconnecting) {
            this.setStatus('error', err.message);
            reject(err);
          }
        });

        this.bot.on('end', () => {
          this.addChatMessage('System', 'Disconnected', false);
          this.bot = null;
          this.stopGuardLoop();
          if (this.status === 'connecting' && !this.disconnecting) {
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
    this.disconnecting = true;
    this.idleMode = false;
    this.guard = false;
    this.followUser = '';

    const mainBot = this.bot;
    const extras = [...this.extraBots.values()];

    this.bot = null;
    this.extraBots.clear();
    this.extraBrains.clear();
    this.extraBrainRunning.clear();

    if (mainBot) {
      await new Promise<void>((resolve) => {
        const done = () => {
          mainBot.removeListener('end', onEnd);
          mainBot.removeListener('error', onError);
          resolve();
        };
        const onEnd = () => done();
        const onError = () => done();

        mainBot.once('end', onEnd);
        mainBot.once('error', onError);
        mainBot.quit();
      });
    }

    for (const extra of extras) {
      extra.quit();
    }

    this.disconnecting = false;
    this.setStatus('disconnected');
  }

  private knownBotUsernames(): Set<string> {
    const names = new Set<string>();
    if (this.bot?.username) names.add(this.bot.username.toLowerCase());
    for (const bot of this.extraBots.values()) {
      if (bot.username) names.add(bot.username.toLowerCase());
    }
    return names;
  }

  private async connectExtraBots(host: string, port: number, version: string | false, names: string[]): Promise<void> {
    const seen = new Set<string>([this.primaryName.trim().toLowerCase()]);
    for (let offset = 0; offset < 4; offset += 1) {
      const username = names[offset]?.trim();
      if (!username) continue;
      const normalized = username.toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      const index = offset + 1;
      if (this.extraBots.has(index)) continue;
      const options: Parameters<typeof mineflayer.createBot>[0] = { host, port, username, auth: 'offline', hideErrors: false };
      if (version) (options as { version?: string }).version = version;
      const extra = mineflayer.createBot(options);
      this.attachSocketGuard(extra, username, () => this.extraBots.delete(index));
      extra.loadPlugin(pathfinder);
      extra.on('chat', (sender, message) => {
        if (this.knownBotUsernames().has(sender.toLowerCase())) return;
        if (sender === username) return;
        this.addChatMessage(sender, message, false);
        void this.handleChatMessage(sender, message);
      });
      extra.on('whisper', (sender, message) => {
        if (this.knownBotUsernames().has(sender.toLowerCase())) return;
        if (sender === username) return;
        this.addChatMessage(sender, `(whisper) ${message}`, false);
        void this.handleChatMessage(sender, message);
      });
      extra.once('spawn', () => {
        if (!this.isBotUsable(extra)) {
          extra.quit();
          return;
        }
        ensurePlugins(extra);
        setDefaultMovements(extra);
        this.extraBots.set(index, extra);
        const brain = new SurvivalBrain();
        brain.reset();
        this.extraBrains.set(index, brain);
        this.addChatMessage('System', `${username} joined as bot${index}. Use bot${index} or ${username} before a command.`, false);
      });
      extra.on('end', () => {
        this.extraBots.delete(index);
        this.extraBrains.delete(index);
        this.extraBrainRunning.delete(index);
      });
      extra.on('error', (error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (/ECONNRESET|socket|destroyed/i.test(message)) {
          this.extraBots.delete(index);
          this.extraBrains.delete(index);
          this.extraBrainRunning.delete(index);
        }
        this.addChatMessage('System', `${username}: ${message}`, false);
      });
    }

  }

  private parseExplicitBotIndex(name: string): number | null {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return null;
    const direct = normalized.match(/^(?:bot|b)[_-]?(\d+)$/i);
    if (direct) return Number(direct[1]);
    const pure = normalized.match(/^(\d+)$/);
    if (pure) return Number(pure[1]);
    return null;
  }

  private resolveExplicitTarget(name: string): Bot[] {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return [];

    if (normalized === 'all' || normalized === 'team' || normalized === '@a') {
      return [this.bot, ...Array.from(this.extraBots.values())]
        .filter((bot): bot is Bot => !!bot && this.isBotUsable(bot));
    }

    const explicitIndex = this.parseExplicitBotIndex(normalized);
    if (explicitIndex !== null) {
      const bot = this.extraBots.get(explicitIndex);
      return bot && this.isBotUsable(bot) ? [bot] : [];
    }

    const matches: Bot[] = [];
    const pushIfMatch = (bot: Bot | null | undefined) => {
      if (!bot || matches.includes(bot)) return;
      const username = bot.username.toLowerCase();
      if (username === normalized || username === normalized.replace(/^bot_?/, 'b_') || username === normalized.replace(/^b_?/, 'bot_')) {
        matches.push(bot);
      }
    };

    pushIfMatch(this.bot);
    for (const target of this.extraBots.values()) {
      pushIfMatch(target);
    }

    return matches.filter((bot) => this.isBotUsable(bot));
  }

  private resolveTarget(message: string): { bot: Bot; message: string } | null {
    const resolved = this.resolveTargets(message);
    if (!resolved || resolved.bots.length === 0) return null;
    return { bot: resolved.bots[0], message: resolved.message };
  }

  private resolveTargets(message: string): { bots: Bot[]; message: string } | null {
    this.pruneDeadBots();
    if (!this.bot) return null;
    const trimmed = message.trim();

    const explicitMatch = trimmed.match(/^\s*([^\s]+)\s+(.+)$/i);
    if (explicitMatch) {
      const name = explicitMatch[1].toLowerCase();
      const explicitBots = this.resolveExplicitTarget(name);
      if (explicitBots.length > 0) {
        return { bots: explicitBots, message: explicitMatch[2] };
      }

      const usernameBots: Bot[] = [];
      const pushUserMatch = (bot: Bot | null | undefined) => {
        if (!bot || usernameBots.includes(bot)) return;
        if (bot.username.toLowerCase() === name) usernameBots.push(bot);
      };
      pushUserMatch(this.bot);
      for (const target of this.extraBots.values()) {
        pushUserMatch(target);
      }
      if (usernameBots.length > 0) return { bots: usernameBots.filter((bot) => this.isBotUsable(bot)), message: explicitMatch[2] };

      if (/^(?:bot|b)[_-]?[1-9]\d*$/.test(name)) {
        return null;
      }
    }

    if (!this.isBotUsable(this.bot)) return null;

    return {
      bots: [this.bot],
      message: trimmed,
    };
  }

  private startGuardLoop(): void {
    this.stopGuardLoop();
    this.cleanupTimer = setInterval(() => this.cleanupRuntimeMaps(), 60000);
    this.guardTimer = setInterval(() => {
      void this.tickGuard();
    }, 900);
  }

  private stopGuardLoop(): void {
    if (this.guardTimer) clearInterval(this.guardTimer);
    this.guardTimer = null;
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  private cleanupRuntimeMaps(): void {
    const cutoff = Date.now() - 2 * 60 * 1000;
    for (const [key, timestamp] of this.lastCommandTimes) {
      if (timestamp < cutoff) this.lastCommandTimes.delete(key);
    }
    for (const [key, timestamp] of this.recentChatKeys) {
      if (timestamp < cutoff) this.recentChatKeys.delete(key);
    }
  }

  private releaseBusyAndFlushPending(): void {
    this.busy = false;
    const pending = this.pendingCommand;
    this.pendingCommand = null;
    if (pending) void this.handleChatMessage(pending.username, pending.message);
  }

  private async tickGuard(): Promise<void> {
    if (!this.bot || this.busy) return;
    if (this.idleMode || this.companionFollow) {
      await this.tickIdle();
      return;
    }

    if (this.guard) {
      const mob = nearestHostile(this.bot);
      if (!mob) return;

      this.busy = true;
      this.automationCancelled = false;
      this.sayContext('nearbyMonster', 30000);
      this.sayContext('monsterAttack', 30000);
      this.sayContext('stayClose', 30000);
      try {
        await attackTarget(this.bot, 'hostile', () => this.automationCancelled);
        if (this.guard && this.followUser && this.bot) {
          await followPlayer(this.bot, this.followUser, 3);
        }
      } catch {
        // ignore
      } finally {
        this.releaseBusyAndFlushPending();
      }
      return;
    }
    return;
  }

  private async tickPassiveActivity(): Promise<void> {
    await this.passiveIdleInteractions();
  }

  private async tickIdle(): Promise<void> {
    if (!this.bot || this.busy) return;
    const followName = this.followTargetName();
    const player = followName ? this.bot.players[followName]?.entity : null;

    if (player) {
      const botWithVehicle = this.bot as Bot & { vehicle?: unknown };
      const playerWithVehicle = player as typeof player & { vehicle?: unknown };
      if (playerWithVehicle.vehicle && !botWithVehicle.vehicle) {
        await rideVehicle(this.bot, this.lastPlayer).catch(() => undefined);
        return;
      }
      if (!playerWithVehicle.vehicle && botWithVehicle.vehicle) {
        await exitVehicle(this.bot).catch(() => undefined);
        return;
      }
      const playerSleeping = Boolean((player as typeof player & { isSleeping?: boolean }).isSleeping);
      if (playerSleeping && !this.bot.isSleeping && !this.bot.time.isDay) {
        await goToBed(this.bot).catch(() => undefined);
        return;
      }
      const distance = player.position.distanceTo(this.bot.entity.position);

      if (distance <= 180) {
        if (distance > 3) {
          await followPlayer(this.bot, followName, 3);
          return;
        }

        await this.bot.lookAt(player.position.offset(0, player.height, 0));
        return;
      }
    }

    return;
  }

  private followTargetName(): string {
    if (this.lastPlayer && this.bot?.players[this.lastPlayer]?.entity) return this.lastPlayer;
    const botNames = this.knownBotUsernames();
    const nearest = Object.values(this.bot?.players ?? {})
      .filter((player) => player.entity && !botNames.has(player.username.toLowerCase()))
      .sort((a, b) => a.entity!.position.distanceTo(this.bot!.entity.position) - b.entity!.position.distanceTo(this.bot!.entity.position))[0];
    if (nearest) this.lastPlayer = nearest.username;
    return this.lastPlayer;
  }

  private async runSurvivalBrain(): Promise<void> {
    if (!this.bot) return;
    await this.survivalBrain.tick(this.bot, (text) => this.say(text), () => this.automationCancelled);
  }

  private async tickExtraBrains(): Promise<void> {
    if (this.pendingCommand || this.disconnecting) return;
    const playerName = this.lastPlayer || this.primaryName;
    for (const [index, extra] of [...this.extraBots.entries()]) {
      if (!this.isBotUsable(extra)) continue;
      const brain = this.extraBrains.get(index);
      if (!brain) continue;
      if (this.extraBrainRunning.has(index)) continue;
      const player = extra.players[playerName]?.entity;
      if (player && player.position.distanceTo(extra.entity.position) > 14) {
        await followPlayer(extra, playerName, 5).catch(() => undefined);
        continue;
      }
      this.extraBrainRunning.add(index);
      try {
        await brain.tick(
          extra,
          (text) => this.sayFrom(extra, text),
          () => this.automationCancelled || this.pendingCommand !== null
        );
      } finally {
        this.extraBrainRunning.delete(index);
      }
    }
  }

  private setSurvivalMode(mode: 'off' | 'continue' | 'begin'): string {
    return this.survivalBrain.setMode(mode);
  }

  private async passiveIdleInteractions(): Promise<void> {
    if (!this.bot) return;

    const now = Date.now();
    const inactivityMs = now - this.lastActivityAt;
    const noMessageForThreeMinutes = inactivityMs >= 3 * 60 * 1000;
    const player = this.lastPlayer ? this.bot.players[this.lastPlayer]?.entity : null;

    if (player) {
      const currentPosition = player.position;
      if (!this.lastPlayerPosition) {
        this.lastPlayerPosition = { x: currentPosition.x, y: currentPosition.y, z: currentPosition.z };
      } else {
        const moved = Math.hypot(
          currentPosition.x - this.lastPlayerPosition.x,
          currentPosition.y - this.lastPlayerPosition.y,
          currentPosition.z - this.lastPlayerPosition.z
        ) > 0.25;

        if (moved) {
          this.lastPlayerPosition = { x: currentPosition.x, y: currentPosition.y, z: currentPosition.z };
          this.lastPlayerMoveAt = now;
        }
      }
    }

    const noMoveForThirtySeconds = player ? now - this.lastPlayerMoveAt >= 30 * 1000 : false;

    if (!noMessageForThreeMinutes && !noMoveForThirtySeconds) {
      await this.passiveMobScan();
      return;
    }

    const textParts: string[] = [];
    const foodResult = await collectNearbyFood(this.bot);
    if (foodResult && foodResult.trim()) textParts.push(foodResult);

    const chestResult = await depositFoodToChest(this.bot);
    if (chestResult && chestResult.trim()) textParts.push(chestResult);

    const position = this.bot.entity.position;
    textParts.push(`I am at ${Math.floor(position.x)}, ${Math.floor(position.y)}, ${Math.floor(position.z)}.`);

    const text = textParts.join(' ');
    this.say(text);

    await this.passiveMobScan();
  }

  private async passiveMobScan(): Promise<void> {
    if (!this.bot) return;
    const now = Date.now();
    if (now - this.lastPassiveScanAt < 15000) return;
    this.lastPassiveScanAt = now;

    const nearby = nearestHostile(this.bot);
    if (nearby) {
      if (nearby.position.distanceTo(this.bot.entity.position) > 5) {
        this.sayContext('nearbyMonster', 30000);
        return;
      }
      const name = nearby.name ?? 'monster';
      const mobKey = `${nearby.id}:${name}`;
      if (mobKey === this.lastPassiveMobKey && Date.now() - this.lastPassiveMobAt < 30000) return;
      this.lastPassiveMobKey = mobKey;
      this.lastPassiveMobAt = Date.now();
      const spoken = this.voiceHelpLanguage === 'ar'
        ? `وجدت ${name}. سأهاجمه الآن.`
        : `I found a ${name}. I am going to fight it.`;
      this.say(spoken, this.passiveMobVoicePath(name));
      await attackTarget(this.bot, 'hostile');
      return;
    }

    const villager = this.bot.nearestEntity((entity) => entity.name === 'villager' && entity.position.distanceTo(this.bot!.entity.position) < 32);
    if (villager) {
      this.sayContext('village');
      return;
    }

    const fish = this.bot.nearestEntity((entity) => ['cod', 'salmon', 'tropical_fish', 'pufferfish'].includes(String(entity.name ?? '').toLowerCase()) && entity.position.distanceTo(this.bot!.entity.position) < 20);
    if (fish) {
      this.sayContext('fish');
      return;
    }

    const foodAnimal = nearestFoodAnimal(this.bot);
    if (foodAnimal) {
      const animalName = foodAnimal.name;
      const label = animalName === 'cow'
        ? 'cow'
        : animalName === 'sheep'
          ? 'sheep'
          : animalName === 'pig'
            ? 'pig'
            : animalName === 'chicken'
              ? 'chicken'
              : animalName === 'rabbit'
                ? 'rabbit'
                : animalName;

      const foodMessages = [
        `I found a ${label}. I am checking it for food.`,
        `I found food nearby from a ${label}.`,
        `I found dinner: ${label}.`,
      ];
      const index = this.passiveVoiceIndex.get(`food:${label}`) ?? 0;
      const spoken = foodMessages[index % foodMessages.length];
      this.passiveVoiceIndex.set(`food:${label}`, index + 1);
      this.say(spoken);
      return;
    }

    const diamondIds = resolveBlockVariants('diamond_ore').map((name) => this.bot!.registry.blocksByName[name]?.id).filter((id): id is number => typeof id === 'number');
    if (diamondIds.length && this.bot.findBlock({ matching: diamondIds, maxDistance: 16 })) {
      this.sayContext('diamond', 120000);
      return;
    }

    const foodItem = this.bot.inventory.items().find((item) => isFoodItem(item.name));
    if (foodItem) {
      const eaten = await this.bot.consume().catch(() => null);
      if (eaten !== null) {
        const text = `I found food in my inventory and ate ${foodItem.name.replace(/_/g, ' ')}.`;
        this.say(text);
      }
    } else if (this.bot.food !== undefined && this.bot.food <= 8) {
      this.sayContext('hungry', 90000);
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

  async processCommand(username: string, message: string): Promise<void> {
    await this.handleChatMessage(username, message);
  }

  private async handleChatMessage(username: string, message: string): Promise<void> {
    const normalized = message.trim();
    if (!normalized) return;
    const dedupeKey = `${username.toLowerCase()}::${normalized.toLowerCase()}`;
    const now = Date.now();
    const lastSeen = this.lastCommandTimes.get(dedupeKey) ?? 0;
    if (now - lastSeen < 1800) {
      return;
    }
    this.lastCommandTimes.set(dedupeKey, now);

    if (this.busy) {
      if (/\bstf$/i.test(normalized)) {
        this.automationCancelled = true;
        this.pendingCommand = null;
        this.setSurvivalMode('off');
        this.say('Automatic survival mode is off.');
        return;
      }
      this.automationCancelled = true;
      this.pendingCommand = { username, message: normalized };
      this.idleMode = false;
      this.guard = false;
      this.commandEngine.interrupt();
      this.bot?.pathfinder.setGoal(null);
      this.bot?.clearControlStates();
      return;
    }
    this.busy = true;
    try {
      this.lastActivityAt = Date.now();
      this.lastPlayerMoveAt = Date.now();
      this.lastPlayerPosition = null;

      const resolved = this.resolveTargets(message);
      if (!resolved) return;

      const targetBots = resolved.bots.filter((bot) => this.isBotUsable(bot));
      if (targetBots.length === 0) return;

      const commandMessage = resolved.message;
      this.lastPlayer = username;

      const inventoryNumber = Number(commandMessage.trim());
      if (this.inventoryListOpen && Number.isInteger(inventoryNumber) && inventoryNumber > 0) {
        this.inventoryListOpen = false;
        this.say('I will give you that item.');
        for (const targetBot of targetBots) {
          this.sayFrom(targetBot, await tossInventoryIndex(targetBot, username, inventoryNumber));
        }
        return;
      }

      if (isMenuOpenPhrase(commandMessage)) {
        this.inventoryListOpen = false;
        await this.publishMenu(username, menuPageFromMessage(commandMessage) ?? 1);
        return;
      }

      const entries = buildMenuEntries(this.commandEngine.getCommands());
      const picked = pickMenuEntry(entries, commandMessage, this.menuPage);
      if (picked) {
        const targetBot = targetBots[0] ?? this.bot;
        if (targetBot && this.isBotUsable(targetBot)) {
          this.automationCancelled = true;
          this.pendingCommand = { username, message: `${targetBot.username} ${picked.phrase}` };
          this.bot?.pathfinder.setGoal(null);
          this.bot?.clearControlStates();
        }
        return;
      }

      const { saved, intent } = this.commandEngine.resolve(commandMessage);
      if (!intent) return;

      if (intent.actionType === 'survivalControl') {
        const mode = String(intent.actionParams.mode ?? 'continue') as 'off' | 'continue' | 'begin';
        const result = this.setSurvivalMode(mode);
        for (const targetBot of targetBots) {
          this.sayFrom(targetBot, result, undefined, true);
        }
        return;
      }

      const firstBotVoice = targetBots[0] ? this.voiceForBot(targetBots[0]) : this.voiceHelpVoice;
      const builtinVoicePath = this.builtinVoicePathForPhrase(commandMessage, firstBotVoice);

      if (intent.actionType === 'showMenu') {
        await this.publishMenu(username);
        return;
      }

      const isStopOrStay = intent.actionType === 'stop' || intent.actionType === 'stay';
      const isFollowCommand = intent.actionType === 'followPlayer' || intent.actionType === 'followGuard';

      this.guard = intent.actionType === 'followGuard';
      this.idleMode = isFollowCommand;
      if (this.idleMode) this.idleTaskAt = Date.now() + 45000;

      this.followUser = isFollowCommand ? username : '';
      if (!isStopOrStay) this.companionFollow = true;

      if (isStopOrStay) {
        this.guard = false;
        this.followUser = '';
        this.idleMode = false;
        this.companionFollow = false;
      }

      for (const targetBot of targetBots) {
        if (!this.isBotUsable(targetBot)) continue;
        const botVoice = this.voiceForBot(targetBot);
        const voiceVariant = saved?.voiceStartVariants?.[`${this.voiceHelpLanguage}:${botVoice}`];
        const botBuiltinVoicePath = this.builtinVoicePathForPhrase(commandMessage, botVoice);
        this.sayFrom(
          targetBot,
          intent.startText,
          botBuiltinVoicePath || builtinVoicePath || this.resolveVoicePath(voiceVariant) || this.resolveVoicePath(saved?.voiceStartPath) || this.resolveVoicePath(saved?.voiceResponsePath)
        );
        const result = await this.commandEngine.execute(targetBot, intent, username);
        if (intent.actionType === 'showInventory') this.inventoryListOpen = true;
        const done = result || intent.doneText;
        if (done && done !== intent.startText) {
          this.sayFrom(targetBot, done, this.resolveVoicePath(saved?.voiceDonePath), false);
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const allBots = [this.bot, ...Array.from(this.extraBots.values())].filter(Boolean) as Bot[];
      for (const targetBot of allBots) {
        if (!this.isBotUsable(targetBot)) continue;
        this.sayFrom(targetBot, `I failed: ${errorMsg}`, undefined, false);
      }
    } finally {
      this.automationCancelled = false;
      this.releaseBusyAndFlushPending();
    }
  }
}
