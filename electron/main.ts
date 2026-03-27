import { app, BrowserWindow, shell, Menu, MenuItem, powerMonitor } from 'electron';
import { join } from 'path';
import { registerAllHandlers } from './ipc';
import { database } from './services/database';
import { agentLoader } from './services/agent-loader';
import { sessionManager } from './services/session-manager';
import { eventBus } from './services/event-bus';
import { fileWatcher } from './services/file-watcher';
import { projectSync } from './services/project-sync';
import { logger } from './utils/logger';
import { IpcChannels } from './types';
import { trayService } from './services/tray-service';
import { loadEnv } from './utils/env';

// Load .env before anything else
loadEnv();

// Ensure consistent app name (affects userData path) regardless of launch method
// v2 uses 'maestro-v2' to isolate from v1's database at %APPDATA%/maestro/
app.name = 'maestro-v2';

// Fix GPU cache errors on Windows with non-ASCII userdata paths
// The Chromium disk_cache fails when %APPDATA% contains CJK characters
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disk-cache-size', '0');

// Recover from GPU process crash after sleep/wake
app.commandLine.appendSwitch('disable-gpu-compositing');

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0b10',
      symbolColor: '#8b8da3',
      height: 32,
    },
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  // Auto-reload on renderer crash (GPU crash after sleep, etc.)
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logger.warn(`Renderer process gone: ${details.reason}`);
    if (details.reason !== 'clean-exit' && mainWindow && !mainWindow.isDestroyed()) {
      logger.info('Reloading renderer to recover from crash...');
      setTimeout(() => mainWindow?.reload(), 500);
    }
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!(app as any).isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Disable devTools in production
  if (!process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.webContents.on('devtools-opened', () => {
      if (app.isPackaged) {
        mainWindow?.webContents.closeDevTools();
      }
    });
  }

  // Enable right-click context menu (copy / paste / select all)
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const menu = new Menu();

    if (params.isEditable) {
      menu.append(new MenuItem({ label: '剪下', role: 'cut' }));
      menu.append(new MenuItem({ label: '複製', role: 'copy' }));
      menu.append(new MenuItem({ label: '貼上', role: 'paste' }));
    } else if (params.selectionText) {
      menu.append(new MenuItem({ label: '複製', role: 'copy' }));
    }

    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({ label: '全選', role: 'selectAll' }));

    if (menu.items.length > 0) {
      menu.popup();
    }
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function setupEventForwarding(): void {
  // Forward eventBus events to renderer via webContents
  eventBus.onSessionEvent((event) => {
    mainWindow?.webContents.send(IpcChannels.SESSION_EVENT, event);
  });

  eventBus.onSessionStatus((change) => {
    mainWindow?.webContents.send(IpcChannels.SESSION_STATUS, change);
  });

  eventBus.onPtyData((data) => {
    mainWindow?.webContents.send(IpcChannels.PTY_DATA, data);
  });

  eventBus.on('agents:reloaded', (data) => {
    mainWindow?.webContents.send(IpcChannels.AGENTS_RELOADED, data);
  });

  eventBus.on('delegation:report', (data) => {
    mainWindow?.webContents.send(IpcChannels.DELEGATION_REPORT, data);
  });

  // 9D: Forward gate review events to renderer
  eventBus.on('gate:reviewed', (data) => {
    mainWindow?.webContents.send('gate:status-changed', data);
  });

  // Sprint 3: Forward project file-sync events to renderer
  eventBus.onFileSynced((data) => {
    mainWindow?.webContents.send(IpcChannels.PROJECT_SYNC_STATUS, data);
  });
}

app.whenReady().then(async () => {
  logger.info('Maestro starting...');

  // Application menu with Edit role (enables Ctrl+C/V/X/A keyboard shortcuts)
  const appMenu = Menu.buildFromTemplate([
    {
      label: 'Maestro',
      submenu: [
        { label: '關於 Maestro', role: 'about' },
        { type: 'separator' },
        { label: '結束', role: 'quit' },
      ],
    },
    {
      label: '編輯',
      submenu: [
        { label: '復原', role: 'undo', accelerator: 'CmdOrCtrl+Z' },
        { label: '重做', role: 'redo', accelerator: 'CmdOrCtrl+Shift+Z' },
        { type: 'separator' },
        { label: '剪下', role: 'cut', accelerator: 'CmdOrCtrl+X' },
        { label: '複製', role: 'copy', accelerator: 'CmdOrCtrl+C' },
        { label: '貼上', role: 'paste', accelerator: 'CmdOrCtrl+V' },
        { label: '全選', role: 'selectAll', accelerator: 'CmdOrCtrl+A' },
      ],
    },
    {
      label: '檢視',
      submenu: [
        { label: '重新載入', role: 'reload' },
        { label: '開發者工具', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '放大', role: 'zoomIn' },
        { label: '縮小', role: 'zoomOut' },
        { label: '重設縮放', role: 'resetZoom' },
      ],
    },
  ]);
  Menu.setApplicationMenu(appMenu);

  // Initialize database (async for sql.js WASM loading)
  await database.initialize();
  logger.info('Database initialized');

  // Load agent definitions
  agentLoader.load();
  logger.info(`Agent loader: ${agentLoader.getCount()} agents loaded`);

  // Detect Claude CLI
  sessionManager.detectClaude();

  // Register IPC handlers
  registerAllHandlers();
  logger.info('IPC handlers registered');

  // Create window
  createWindow();

  // Setup event forwarding after window is created
  setupEventForwarding();

  // Initialize tray service
  if (mainWindow) {
    trayService.initialize(mainWindow);
  }

  // Start file watcher
  fileWatcher.start();

  // Auto-start project sync for all projects that have a work directory
  try {
    const projects = database.prepare(
      `SELECT id, work_dir FROM projects WHERE work_dir IS NOT NULL AND status IN (?, ?)`,
      ['planning', 'active'],
    );
    logger.info(`Project sync: found ${projects.length} projects with work_dir`);
    for (const p of projects as any[]) {
      logger.info(`Project sync: project ${p.id} work_dir=${p.work_dir}`);
      if (p.work_dir) {
        projectSync.startWatch(p.id as string, p.work_dir as string);
        // Run fullSync to capture files that existed before watcher started
        projectSync.fullSync(p.id as string, p.work_dir as string).catch((err) => {
          logger.warn(`Initial fullSync failed for project ${p.id}`, err);
        });
      }
    }
    logger.info(`Project sync started for ${projects.length} projects`);
  } catch (err) {
    logger.warn('Failed to auto-start project sync', err);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Recover from black screen after sleep/wake
  powerMonitor.on('resume', () => {
    logger.info('System resumed from sleep, checking renderer health');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.once('render-process-gone', (_event, details) => {
        logger.warn(`Renderer process gone: ${details.reason}, reloading...`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.reload();
        }
      });
    }
  });
});

// Ensure quitting flag for tray behavior
app.on('before-quit', () => {
  (app as any).isQuitting = true;
});

app.on('window-all-closed', () => {
  trayService.destroy();
  fileWatcher.stop();
  projectSync.stopAll();
  sessionManager.cleanup();
  database.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
