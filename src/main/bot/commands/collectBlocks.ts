import { Bot } from 'mineflayer';
import { plugin as collectBlockPlugin } from 'mineflayer-collectblock';

let collectBlockLoaded = false;

function ensureCollectBlockPlugin(bot: Bot): void {
  if (!collectBlockLoaded) {
    bot.loadPlugin(collectBlockPlugin);
    collectBlockLoaded = true;
  }
}

function resolveBlockId(bot: Bot, blockType: string): number | null {
  const registry = bot.registry.blocksByName[blockType.toLowerCase()];
  return registry?.id ?? null;
}

export async function collectBlocks(
  bot: Bot,
  blockType: string,
  count = 8
): Promise<string> {
  ensureCollectBlockPlugin(bot);

  const blockId = resolveBlockId(bot, blockType);
  if (blockId === null) {
    return `Unknown block type: "${blockType}".`;
  }

  const block = bot.registry.blocksByName[blockType.toLowerCase()];
  if (!block) {
    return `Unknown block type: "${blockType}".`;
  }

  const targets = bot.findBlocks({
    matching: block.id,
    maxDistance: 64,
    count: Math.min(count, 32),
  });

  if (targets.length === 0) {
    return `No ${blockType} blocks found nearby.`;
  }

  let collected = 0;
  for (const pos of targets) {
    if (collected >= count) break;
    const targetBlock = bot.blockAt(pos);
    if (!targetBlock) continue;

    try {
      await bot.collectBlock.collect(targetBlock);
      collected += 1;
    } catch {
      // Skip unreachable blocks
    }
  }

  return `Collected ${collected} ${blockType} block(s).`;
}

export async function mineBlock(
  bot: Bot,
  blockType: string,
  count = 1
): Promise<string> {
  const block = bot.registry.blocksByName[blockType.toLowerCase()];
  if (!block) {
    return `Unknown block type: "${blockType}".`;
  }

  const targets = bot.findBlocks({
    matching: block.id,
    maxDistance: 32,
    count: Math.min(count, 16),
  });

  if (targets.length === 0) {
    return `No ${blockType} blocks found nearby.`;
  }

  let mined = 0;
  for (const pos of targets) {
    if (mined >= count) break;
    const targetBlock = bot.blockAt(pos);
    if (!targetBlock) continue;

    try {
      await bot.dig(targetBlock);
      mined += 1;
    } catch {
      // Skip unreachable blocks
    }
  }

  return `Mined ${mined} ${blockType} block(s).`;
}
