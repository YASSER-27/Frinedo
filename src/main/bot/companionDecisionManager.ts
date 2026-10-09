import { Bot } from 'mineflayer';
import { nearestHostile } from './skills';
import { WorldMemory } from './worldMemory';

export type CompanionDecision =
  | { type: 'defend'; reason: string }
  | { type: 'stay-close'; reason: string }
  | { type: 'eat'; reason: string }
  | { type: 'sleep'; reason: string }
  | { type: 'work'; reason: string };

export class CompanionDecisionManager {
  constructor(private readonly memory: WorldMemory) {}

  decide(bot: Bot): CompanionDecision {
    const danger = nearestHostile(bot);
    if (danger) {
      this.memory.rememberDanger(danger.name ?? 'monster', danger.position);
      return { type: 'defend', reason: 'A visible nearby hostile is an immediate threat.' };
    }

    const player = this.memory.getSnapshot().playerPosition;
    if (player && Math.hypot(player.x - bot.entity.position.x, player.z - bot.entity.position.z) > 14) {
      return { type: 'stay-close', reason: 'The player is too far away.' };
    }

    if (bot.food <= 8) return { type: 'eat', reason: 'Food is low.' };
    if (!bot.time.isDay) return { type: 'sleep', reason: 'It is night.' };
    return { type: 'work', reason: 'The area is safe and survival work can continue.' };
  }
}