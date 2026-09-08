import { Bot } from 'mineflayer';

export async function jump(bot: Bot): Promise<string> {
  bot.setControlState('jump', true);
  setTimeout(() => bot.setControlState('jump', false), 250);
  return 'Jumped!';
}

export async function stay(bot: Bot, seconds = 30): Promise<string> {
  bot.pathfinder.setGoal(null);
  bot.clearControlStates();
  if (seconds > 0) {
    setTimeout(() => {}, seconds * 1000);
  }
  return seconds > 0 ? `Staying for ${seconds} seconds.` : 'Staying here.';
}

export async function lookAtPlayer(bot: Bot, username: string): Promise<string> {
  const entity = bot.players[username]?.entity;
  if (!entity) return `Player "${username}" not found.`;
  await bot.lookAt(entity.position.offset(0, entity.height, 0));
  return `Looking at ${username}.`;
}

export async function attackNearest(bot: Bot, entityType: string): Promise<string> {
  const entity = bot.nearestEntity(
    (e) => e.name === entityType || (e.displayName?.toLowerCase().includes(entityType) ?? false)
  );
  if (!entity) return `No ${entityType} found nearby.`;
  await bot.attack(entity);
  return `Attacking ${entityType}!`;
}

export async function equipItem(bot: Bot, itemName: string): Promise<string> {
  const item = bot.inventory.items().find((i) => i.name.includes(itemName.replace(/ /g, '_')));
  if (!item) return `Item "${itemName}" not in inventory.`;
  await bot.equip(item, 'hand');
  return `Equipped ${item.name}.`;
}

export async function consumeItem(bot: Bot, itemName: string): Promise<string> {
  const item = bot.inventory.items().find((i) => i.name.includes(itemName.replace(/ /g, '_')));
  if (!item) return `Item "${itemName}" not in inventory.`;
  await bot.equip(item, 'hand');
  await bot.consume();
  return `Consumed ${item.name}.`;
}

export async function goToBed(bot: Bot): Promise<string> {
  const bedId = bot.registry.blocksByName.red_bed?.id ?? bot.registry.blocksByName.bed?.id;
  if (bedId === undefined) return 'Bed block not found in registry.';

  const beds = bot.findBlocks({ matching: bedId, maxDistance: 32, count: 1 });
  if (beds.length === 0) return 'No bed found nearby.';

  const bed = bot.blockAt(beds[0]);
  if (!bed) return 'Bed not accessible.';

  try {
    await bot.sleep(bed);
    return 'Good night!';
  } catch {
    return 'Could not sleep in bed.';
  }
}
