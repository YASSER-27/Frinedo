import { Bot } from 'mineflayer';
import { ActionType, BotCommand, ParsedIntent } from '../../shared/types';
import { parseChat } from '../../shared/parseCommand';
import * as skills from './skills';

export class CommandEngine {
  private commands: BotCommand[] = [];
  private interrupted = false;

  setCommands(commands: BotCommand[]): void {
    this.commands = commands.filter((c) => !c.isBuiltIn);
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
    return { saved: null, intent };
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
      case 'collectBlocks':
        return skills.collectByName(
          bot,
          String(params.blockType ?? 'oak_log'),
          Number(params.count ?? 8)
        );
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
      case 'attack':
        return skills.attackTarget(bot, String(params.entityType ?? 'hostile'));
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
