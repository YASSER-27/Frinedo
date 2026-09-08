import { Bot } from 'mineflayer';
import { goals, Movements } from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import { plugin as collectBlockPlugin } from 'mineflayer-collectblock';
import { FOOD_NAMES, HOSTILE_MOBS, resolveBlockVariants } from '../../shared/items';

let collectLoaded = false;

export function ensurePlugins(bot: Bot): void {
  if (!collectLoaded) {
    bot.loadPlugin(collectBlockPlugin);
    collectLoaded = true;
  }
}

export function hardStop(bot: Bot): string {
  bot.pathfinder.setGoal(null);
  bot.clearControlStates();
  return 'Stopped.';
}

export function inventoryReport(bot: Bot): string {
  const items = bot.inventory.items();
  if (items.length === 0) return 'My inventory is empty.';
  return items.map((item, index) => `${index + 1}. ${item.name.replace(/_/g, ' ')} x${item.count}`).join('\n');
}

export async function tossInventoryIndex(bot: Bot, username: string, index: number): Promise<string> {
  const item = bot.inventory.items()[index - 1];
  if (!item) return `There is no inventory item numbered ${index}.`;
  return tossToPlayer(bot, username, item.name, item.count);
}

export function runAway(bot: Bot): string {
  const hostile = nearestHostile(bot);
  if (!hostile) return 'There is no monster close to me.';
  const origin = bot.entity.position;
  const dx = origin.x - hostile.position.x;
  const dz = origin.z - hostile.position.z;
  const length = Math.max(1, Math.sqrt(dx * dx + dz * dz));
  const target = origin.offset((dx / length) * 16, 0, (dz / length) * 16);
  bot.pathfinder.setGoal(new goals.GoalNear(target.x, target.y, target.z, 2));
  return 'I am moving away from the monster.';
}

export async function fish(bot: Bot): Promise<string> {
  const fishBot = bot as Bot & { fish?: () => Promise<void> };
  if (!fishBot.fish) return 'Fishing needs a fishing plugin or a fishing rod helper.';
  try {
    await fishBot.fish();
    return 'I caught a fish.';
  } catch {
    return 'I could not fish here. I need a rod and water nearby.';
  }
}

export async function tameAnimal(bot: Bot, animal: string): Promise<string> {
  const entity = bot.nearestEntity((candidate) => String(candidate.name ?? '').toLowerCase().includes(animal));
  if (!entity) return `I cannot find a ${animal} nearby.`;
  return `I found the ${animal}. Taming requires the correct food in my hand.`;
}

export async function farmNearby(bot: Bot): Promise<string> {
  const cropNames = ['wheat', 'carrots', 'potatoes', 'beetroots'];
  const ids = findBlockNames(bot, cropNames);
  const crop = ids.length ? bot.findBlock({ matching: ids, maxDistance: 32 }) : undefined;
  if (!crop) return 'I cannot find a crop field nearby.';
  await bot.pathfinder.goto(new goals.GoalNear(crop.position.x, crop.position.y, crop.position.z, 2));
  return 'I found a crop field nearby.';
}

export async function findEntity(bot: Bot, query: string): Promise<string> {
  const aliases: Record<string, string[]> = {
    dog: ['wolf'], cat: ['cat'], horse: ['horse'], camel: ['camel'], village: ['villager'],
    flower: ['poppy', 'dandelion', 'allium', 'azure_bluet', 'cornflower', 'blue_orchid'],
    treasure: ['chest', 'barrel'],
    bed: ['bed'],
    potato: ['potatoes', 'potato'], crop: ['wheat', 'carrots', 'potatoes', 'beetroots'],
  };
  const names = aliases[query] ?? [query.replace(/ /g, '_')];
  const entity = bot.nearestEntity((candidate) => names.some((name) =>
    String(candidate.name ?? '').toLowerCase().includes(name)
  ));
  if (entity) {
    await bot.pathfinder.goto(new goals.GoalNear(entity.position.x, entity.position.y, entity.position.z, 2));
    return `I found ${query} nearby.`;
  }
  const blockNames = resolveBlockVariants(query);
  const ids = findBlockNames(bot, blockNames);
  const block = ids.length ? bot.findBlock({ matching: ids, maxDistance: 96 }) : undefined;
  if (!block) return `I could not find ${query} nearby.`;
  await bot.pathfinder.goto(new goals.GoalNear(block.position.x, block.position.y, block.position.z, 2));
  return `I found ${query} nearby.`;
}

