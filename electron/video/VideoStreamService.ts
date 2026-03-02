import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface VideoStreamOptions {
  subject: string
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
  private frameDimensions: Map<string, { width: number; height: number }> = new Map()

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

    const { subject } = options

    if (this.processes.has(subject)) {
      return { success: false, error: '该视频流已在处理中' }
    }

    this.frameBuffers.set(subject, [])

    const args = [
      '-f', 'h264',
      '-fflags', 'nobuffer',
      '-flags', 'low_delay',
      '-err_detect', 'ignore_err',
      '-ec', 'favor_inter',
      '-i', 'pipe:0',
      '-vf', 'scale=640:480:flags=fast_bilinear',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-color_range', 'pc',
      'pipe:1'
    ]

    console.log('Starting ffmpeg with args:', args.join(' '))

    const ffmpeg = spawn(this.ffmpegPath, args)
    this.processes.set(subject, ffmpeg)
    
    this.frameDimensions.set(subject, { width: 640, height: 480 })
    this.expectedFrameSize.set(subject, 640 * 480 * 4)

    ffmpeg.stdin.on('error', (err) => {
      console.error('FFmpeg stdin error:', err)
      this.stopStream(subject)
    })

    ffmpeg.stdout.on('data', (data: Buffer) => {
      this.handleFrameData(subject, data)
    })

    ffmpeg.stderr.on('data', (data) => {
      const msg = data.toString()
      if (msg.includes('frame=') || 
          msg.includes('fps=') || 
          msg.includes('deprecated pixel format') ||
          msg.includes('corrupt decoded frame') ||
          msg.includes('error while decoding MB') ||
          msg.includes('non-existing PPS') ||
          msg.includes('decode_slice_header error') ||
          msg.includes('no frame!') ||
          msg.includes('Invalid data found') ||
          msg.includes('Increasing reorder buffer')) {
        return
      }
      
      console.log('FFmpeg stderr:', msg)
    })

    ffmpeg.on('close', (code) => {
      console.log(`FFmpeg process for ${subject} exited with code ${code}`)
      this.processes.delete(subject)
      this.frameBuffers.delete(subject)
      this.expectedFrameSize.delete(subject)
      this.callbacks.delete(subject)
      this.frameDimensions.delete(subject)
    })

    ffmpeg.on('error', (err) => {
      console.error('FFmpeg process error:', err)
      this.stopStream(subject)
    })

    return { success: true }
  }

  private frameCount = 0

  private handleFrameData(subject: string, data: Buffer) {
    const dims = this.frameDimensions.get(subject)
    if (!dims) {
      return
    }
    
    const { width, height } = dims
    const expectedSize = width * height * 4
    
    const buffers = this.frameBuffers.get(subject) || []
    buffers.push(data)
    
    let combined = Buffer.concat(buffers)
    
    while (combined.length >= expectedSize) {
      const frameData = combined.subarray(0, expectedSize)
      combined = combined.subarray(expectedSize)
      
      const frame: VideoFrame = {
        subject,
        data: Buffer.from(frameData),
        width,
        height,
        format: 'rgba',
        timestamp: Date.now()
      }
      
      const callbacks = this.callbacks.get(subject)
      if (callbacks) {
        callbacks.forEach(cb => cb(frame))
      }
      this.frameCount++
    }
    
    this.frameBuffers.set(subject, combined.length > 0 ? [combined] : [])
  }

  feedData(subject: string, data: Buffer): boolean {
    const process = this.processes.get(subject)
    if (!process) {
      return false
    }
    
    if (!process.stdin || !process.stdin.writable || process.stdin.destroyed) {
      this.stopStream(subject)
      return false
    }

    try {
      process.stdin.write(data)
      return true
    } catch (e) {
      console.error('Failed to write to ffmpeg stdin:', e)
      this.stopStream(subject)
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
