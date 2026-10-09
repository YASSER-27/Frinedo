import { Bot } from 'mineflayer';
import { ActionType, BotCommand, ParsedIntent } from '../../shared/types';
import { parseChat } from '../../shared/parseCommand';
import * as skills from './skills';

const NEW_BUILTIN_COMMANDS: BotCommand[] = [
  { id: 'builtin-survival-start', triggerPhrases: ['str', 'srt'], actionType: 'survivalControl', actionParams: { mode: 'continue' }, responseStart: 'I will continue my survival tasks.', responseDone: 'Survival mode is on.', isBuiltIn: true },
  { id: 'builtin-survival-off', triggerPhrases: ['stf'], actionType: 'survivalControl', actionParams: { mode: 'off' }, responseStart: 'I will stop automatic survival tasks.', responseDone: 'Survival mode is off.', isBuiltIn: true },
  { id: 'builtin-survival-continue', triggerPhrases: ['sct'], actionType: 'survivalControl', actionParams: { mode: 'continue' }, responseStart: 'I will continue from my current stage.', responseDone: 'Survival stage preserved.', isBuiltIn: true },
  { id: 'builtin-survival-begin', triggerPhrases: ['stbe'], actionType: 'survivalControl', actionParams: { mode: 'begin' }, responseStart: 'I will restart survival from the beginning.', responseDone: 'Survival stage reset.', isBuiltIn: true },
  { id: 'builtin-take-front', triggerPhrases: ['this', 'take this', 'خذ هذا', 'خد هذا'], actionType: 'takeFrontItem', actionParams: {}, responseStart: 'I will take what is in front of me.', responseDone: 'I picked it up.', isBuiltIn: true },
  { id: 'builtin-stay-awake', triggerPhrases: ['up', 'wake up', 'stay awake', 'لا تنم', 'استيقظ'], actionType: 'wakeUp', actionParams: {}, responseStart: 'I will stay awake.', responseDone: 'I am awake.', isBuiltIn: true },
  { id: 'builtin-go-attack', triggerPhrases: ['go', 'go attack', 'attack', 'هاجم', 'اهجم'], actionType: 'attack', actionParams: { entityType: 'hostile' }, responseStart: 'I am attacking the nearby monster.', responseDone: 'The attack is over.', isBuiltIn: true },
  { id: 'builtin-build-house-request', triggerPhrases: ['build me a house', 'ابني لي منزلا'], actionType: 'buildHouse', actionParams: {}, responseStart: 'I will build a house.', responseDone: 'The house is ready.', isBuiltIn: true },
  { id: 'builtin-hide', triggerPhrases: ['we should hide', 'يجب علينا الاختباء'], actionType: 'custom', actionParams: {}, responseStart: 'We should hide here.', responseDone: '', isBuiltIn: true },
  { id: 'builtin-need-sleep', triggerPhrases: ['you should sleep', 'يجب عليك ان تنام', 'يجب عليك أن تنام'], actionType: 'goToBed', actionParams: {}, responseStart: 'You should sleep.', responseDone: '', isBuiltIn: true },
  { id: 'builtin-need-anything', triggerPhrases: ['do you need anything', 'اتحتاج شيء', 'أتحتاج شيئًا'], actionType: 'custom', actionParams: {}, responseStart: 'Do you need anything?', responseDone: 'Choose: 10 wood blocks, cave stone, or food.', isBuiltIn: true },
  { id: 'builtin-anything-task', triggerPhrases: ['i can do anything', 'سأفعل أي شيء'], actionType: 'custom', actionParams: {}, responseStart: 'I can do anything. Choose a task.', responseDone: 'Choose: go fishing, bring 10 fish, bring food, bring fire, or bring water.', isBuiltIn: true },
  { id: 'builtin-need-map', triggerPhrases: ['i need a map', 'احتاج خريطة', 'أحتاج خريطة'], actionType: 'custom', actionParams: {}, responseStart: 'I need a map. Do you have one?', responseDone: '', isBuiltIn: true },
  { id: 'builtin-reach-dragon', triggerPhrases: ['we must reach the dragon', 'يجب ان نصل للتنين', 'يجب أن نصل للتنين'], actionType: 'custom', actionParams: {}, responseStart: 'We must reach the dragon.', responseDone: '', isBuiltIn: true },
];

export class CommandEngine {
  private commands: BotCommand[] = [];
  private interrupted = false;

