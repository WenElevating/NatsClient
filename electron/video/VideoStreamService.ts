import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface VideoStreamOptions {
  subject: string
  width?: number
  height?: number
}

export interface VideoFrame {
  subject: string
  data: Buffer
  width: number
  height: number
  format: string
  timestamp: number
}

type FrameCallback = (frame: VideoFrame) => void

class VideoStreamService {
  private ffmpegPath: string | null = null
  private processes: Map<string, ChildProcess> = new Map()
  private callbacks: Map<string, Set<FrameCallback>> = new Map()
  private frameBuffers: Map<string, Buffer[]> = new Map()
  private expectedFrameSize: Map<string, number> = new Map()

  constructor() {
    this.initFfmpeg()
  }

  private initFfmpeg() {
    const platform = process.platform + '-' + process.arch
    const binaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    
    const possiblePaths = [
      path.join(__dirname, '..', '..', 'node_modules', '@ffmpeg-installer', platform, binaryName),
      path.join(__dirname, '..', '..', '..', '@ffmpeg-installer', platform, binaryName),
      path.join(app.getAppPath(), 'node_modules', '@ffmpeg-installer', platform, binaryName),
    ]
    
    for (const ffmpegPath of possiblePaths) {
      if (fs.existsSync(ffmpegPath)) {
        this.ffmpegPath = ffmpegPath
        console.log('FFmpeg found at:', ffmpegPath)
        return
      }
    }
    
    console.log('FFmpeg not found in node_modules, checking system PATH...')
    
    try {
      const result = spawn('ffmpeg', ['-version'])
      result.on('close', (code) => {
        if (code === 0) {
          this.ffmpegPath = 'ffmpeg'
          console.log('Using system FFmpeg')
        }
      })
      result.on('error', () => {
        console.error('FFmpeg not found in system PATH')
      })
    } catch {
      console.error('FFmpeg not found')
    }
  }

  isAvailable(): boolean {
    return this.ffmpegPath !== null
  }

  async startStream(options: VideoStreamOptions): Promise<{ success: boolean; error?: string }> {
    if (!this.ffmpegPath) {
      return { success: false, error: 'FFmpeg 不可用' }
    }

    const { subject, width = 640, height = 480 } = options

    if (this.processes.has(subject)) {
      return { success: false, error: '该视频流已在处理中' }
    }

    this.frameBuffers.set(subject, [])
    this.expectedFrameSize.set(subject, width * height * 3)

    const args = [
      '-f', 'h264',
      '-i', 'pipe:0',
      '-vf', `scale=${width}:${height}`,
      '-f', 'rawvideo',
      '-pix_fmt', 'rgb24',
      'pipe:1'
    ]

    console.log('Starting ffmpeg with args:', args.join(' '))

    const ffmpeg = spawn(this.ffmpegPath, args)
    this.processes.set(subject, ffmpeg)

    ffmpeg.stdin.on('error', (err) => {
      console.error('FFmpeg stdin error:', err)
    })

    ffmpeg.stdout.on('data', (data: Buffer) => {
      this.handleFrameData(subject, data, width, height)
    })

    ffmpeg.stderr.on('data', (data) => {
      console.log('FFmpeg stderr:', data.toString())
    })

    ffmpeg.on('close', (code) => {
      console.log(`FFmpeg process for ${subject} exited with code ${code}`)
      this.processes.delete(subject)
      this.frameBuffers.delete(subject)
      this.expectedFrameSize.delete(subject)
    })

    ffmpeg.on('error', (err) => {
      console.error('FFmpeg process error:', err)
    })

    return { success: true }
  }

  private handleFrameData(subject: string, data: Buffer, width: number, height: number) {
    const buffers = this.frameBuffers.get(subject) || []
    buffers.push(data)
    
    const expectedSize = this.expectedFrameSize.get(subject) || (width * height * 3)
    
    let combined = Buffer.concat(buffers)
    
    while (combined.length >= expectedSize) {
      const frameData = combined.subarray(0, expectedSize)
      combined = combined.subarray(expectedSize)
      
      const frame: VideoFrame = {
        subject,
        data: Buffer.from(frameData),
        width,
        height,
        format: 'rgb24',
        timestamp: Date.now()
      }
      
      const callbacks = this.callbacks.get(subject)
      if (callbacks) {
        callbacks.forEach(cb => cb(frame))
      }
    }
    
    this.frameBuffers.set(subject, combined.length > 0 ? [combined] : [])
  }

  feedData(subject: string, data: Buffer): boolean {
    const process = this.processes.get(subject)
    if (!process || !process.stdin || !process.stdin.writable) {
      return false
    }

    try {
      process.stdin.write(data)
      return true
    } catch (e) {
      console.error('Failed to write to ffmpeg stdin:', e)
      return false
    }
  }

  stopStream(subject: string): void {
    const process = this.processes.get(subject)
    if (process) {
      if (process.stdin) {
        process.stdin.end()
      }
      process.kill('SIGTERM')
      this.processes.delete(subject)
    }
    
    this.frameBuffers.delete(subject)
    this.expectedFrameSize.delete(subject)
    this.callbacks.delete(subject)
  }

  onFrame(subject: string, callback: FrameCallback): () => void {
    if (!this.callbacks.has(subject)) {
      this.callbacks.set(subject, new Set())
    }
    
    this.callbacks.get(subject)!.add(callback)
    
    return () => {
      const callbacks = this.callbacks.get(subject)
      if (callbacks) {
        callbacks.delete(callback)
      }
    }
  }

  stopAllStreams(): void {
    for (const subject of this.processes.keys()) {
      this.stopStream(subject)
    }
  }
}

export const videoStreamService = new VideoStreamService()
