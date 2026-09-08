import { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as fs from 'fs';
import { BotManager } from './bot/botManager';
import { registerIpcHandlers } from './ipc/handlers';
import { SupertonicBridge } from './tts/supertonicBridge';

let mainWindow: BrowserWindow | null = null;
let ttsBridge: SupertonicBridge | null = null;
let tray: Tray | null = null;

const botManager = new BotManager();

function setupUpdates(): void {
  const send = (status: string, extra: Record<string, unknown> = {}) => {
    mainWindow?.webContents.send('update:status', { status, ...extra });
  };
  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) return { available: false, error: 'Updates are available in the installed Frinedo app.' };
    try {
      const result = await autoUpdater.checkForUpdates();
      const version = result?.updateInfo?.version;
      return { available: Boolean(version && version !== app.getVersion()), version };
    } catch (error) {
      return { available: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('update:download', async () => {
    if (!app.isPackaged) return { success: false, error: 'Updates are available in the installed Frinedo app.' };
    try { await autoUpdater.downloadUpdate(); return { success: true }; }
    catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
  });
  ipcMain.handle('update:install', () => { autoUpdater.quitAndInstall(); });
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => send('checking'));
  autoUpdater.on('update-available', (info) => send('available', { version: info.version }));
  autoUpdater.on('update-not-available', () => send('not-available'));
  autoUpdater.on('download-progress', (progress) => send('downloading', { percent: progress.percent }));
  autoUpdater.on('update-downloaded', (info) => send('downloaded', { version: info.version }));
  autoUpdater.on('error', (error) => send('error', { error: error.message }));
  setTimeout(() => { void autoUpdater.checkForUpdates(); }, 5000);
}

function resolveIcon(): string {
  const candidates = [
    path.join(process.cwd(), 'src', 'public', 'icon.png'),
    path.join(process.cwd(), 'resources', 'icon.ico'),
    path.join(__dirname, '../renderer/icon.png'),
    path.join(process.resourcesPath ?? '', 'public', 'icon.png'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

function resolveTrayIcon(): string {
  const candidates = [
    path.join(process.cwd(), 'src', 'public', 'small_icon.png'),
    path.join(process.resourcesPath ?? '', 'public', 'small_icon.png'),
    path.join(__dirname, '../renderer/small_icon.png'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function createTray(): void {
  if (tray) return;
  const iconPath = resolveTrayIcon();
  tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip('Frinedo');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: 'Exit', click: () => app.quit() },
  ]));
  tray.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

function createWindow(): void {
  const icon = resolveIcon();
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 420,
    minHeight: 360,
    useContentSize: true,
    resizable: true,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#111111',
    icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    title: 'Frinedo',
  });

  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.on('minimize' as any, (event: Electron.Event) => {
    event.preventDefault();
    createTray();
    mainWindow?.hide();
  });
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.minecraft.botcontroller');
  }
  ttsBridge = registerIpcHandlers(botManager, () => mainWindow);
  createWindow();
  setupUpdates();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  ttsBridge?.shutdown();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  tray?.destroy();
  tray = null;
  ttsBridge?.shutdown();
  void botManager.disconnect();
});
