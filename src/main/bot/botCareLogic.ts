import { Bot } from 'mineflayer';
import { nearestHostile } from './skills';
import { WorldMemory } from './worldMemory';

export type CareDecision =
  | { type: 'return-to-player'; playerName: string; distance: number; reason: string }
  | { type: 'defend'; reason: string }
  | { type: 'eat'; reason: string }
  | { type: 'sleep'; reason: string }
  | { type: 'repair-tools'; reason: string }
  | { type: 'work'; reason: string };

const MAX_PLAYER_DISTANCE = 30;
const LOW_FOOD_LEVEL = 8;

export class BotCareLogic {
  inspect(bot: Bot, memory: WorldMemory): CareDecision {
    const player = this.nearestPlayer(bot);
    if (player) {
      memory.observePlayer(bot, player.username);
      const distance = player.entity!.position.distanceTo(bot.entity.position);
      if (distance > MAX_PLAYER_DISTANCE) {
        return {
          type: 'return-to-player',
          playerName: player.username,
          distance,
          reason: 'The player is more than 30 blocks away.',
        };
      }
    }

    const danger = nearestHostile(bot, 16);
    if (danger && danger.position.distanceTo(bot.entity.position) <= 6) {
      memory.rememberDanger(danger.name ?? 'monster', danger.position);
      return { type: 'defend', reason: 'A visible hostile is close enough to engage.' };
    }

    if (bot.food <= LOW_FOOD_LEVEL) {
      return { type: 'eat', reason: 'Food level is low.' };
    }

    if (!bot.time.isDay) {
      return { type: 'sleep', reason: 'It is night.' };
    }

    if (this.hasBrokenOrMissingMainTool(bot)) {
      return { type: 'repair-tools', reason: 'A main tool is missing or nearly broken.' };
    }

    return { type: 'work', reason: 'No urgent care is needed.' };
  }

  private nearestPlayer(bot: Bot) {
    return Object.values(bot.players)
      .filter((player) => Boolean(player.entity))
      .sort((a, b) => a.entity!.position.distanceTo(bot.entity.position) - b.entity!.position.distanceTo(bot.entity.position))[0] ?? null;
  }

  private hasBrokenOrMissingMainTool(bot: Bot): boolean {
    const names = ['sword', 'pickaxe', 'axe'];
    return names.some((kind) => {
      const item = bot.inventory.items().find((entry) => entry.name.includes(kind));
      if (!item) return true;
      const durabilityUsed = Number((item as typeof item & { durabilityUsed?: number }).durabilityUsed ?? 0);
      const maxDurability = Number((item as typeof item & { maxDurability?: number }).maxDurability ?? 0);
      return maxDurability > 0 && maxDurability - durabilityUsed <= 2;
    });
  }
}
