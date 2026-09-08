import { Bot } from 'mineflayer';

export async function stop(bot: Bot): Promise<string> {
  bot.pathfinder.setGoal(null);
  bot.clearControlStates();
  return 'Stopped all actions.';
}
