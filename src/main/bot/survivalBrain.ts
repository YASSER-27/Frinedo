import { Bot } from 'mineflayer';
import { goals } from 'mineflayer-pathfinder';
import {
  attackTarget,
  collectByName,
  craftItem,
  eatFood,
  collectNearbyFood,
  fish,
  goToBed,
  buildHouse,
  nearestHostile,
  placeNearby,
} from './skills';
import { WorldMemory } from './worldMemory';
import { BotCareLogic } from './botCareLogic';

type BrainPhase = 'wood' | 'table' | 'wood-tools' | 'stone-tools' | 'iron-tools' | 'home';
const BED_NAMES = [
  'white_bed', 'orange_bed', 'magenta_bed', 'light_blue_bed', 'yellow_bed', 'lime_bed',
  'pink_bed', 'gray_bed', 'light_gray_bed', 'cyan_bed', 'purple_bed', 'blue_bed',
  'brown_bed', 'green_bed', 'red_bed', 'black_bed',
];

export class SurvivalBrain {
  private readonly followDistance = 8;
  private readonly maxResourceDistance = 18;
  private enabled = false;
  private phase: BrainPhase = 'wood';
  private nextRunAt = 0;
  private lastSpeechAt = 0;
  private running = false;
  private lastNightSpeechDay: number | null = null;
  private homeBuilt = false;
  private readonly memory = new WorldMemory();
  private readonly careLogic = new BotCareLogic();

  async tick(bot: Bot, speak: (text: string) => void, shouldStop: () => boolean = () => false): Promise<void> {
    if (!this.enabled || this.running) return;
    const now = Date.now();
    if (now < this.nextRunAt || !bot.entity) return;
    this.nextRunAt = now + 12000;
    this.running = true;

    try {
      await this.runTick(bot, speak, shouldStop);
    } finally {
      this.running = false;
    }
  }

