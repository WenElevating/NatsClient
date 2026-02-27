import { app, BrowserWindow, screen } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized: boolean
}

const STATE_FILE = 'window-state.json'
const DEFAULT_WIDTH = 1400
const DEFAULT_HEIGHT = 900
const MIN_WIDTH = 1000
const MIN_HEIGHT = 700

export class WindowStateManager {
  private statePath: string
  private state: WindowState

  constructor() {
    const userDataPath = app.getPath('userData')
    this.statePath = path.join(userDataPath, STATE_FILE)
    this.state = this.loadState()
  }

  private loadState(): WindowState {
    try {
      if (fs.existsSync(this.statePath)) {
        const data = fs.readFileSync(this.statePath, 'utf-8')
        const saved = JSON.parse(data)
        
        const { width, height } = screen.getPrimaryDisplay().workAreaSize
        if (saved.x !== undefined && saved.y !== undefined) {
          if (saved.x < 0 || saved.x > width - 100 || saved.y < 0 || saved.y > height - 100) {
            saved.x = undefined
            saved.y = undefined
          }
        }
        
        return {
          x: saved.x,
          y: saved.y,
          width: Math.max(MIN_WIDTH, Math.min(saved.width || DEFAULT_WIDTH, width)),
          height: Math.max(MIN_HEIGHT, Math.min(saved.height || DEFAULT_HEIGHT, height)),
          isMaximized: saved.isMaximized || false
        }
      }
    } catch (error) {
      console.error('Failed to load window state:', error)
    }
    
    return {
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      isMaximized: false
    }
  }

  saveState(win: BrowserWindow): void {
    try {
      const isMaximized = win.isMaximized()
      const bounds = win.getBounds()
      
      const state: WindowState = {
        x: isMaximized ? this.state.x : bounds.x,
        y: isMaximized ? this.state.y : bounds.y,
        width: isMaximized ? this.state.width : bounds.width,
        height: isMaximized ? this.state.height : bounds.height,
        isMaximized
      }
      
      fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2))
      this.state = state
    } catch (error) {
      console.error('Failed to save window state:', error)
    }
  }

  getState(): WindowState {
    return { ...this.state }
  }

  applyState(win: BrowserWindow): void {
    const state = this.getState()
    
    if (state.x !== undefined && state.y !== undefined) {
      win.setPosition(state.x, state.y)
    }
    
    win.setSize(state.width, state.height)
    
    if (state.isMaximized) {
      win.maximize()
    }
  }
}

export const windowStateManager = new WindowStateManager()