  private shortAlias(message: string): ParsedIntent | null {
    const aliases: Record<string, ParsedIntent> = {
      flw: { actionType: 'followPlayer', actionParams: { distance: 3 }, label: 'Follow player', startText: 'Okay, following you.', doneText: 'I am right behind you.' },
      dlw: { actionType: 'followPlayer', actionParams: { distance: 3 }, label: 'Follow player', startText: 'Okay, following you.', doneText: 'I am right behind you.' },
      fol: { actionType: 'followPlayer', actionParams: { distance: 3 }, label: 'Follow player', startText: 'Okay, following you.', doneText: 'I am right behind you.' },
      stp: { actionType: 'stop', actionParams: {}, label: 'Stop', startText: 'Stopping now.', doneText: 'All actions stopped.' },
      hold: { actionType: 'stay', actionParams: {}, label: 'Stop here', startText: 'Stopping right here.', doneText: 'I am holding this exact spot.' },
      wood: { actionType: 'collectBlocks', actionParams: { blockType: 'oak_log', count: 10 }, label: 'Collect wood', startText: 'Okay, I will get 10 oak log.', doneText: 'Finished collecting oak log.' },
      stn: { actionType: 'collectBlocks', actionParams: { blockType: 'stone', count: 10 }, label: 'Collect stone', startText: 'Okay, I will get 10 stone.', doneText: 'Finished collecting stone.' },
      cbl: { actionType: 'collectBlocks', actionParams: { blockType: 'cobblestone', count: 10 }, label: 'Collect cobblestone', startText: 'Okay, I will get 10 cobblestone.', doneText: 'Finished collecting cobblestone.' },
      grv: { actionType: 'collectBlocks', actionParams: { blockType: 'gravel', count: 10 }, label: 'Collect gravel', startText: 'Okay, I will get 10 gravel.', doneText: 'Finished collecting gravel.' },
      dirt: { actionType: 'collectBlocks', actionParams: { blockType: 'dirt', count: 10 }, label: 'Collect dirt', startText: 'Okay, I will get 10 dirt.', doneText: 'Finished collecting dirt.' },
      fish: { actionType: 'fish', actionParams: {}, label: 'Go fishing', startText: 'I will go fishing nearby.', doneText: 'Fishing finished.' },
      inv: { actionType: 'showInventory', actionParams: {}, label: 'Show inventory', startText: 'Here is everything I have.', doneText: '' },
      jump: { actionType: 'jump', actionParams: {}, label: 'Jump', startText: 'I will jump.', doneText: 'Jump finished.' },
      flee: { actionType: 'runAway', actionParams: {}, label: 'Run away', startText: 'Running away from danger.', doneText: 'I am safe for now.' },
      this: { actionType: 'takeFrontItem', actionParams: {}, label: 'Take the item in front', startText: 'I will take what is in front of me.', doneText: 'I picked it up.' },
      up: { actionType: 'wakeUp', actionParams: {}, label: 'Stay awake', startText: 'I will stay awake.', doneText: 'I am awake.' },
      go: { actionType: 'attack', actionParams: { entityType: 'hostile' }, label: 'Attack nearby monster', startText: 'I am attacking the nearby monster.', doneText: 'The attack is over.' },
      ride: { actionType: 'rideVehicle', actionParams: {}, label: 'Ride vehicle', startText: 'I will get on the vehicle.', doneText: 'I am riding with you.' },
      out: { actionType: 'exitVehicle', actionParams: {}, label: 'Exit vehicle', startText: 'I will get out of the vehicle.', doneText: 'I left the vehicle.' },
    };
    return aliases[message.trim().toLowerCase()] ?? null;
  }

  setCommands(commands: BotCommand[]): void {
    const existing = new Set(commands.map((command) => command.id));
    this.commands = [...commands, ...NEW_BUILTIN_COMMANDS.filter((command) => !existing.has(command.id))];
  }

  getCommands(): BotCommand[] {
    return this.commands;
  }

  interrupt(): void {
    this.interrupted = true;
  }

  clearInterrupt(): void {
    this.interrupted = false;
  }

  isInterrupted(): boolean {
    return this.interrupted;
  }

  matchSaved(message: string): BotCommand | null {
    const lower = message.toLowerCase();
    let best: BotCommand | null = null;
    let bestLen = 0;
    for (const command of this.commands) {
      for (const phrase of command.triggerPhrases) {
        const p = phrase.toLowerCase();
        if (lower.includes(p) && p.length > bestLen) {
          best = command;
          bestLen = p.length;
        }
      }
    }
    return best;
  }