  private async runTick(bot: Bot, speak: (text: string) => void, shouldStop: () => boolean): Promise<void> {

    this.memory.observePlayer(bot);
    const care = this.careLogic.inspect(bot, this.memory);

    const hostile = nearestHostile(bot, 16);
    if (hostile) {
      if (hostile.position.distanceTo(bot.entity.position) > 5) {
        bot.pathfinder.setGoal(null);
        this.sayOnce(speak, 'I see a monster nearby, but I will not dig to reach it.');
        return;
      }
      speak('A monster came near us. I am clearing the area before we sleep.');
      await attackTarget(bot, 'hostile', shouldStop);
      this.memory.clearDanger();
      this.nextRunAt = Date.now() + 5000;
      return;
    }

    if (care.type === 'return-to-player') {
      const player = bot.players[care.playerName]?.entity;
      if (player) bot.pathfinder.setGoal(new goals.GoalFollow(player, this.followDistance), true);
      this.sayOnce(speak, 'You are too far away. I am coming back to you.');
      return;
    }

    if (care.type === 'eat') {
      const result = await eatFood(bot);
      if (!result.startsWith('I have no food')) {
        speak('I am eating so I can keep working.');
        return;
      }
      if (this.hasItem(bot, 'fishing_rod')) {
        const fishingResult = await fish(bot);
        if (fishingResult.startsWith('I caught')) {
          speak('I caught food and will eat when it is ready.');
          return;
        }
      }
      await collectNearbyFood(bot);
      await collectByName(bot, 'oak_log', 2, this.maxResourceDistance, shouldStop);
    }

    const ownedBed = this.findBedItem(bot);
    if (bot.time.isDay === false && ownedBed && !this.hasNearbyBed(bot)) {
      const nearbyThreat = nearestHostile(bot, 16);
      if (nearbyThreat) {
        await this.moveToSaferGround(bot, nearbyThreat.position);
        this.nextRunAt = Date.now() + 3000;
        return;
      }
      await placeNearby(bot, ownedBed.name);
      const bed = this.findNearbyBed(bot);
      if (bed) this.memory.rememberBed(bed.position);
      speak('I placed the bed you gave me.');
      return;
    }

    if (care.type === 'sleep' && this.hasNearbyBed(bot)) {
      const nightThreat = nearestHostile(bot, 16);
      if (nightThreat) {
        speak('The night monster is too close. I am attacking it first.');
        await attackTarget(bot, 'hostile', shouldStop);
        return;
      }
      if (this.lastNightSpeechDay !== bot.time.day) {
        this.lastNightSpeechDay = bot.time.day;
        speak('It is night. I am sleeping with you so morning arrives safely.');
      }
      const sleepResult = await goToBed(bot);
      if (sleepResult.startsWith('Cannot sleep')) {
        await this.moveToSaferGround(bot, bot.entity.position);
      }
      return;
    }

    if (bot.time.isDay && this.hasNearbyBed(bot)) {
      this.lastNightSpeechDay = null;
      const collected = await this.collectNearbyBed(bot);
      if (collected) {
        speak('It is morning. I collected the bed and kept it for tonight.');
        return;
      }
    }

    const items = new Set(bot.inventory.items().map((item) => item.name));
    if (!items.has('oak_log') && !items.has('birch_log') && !items.has('spruce_log')) {
      await collectByName(bot, 'oak_log', 8, this.maxResourceDistance, shouldStop);
      this.sayOnce(speak, 'I am gathering wood by hand first.');
      return;
    }

    if (!this.hasItem(bot, 'crafting_table')) {
      await craftItem(bot, 'oak_planks', 4, shouldStop);
      await craftItem(bot, 'crafting_table', 1, shouldStop);
      await placeNearby(bot, 'crafting_table');
      this.phase = 'table';
      this.sayOnce(speak, 'I made a crafting table.');
      return;
    }

    if (!this.hasAll(bot, ['wooden_pickaxe', 'wooden_axe', 'wooden_sword'])) {
      await craftItem(bot, 'stick', 4, shouldStop);
      await this.craftMissing(bot, ['wooden_pickaxe', 'wooden_axe', 'wooden_sword'], shouldStop);
      this.phase = 'wood-tools';
      speak('My wooden tools are ready.');
      return;
    }

    if (!this.hasAll(bot, ['stone_pickaxe', 'stone_axe', 'stone_sword'])) {
      await collectByName(bot, 'stone', 12, this.maxResourceDistance, shouldStop);
      await this.craftMissing(bot, ['stone_pickaxe', 'stone_axe', 'stone_sword'], shouldStop);
      this.phase = 'stone-tools';
      speak('I upgraded from wood to stone tools.');
      return;
    }

    if (!this.hasItem(bot, 'furnace')) {
      await collectByName(bot, 'cobblestone', 8, this.maxResourceDistance, shouldStop);
      await craftItem(bot, 'furnace', 1, shouldStop);
      await placeNearby(bot, 'furnace');
      speak('I made a furnace for the next upgrade.');
      return;
    }

    if (!this.hasAll(bot, ['iron_pickaxe', 'iron_axe', 'iron_sword'])) {
      await collectByName(bot, 'iron_ore', 9, this.maxResourceDistance, shouldStop);
      await this.smeltIron(bot, shouldStop);
      await this.craftMissing(bot, ['iron_pickaxe', 'iron_axe', 'iron_sword'], shouldStop);
      this.phase = 'iron-tools';
      speak('I upgraded to iron tools.');
      return;
    }

    if (!this.hasItem(bot, 'shield')) {
      await craftItem(bot, 'shield', 1, shouldStop);
      speak('I crafted a shield for protection.');
      return;
    }

    if (!this.hasItem(bot, 'stonecutter')) {
      await collectByName(bot, 'stone', 3, this.maxResourceDistance, shouldStop);
      await craftItem(bot, 'stonecutter', 1, shouldStop);
      await placeNearby(bot, 'stonecutter');
      speak('I built a stonecutter for efficient building.');
      return;
    }

    this.phase = 'home';
    await this.prepareHome(bot, speak, shouldStop);
  }

  reset(): void {
    this.enabled = false;
    this.phase = 'wood';
    this.nextRunAt = 0;
    this.homeBuilt = false;
  }

  setMode(mode: 'off' | 'continue' | 'begin'): string {
    if (mode === 'off') {
      this.enabled = false;
      return 'Automatic survival mode is off.';
    }
    if (mode === 'begin') {
      this.reset();
    } else {
      this.nextRunAt = 0;
    }
    this.enabled = true;
    return mode === 'begin'
      ? 'Automatic survival restarted from the beginning.'
      : 'Automatic survival continued from the current stage.';
  }

  private hasItem(bot: Bot, name: string): boolean {
    return bot.inventory.items().some((item) => item.name === name);
  }

