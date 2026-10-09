import { Bot } from 'mineflayer';
import { BotCommand } from '../../shared/types';

export interface MenuEntry {
  index: number;
  label: string;
  phrase: string;
  command?: BotCommand;
}

export const MENU_PAGE_SIZE = 10;
export const MENU_COMMAND_LIMIT = 90;
const MENU_COLORS = ['aqua', 'green', 'light_purple', 'yellow'];

export function buildMenuEntries(saved: BotCommand[]): MenuEntry[] {
  const entries: MenuEntry[] = [];
  for (const command of saved.slice(0, MENU_COMMAND_LIMIT)) {
    const phrase = command.triggerPhrases[0] ?? command.actionType;
    entries.push({
      index: entries.length + 1,
      label: phrase,
      phrase,
      command,
    });
  }

  return entries;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function sendInGameMenu(bot: Bot, username: string, entries: MenuEntry[], page = 1): Promise<void> {
  const target = username || '@a';
  const pageCount = Math.max(1, Math.ceil(entries.length / MENU_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const pageEntries = entries.slice((currentPage - 1) * MENU_PAGE_SIZE, currentPage * MENU_PAGE_SIZE);
  const pageColor = MENU_COLORS[(currentPage - 1) % MENU_COLORS.length];

  const header = JSON.stringify({
    text: `=== Bot Menu ${currentPage}/${pageCount} ===`,
    color: pageColor,
    bold: true,
  });
  bot.chat(`/tellraw ${target} ${header}`);
  await delay(40);

  bot.chat(`/tellraw ${target} ${JSON.stringify({
    text: `Commands: ${entries.length} total • Page ${currentPage} of ${pageCount}`,
    color: 'gray',
  })}`);
  await delay(40);

  for (const [index, entry] of pageEntries.entries()) {
    const line = JSON.stringify({
      text: `[${index + 1}] ${entry.label.slice(0, 32)}`,
      color: pageColor,
      clickEvent: {
        action: 'run_command',
        value: `/msg ${bot.username} ${index + 1}`,
      },
      bold: true,
    });
    bot.chat(`/tellraw ${target} ${line}`);
    await delay(35);
  }

  const navColor = 'gold';

  if (currentPage > 1) {
    const prevButton = JSON.stringify({
      text: '[◀ Previous page]',
      color: navColor,
      clickEvent: {
        action: 'run_command',
        value: `/msg ${bot.username} menu ${currentPage - 1}`,
      },
      hoverEvent: {
        action: 'show_text',
        value: `Show page ${currentPage - 1}`,
      },
    });
    bot.chat(`/tellraw ${target} ${prevButton}`);
    await delay(25);
  }

  if (currentPage < pageCount) {
    const nextButton = JSON.stringify({
      text: '[Next page ▶]',
      color: navColor,
      clickEvent: {
        action: 'run_command',
        value: `/msg ${bot.username} menu ${currentPage + 1}`,
      },
      hoverEvent: {
        action: 'show_text',
        value: `Show page ${currentPage + 1}`,
      },
    });
    bot.chat(`/tellraw ${target} ${nextButton}`);
    await delay(25);
  }

  bot.chat(`/tellraw ${target} ${JSON.stringify({ text: 'Click a command or type menu <page>.', color: 'dark_gray' })}`);
}

export function pickMenuEntry(entries: MenuEntry[], message: string, page = 1): MenuEntry | null {
  const trimmed = message.trim();
  const hash = trimmed.match(/^#(\d+)$/);
  const num = hash ? Number(hash[1]) : /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
  if (!Number.isFinite(num)) return null;
  const pageEntries = entries.slice((page - 1) * MENU_PAGE_SIZE, page * MENU_PAGE_SIZE);
  return pageEntries[num - 1] ?? null;
}

export function menuPageFromMessage(message: string): number | null {
  const match = message.trim().toLowerCase().match(/^(?:menu|commands|help|open menu)(?:\s+(\d+))?$/);
  if (!match) return null;
  return Math.max(1, Number(match[1] ?? 1));
}

export function isMenuOpenPhrase(message: string): boolean {
  return menuPageFromMessage(message) !== null;
}
