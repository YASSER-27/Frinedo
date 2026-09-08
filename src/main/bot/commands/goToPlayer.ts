import { Bot } from 'mineflayer';
import { goals } from 'mineflayer-pathfinder';

export async function goToPlayer(
  bot: Bot,
  username: string,
  distance = 2
): Promise<string> {
  const target = bot.players[username]?.entity;
  if (!target) {
    return `Player "${username}" not found.`;
  }

  const goal = new goals.GoalNear(
    target.position.x,
    target.position.y,
    target.position.z,
    distance
  );
  bot.pathfinder.setGoal(goal);
  return `Going to ${username}.`;
}