  private nearestPlayer(bot: Bot) {
    return Object.values(bot.players)
      .map((player) => player.entity)
      .filter((entity): entity is NonNullable<typeof entity> => Boolean(entity))
      .sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))[0] ?? null;
  }

  private findBedItem(bot: Bot) {
    return bot.inventory.items().find((item) => BED_NAMES.includes(item.name));
  }

  private hasAny(bot: Bot, names: string[]): boolean {
    return names.some((name) => this.hasItem(bot, name));
  }

  private hasAll(bot: Bot, names: string[]): boolean {
    return names.every((name) => this.hasItem(bot, name));
  }

  private async craftMissing(bot: Bot, names: string[], shouldStop: () => boolean): Promise<void> {
    for (const name of names) {
      if (shouldStop()) return;
      if (!this.hasItem(bot, name)) await craftItem(bot, name, 1, shouldStop);
    }
  }

  private hasNearbyBed(bot: Bot): boolean {
    const bed = this.findNearbyBed(bot);
    if (bed) this.memory.rememberBed(bed.position);
    return Boolean(bed);
  }

  private findNearbyBed(bot: Bot) {
    const beds = Object.values(bot.registry.blocksByName)
      .filter((block) => block.name.includes('bed'))
      .map((block) => block.id);
    return beds.length ? bot.findBlock({ matching: beds, maxDistance: 32 }) : null;
  }

  private async collectNearbyBed(bot: Bot): Promise<boolean> {
    const beds = Object.values(bot.registry.blocksByName)
      .filter((block) => block.name.includes('bed'))
      .map((block) => block.id);
    const bed = beds.length ? bot.findBlock({ matching: beds, maxDistance: 32 }) : null;
    if (!bed) return false;
    try {
      await bot.pathfinder.goto(new goals.GoalNear(bed.position.x, bed.position.y, bed.position.z, 1));
      await bot.dig(bed, true);
      return true;
    } catch {
      return false;
    }
  }

  private async moveToSaferGround(bot: Bot, threatPosition: { x: number; y: number; z: number }): Promise<void> {
    const origin = bot.entity.position;
    const dx = origin.x - threatPosition.x;
    const dz = origin.z - threatPosition.z;
    const distance = Math.max(1, Math.hypot(dx, dz));
    const target = origin.offset((dx / distance) * 10, 0, (dz / distance) * 10);
    try {
      await bot.pathfinder.goto(new goals.GoalNear(target.x, target.y, target.z, 2));
    } catch {
      bot.pathfinder.setGoal(new goals.GoalNear(target.x, target.y, target.z, 2));
    }
  }

  private async smeltIron(bot: Bot, shouldStop: () => boolean = () => false): Promise<void> {
    const furnaceBlock = bot.findBlock({ matching: bot.registry.blocksByName.furnace?.id ?? -1, maxDistance: 16 });
    const ore = bot.inventory.items().find((item) => item.name === 'iron_ore' || item.name === 'deepslate_iron_ore');
    const fuel = bot.inventory.items().find((item) => item.name === 'coal' || item.name === 'charcoal' || item.name === 'oak_log');
    if (!furnaceBlock || !ore || !fuel) return;
    const furnace = await bot.openFurnace(furnaceBlock).catch(() => null);
    if (!furnace) return;
    try {
      await furnace.putInput(ore.type, null, Math.min(ore.count, 9));
      await furnace.putFuel(fuel.type, null, Math.min(fuel.count, 9));
      while (furnace.progress < 1) {
        if (shouldStop()) break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      await furnace.takeOutput();
    } catch {
      // The next brain cycle will retry without interrupting player commands.
    } finally {
      await furnace.close().catch(() => undefined);
    }
  }

  private async prepareHome(bot: Bot, speak: (text: string) => void, shouldStop: () => boolean): Promise<void> {
    if (!this.homeBuilt) {
      const player = Object.values(bot.players).find((entry) => entry.entity);
      if (player) {
        await buildHouse(bot, player.username, shouldStop);
        this.homeBuilt = true;
        this.memory.rememberHome(bot.entity.position);
        speak('I built a small shelter so we can survive here.');
        return;
      }
    }
    const bed = this.findBedItem(bot);
    if (bed) speak('I have a bed ready for the next night.');
    const player = Object.values(bot.players).find((entry) => entry.entity)?.entity;
    if (player && !bot.findBlock({ matching: bot.registry.blocksByName.chest?.id ?? -1, maxDistance: 16 })) {
      bot.pathfinder.setGoal(new goals.GoalNear(player.position.x, player.position.y, player.position.z, 4));
    }
  }

  private sayOnce(speak: (text: string) => void, text: string): void {
    if (Date.now() - this.lastSpeechAt < 60000) return;
    this.lastSpeechAt = Date.now();
    speak(text);
  }
}