export function helpGuide(bot: Bot, itemName: string): string {
  const available = bot.inventory.items().map((item) => item.name).join(', ');
  const guides: Record<string, string> = {
    crafting_table: 'Beginner guide: collect 3 logs, craft planks, then use 4 planks to craft a crafting table. Your inventory has: ' + available,
    wooden_sword: 'Beginner guide: craft planks, craft sticks, then use 2 planks and 1 stick on a crafting table to make a wooden sword.',
    wooden_pickaxe: 'Beginner guide: craft planks and sticks, then use 3 planks and 2 sticks on a crafting table to make a wooden pickaxe.',
  };
  return guides[itemName] ?? 'Beginner guide: collect wood, make planks, make sticks, craft a table, then craft tools from the table.';
}

export async function followPlayer(bot: Bot, username: string, distance = 3): Promise<string> {
  const target = bot.players[username]?.entity;
  if (!target) return `I cannot see ${username}.`;
  bot.pathfinder.setGoal(new goals.GoalFollow(target, distance), true);
  return `Following ${username}.`;
}

export async function goToPlayer(bot: Bot, username: string, distance = 2): Promise<string> {
  const target = bot.players[username]?.entity;
  if (!target) return `I cannot see ${username}.`;
  const p = target.position;
  bot.pathfinder.setGoal(new goals.GoalNear(p.x, p.y, p.z, distance));
  return `Going to ${username}.`;
}

export function stayHere(bot: Bot): string {
  const p = bot.entity.position;
  bot.pathfinder.setGoal(new goals.GoalBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)));
  bot.clearControlStates();
  return `Holding this exact block: ${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)}.`;
}

function findBlockNames(bot: Bot, names: string[]): number[] {
  const ids: number[] = [];
  for (const name of names) {
    const b = bot.registry.blocksByName[name];
    if (b) ids.push(b.id);
  }
  return ids;
}

export async function collectByName(bot: Bot, blockType: string, count: number): Promise<string> {
  ensurePlugins(bot);
  const names = resolveBlockVariants(blockType);
  const ids = findBlockNames(bot, names);
  if (ids.length === 0) return `I do not know the block "${blockType}".`;

  const positions = bot.findBlocks({
    matching: ids,
    maxDistance: 64,
    count: Math.min(count, 48),
  });

  if (positions.length === 0) {
    return `I cannot find any ${blockType.replace(/_/g, ' ')} nearby.`;
  }

  let collected = 0;
  for (const pos of positions) {
    if (collected >= count) break;
    const block = bot.blockAt(pos);
    if (!block) continue;
    try {
      await bot.collectBlock.collect(block);
      collected += 1;
    } catch {
      try {
        await bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, 2));
        await bot.dig(block);
        collected += 1;
      } catch {
        // skip
      }
    }
  }

  return `Collected ${collected}/${count} ${blockType.replace(/_/g, ' ')}.`;
}

export async function searchBlock(bot: Bot, blockType: string): Promise<string> {
  const names = resolveBlockVariants(blockType);
  const ids = findBlockNames(bot, names);
  if (ids.length === 0) return `I do not know "${blockType}".`;

  const found = bot.findBlock({
    matching: ids,
    maxDistance: 96,
  });

  if (!found) return `No ${blockType.replace(/_/g, ' ')} within 96 blocks.`;

  await bot.pathfinder.goto(
    new goals.GoalNear(found.position.x, found.position.y, found.position.z, 2)
  );
  return `Found ${found.name} at ${found.position.x} ${found.position.y} ${found.position.z}.`;
}

