import { Bot } from 'mineflayer';
import { goals } from 'mineflayer-pathfinder';

export async function followPlayer(
  bot: Bot,
  username: string,
  distance = 3
): Promise<string> {
  const target = bot.players[username]?.entity;
  if (!target) {
    return `Player "${username}" not found.`;
  }

  const goal = new goals.GoalFollow(target, distance);
  bot.pathfinder.setGoal(goal, true);
  return `Following ${username} at distance ${distance}.`;
}
