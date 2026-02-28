import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { setupIpcHandlers, cleanupIpcHandlers } from './ipc/index'
import { setupStorageIpcHandlers } from './ipc/storage'
import { windowStateManager } from './store/WindowStateManager'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = path.join(__dirname, '..')

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const MAIN_DIST = path.join(APP_ROOT, 'dist-electron')
const RENDERER_DIST = path.join(APP_ROOT, 'dist')

const VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null = null

function createWindow() {
  const windowState = windowStateManager.getState()
  
  win = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 1000,
    minHeight: 700,
    icon: path.join(VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    frame: false,
    transparent: false,
    backgroundColor: '#0f0f1a',
    titleBarStyle: 'hidden',
  })

  if (windowState.isMaximized) {
    win.maximize()
  }

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  win.on('close', () => {
    if (win) {
      windowStateManager.saveState(win)
    }
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  setupIpcHandlers(win)
  setupStorageIpcHandlers()
  setupWindowControlHandlers()
}

function setupWindowControlHandlers() {
  ipcMain.handle('window:minimize', () => {
    win?.minimize()
  })

  ipcMain.handle('window:maximize', () => {
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  ipcMain.handle('window:close', () => {
    win?.close()
  })

  ipcMain.handle('window:isMaximized', () => {
    return win?.isMaximized() || false
  })
}

app.on('window-all-closed', () => {
  win = null
  cleanupIpcHandlers()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('before-quit', () => {
  cleanupIpcHandlers()
})

app.whenReady().then(createWindow)

if (process.platform !== 'darwin') {
  app.setAppUserModelId('nats-client')
}