function inventoryMatches(bot: Bot, query: string) {
  const q = query.toLowerCase();
  return bot.inventory.items().filter((item) => {
    if (q === 'sword') return item.name.includes('sword');
    if (q === 'armor' || q === 'helmet' || q === 'chestplate' || q === 'leggings' || q === 'boots') {
      return (
        item.name.includes('helmet') ||
        item.name.includes('chestplate') ||
        item.name.includes('leggings') ||
        item.name.includes('boots') ||
        item.name.includes('shield')
      );
    }
    if (q === 'food') return FOOD_NAMES.includes(item.name) || item.name.includes('cooked');
    if (q === 'boat') return item.name.includes('boat');
    if (q === 'pickaxe') return item.name.includes('pickaxe');
    if (q === 'axe' && !q.includes('pick')) return item.name.includes('axe') && !item.name.includes('pickaxe');
    return item.name.includes(q) || item.name === q;
  });
}

export async function tossToPlayer(
  bot: Bot,
  username: string,
  itemQuery: string,
  count: number
): Promise<string> {
  const player = bot.players[username]?.entity;
  if (!player) return `I cannot see ${username}.`;

  await bot.pathfinder.goto(
    new goals.GoalNear(player.position.x, player.position.y, player.position.z, 3)
  );
  await bot.lookAt(player.position.offset(0, player.height, 0));

  const matches = inventoryMatches(bot, itemQuery);
  if (matches.length === 0) {
    return `I do not have any ${itemQuery.replace(/_/g, ' ')}.`;
  }

  let remaining = count;
  let tossed = 0;
  for (const item of matches) {
    if (remaining <= 0) break;
    const n = Math.min(item.count, remaining);
    await bot.toss(item.type, null, n);
    tossed += n;
    remaining -= n;
  }
  return `Dropped ${tossed} ${itemQuery.replace(/_/g, ' ')} for you.`;
}

export async function tossEverything(bot: Bot, username: string): Promise<string> {
  const player = bot.players[username]?.entity;
  if (!player) return `I cannot see ${username}.`;
  await bot.pathfinder.goto(
    new goals.GoalNear(player.position.x, player.position.y, player.position.z, 3)
  );
  await bot.lookAt(player.position.offset(0, player.height, 0));

  const items = bot.inventory.items();
  if (items.length === 0) return 'My inventory is empty.';

  let tossed = 0;
  for (const item of items) {
    await bot.toss(item.type, null, item.count);
    tossed += item.count;
  }
  return `Dropped all ${tossed} items for you.`;
}

export async function craftItem(bot: Bot, itemName: string, count = 1): Promise<string> {
  const item = bot.registry.itemsByName[itemName];
  if (!item) return `I do not know how to craft "${itemName.replace(/_/g, ' ')}".`;

  let recipes = bot.recipesFor(item.id, null, 1, false);
  let table = bot.findBlock({
    matching: bot.registry.blocksByName.crafting_table?.id ?? -1,
    maxDistance: 16,
  });

  if ((!recipes || recipes.length === 0) && table) {
    recipes = bot.recipesFor(item.id, null, 1, true);
  }

  if (!recipes || recipes.length === 0) {
    recipes = bot.recipesFor(item.id, null, 1, true);
    if (!recipes || recipes.length === 0) {
      return `I have no recipe or materials for ${itemName.replace(/_/g, ' ')}.`;
    }
    if (!table) {
      return `I need a crafting table to make ${itemName.replace(/_/g, ' ')}.`;
    }
  }

  if (table) {
    await bot.pathfinder.goto(
      new goals.GoalNear(table.position.x, table.position.y, table.position.z, 2)
    );
  }

  try {
    await bot.craft(recipes[0], count, table ?? undefined);
    return `Crafted ${count} ${itemName.replace(/_/g, ' ')}.`;
  } catch {
    return `Failed to craft ${itemName.replace(/_/g, ' ')}. Missing materials.`;
  }
}