  resolve(message: string): { saved: BotCommand | null; intent: ParsedIntent | null } {
    const saved = this.matchSaved(message);
    const intent = parseChat(message);
    const fallback = this.shortAlias(message);
    if (saved && intent) {
      return {
        saved,
        intent: {
          ...intent,
          actionType: saved.actionType,
          actionParams: { ...intent.actionParams, ...saved.actionParams },
          startText: saved.responseStart || saved.responseText || intent.startText,
          doneText: saved.responseDone || intent.doneText,
        },
      };
    }
    if (saved) {
      return {
        saved,
        intent: {
          actionType: saved.actionType,
          actionParams: saved.actionParams ?? {},
          label: saved.actionType,
          startText: saved.responseStart || saved.responseText || '',
          doneText: saved.responseDone || '',
        },
      };
    }
    return { saved: null, intent: intent ?? fallback };
  }

  async execute(
    bot: Bot,
    intent: ParsedIntent,
    username: string
  ): Promise<string> {
    this.clearInterrupt();
    const params = intent.actionParams;
    const action = intent.actionType as ActionType;

    switch (action) {
      case 'stop':
        this.interrupt();
        return skills.hardStop(bot);
      case 'stay':
        this.interrupt();
        return skills.stayHere(bot);
      case 'followPlayer':
      case 'followGuard':
        return skills.followPlayer(bot, username, Number(params.distance ?? 3));
      case 'goToPlayer':
        return skills.goToPlayer(bot, username, Number(params.distance ?? 2));
      case 'collectBlocks': {
        const blockType = String(params.blockType ?? 'oak_log');
        const count = Number(params.count ?? 10);
        const collected = await skills.collectByName(bot, blockType, count);
        if (bot.players[username]?.entity) {
          const delivered = await skills.tossToPlayer(bot, username, blockType, count);
          return `${collected} ${delivered}`;
        }
        return collected;
      }
      case 'searchBlock':
        return skills.searchBlock(bot, String(params.blockType ?? 'diamond_ore'));
      case 'giveItem':
        return skills.tossToPlayer(
          bot,
          username,
          String(params.itemName ?? 'sword'),
          Number(params.count ?? 1)
        );
      case 'giveAll':
        return skills.tossEverything(bot, username);
      case 'craft':
        return skills.craftItem(
          bot,
          String(params.itemName ?? 'furnace'),
          Number(params.count ?? 1)
        );
      case 'placeBlock':
        return skills.placeNearby(bot, String(params.itemName ?? 'furnace'));
      case 'buildHouse':
        return skills.buildHouse(bot, username);
      case 'rideVehicle':
        return skills.rideVehicle(bot, username);
      case 'exitVehicle':
        return skills.exitVehicle(bot);
      case 'attack':
        return skills.attackTarget(bot, String(params.entityType ?? 'hostile'));
      case 'takeFrontItem':
        return skills.takeFrontItem(bot);
      case 'wakeUp':
        return skills.wakeUp(bot);
      case 'goToBed':
        return skills.goToBed(bot);
      case 'eat':
        return skills.eatFood(bot);
      case 'jump':
        return skills.jumpOnce(bot);
      case 'equip':
        return skills.equipBest(bot, String(params.itemName ?? 'sword'));
      case 'showInventory':
        return skills.inventoryReport(bot);
      case 'runAway':
        return skills.runAway(bot);
      case 'findEntity':
        return skills.findEntity(bot, String(params.query ?? 'village'));
      case 'saveLocation':
        return `Saved ${String(params.name ?? 'place')} at ${Math.floor(bot.entity.position.x)} ${Math.floor(bot.entity.position.y)} ${Math.floor(bot.entity.position.z)}.`;
      case 'showLocation':
        return skills.showLocation(bot);
      case 'here':
        return skills.here(bot, String(params.mode ?? 'work'));
      case 'sit':
        return skills.sit(bot);
      case 'crouch':
        return skills.crouch(bot);
      case 'prone':
        return skills.prone(bot);
      case 'jumpRepeated':
        return skills.jumpRepeated(bot, Number(params.count ?? 5));
      case 'dropHeld':
        return skills.dropHeld(bot);
      case 'helpGuide':
        {
          const requested = String(params.itemName ?? 'crafting_table');
          const target = requested === 'sword' ? 'wooden_sword' : requested === 'pickaxe' ? 'wooden_pickaxe' : requested;
          const guide = skills.helpGuide(bot, target);
          const result = await skills.craftItem(bot, target, 1);
          return `${guide} ${result}`;
        }
      case 'fish':
        return skills.fish(bot);
      case 'tame':
        return skills.tameAnimal(bot, String(params.animal ?? 'wolf'));
      case 'farm':
        return skills.farmNearby(bot);
      case 'showMenu':
        return 'Menu sent.';
      case 'custom':
        return intent.doneText || intent.startText;
      default:
        return 'Unknown action.';
    }
  }
}