export async function placeNearby(bot: Bot, itemName: string): Promise<string> {
  const item = bot.inventory.items().find((i) => i.name === itemName || i.name.includes(itemName));
  if (!item) return `I do not have a ${itemName.replace(/_/g, ' ')} to place.`;

  await bot.equip(item, 'hand');
  const ref = bot.blockAt(bot.entity.position.offset(0, -1, 0));
  if (!ref) return 'No ground to place on.';

  const face = new Vec3(0, 1, 0);
  try {
    await bot.placeBlock(ref, face);
    return `Placed ${item.name}.`;
  } catch {
    const dest = bot.blockAt(bot.entity.position.offset(1, 0, 0));
    if (!dest) return 'Could not place the block.';
    try {
      await bot.placeBlock(dest, new Vec3(0, 1, 0));
      return `Placed ${item.name}.`;
    } catch {
      return `Could not place ${itemName.replace(/_/g, ' ')}.`;
    }
  }
}

export function nearestHostile(bot: Bot) {
  return bot.nearestEntity((e) => {
    const name = (e.name ?? '').toLowerCase();
    return HOSTILE_MOBS.includes(name) && e.position.distanceTo(bot.entity.position) < 16;
  });
}

export async function attackTarget(bot: Bot, entityType: string): Promise<string> {
  const wanted = entityType === 'hostile' ? null : entityType;
  const entity = bot.nearestEntity((e) => {
    const name = (e.name ?? '').toLowerCase();
    if (wanted) return name === wanted || name.includes(wanted);
    return HOSTILE_MOBS.includes(name);
  });
  if (!entity) return 'No target nearby.';

  const sword = bot.inventory.items().find((i) => i.name.includes('sword'));
  if (sword) {
    try {
      await bot.equip(sword, 'hand');
    } catch {
      // ignore
    }
  }

  const start = Date.now();
  while (entity.isValid && Date.now() - start < 20000) {
    try {
      if (entity.position.distanceTo(bot.entity.position) > 3) {
        bot.pathfinder.setGoal(
          new goals.GoalFollow(entity, 2),
          true
        );
      }
      await bot.attack(entity);
    } catch {
      break;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  bot.pathfinder.setGoal(null);
  return entity.isValid ? 'Target ran away.' : `Killed ${entity.name}.`;
}

export async function goToBed(bot: Bot): Promise<string> {
  const beds = Object.values(bot.registry.blocksByName)
    .filter((b) => b.name.includes('bed'))
    .map((b) => b.id);
  const pos = bot.findBlock({ matching: beds, maxDistance: 32 });
  if (!pos) return 'No bed nearby.';
  try {
    await bot.sleep(pos);
    return 'Sleeping.';
  } catch (err) {
    return `Cannot sleep: ${err instanceof Error ? err.message : 'failed'}.`;
  }
}

export async function eatFood(bot: Bot): Promise<string> {
  const food = bot.inventory.items().find((i) => FOOD_NAMES.includes(i.name));
  if (!food) return 'I have no food.';
  await bot.equip(food, 'hand');
  try {
    await bot.consume();
    return `Ate ${food.name.replace(/_/g, ' ')}.`;
  } catch {
    return 'Could not eat right now.';
  }
}

export async function jumpOnce(bot: Bot): Promise<string> {
  bot.setControlState('jump', true);
  await new Promise((r) => setTimeout(r, 250));
  bot.setControlState('jump', false);
  return 'Jumped.';
}

export async function equipBest(bot: Bot, query: string): Promise<string> {
  const matches = inventoryMatches(bot, query);
  if (matches.length === 0) return `I do not have ${query}.`;
  const item = matches[0];
  let dest: 'hand' | 'head' | 'torso' | 'legs' | 'feet' | 'off-hand' = 'hand';
  if (item.name.includes('helmet')) dest = 'head';
  else if (item.name.includes('chestplate') || item.name.includes('elytra')) dest = 'torso';
  else if (item.name.includes('leggings')) dest = 'legs';
  else if (item.name.includes('boots')) dest = 'feet';
  else if (item.name.includes('shield')) dest = 'off-hand';
  await bot.equip(item, dest);
  return `Equipped ${item.name.replace(/_/g, ' ')}.`;
}

export function setDefaultMovements(bot: Bot): void {
  bot.pathfinder.setMovements(new Movements(bot));
}
