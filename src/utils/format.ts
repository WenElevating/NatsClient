export function formatTimestamp(date: Date): string {
  const d = new Date(date)
  const hours = d.getHours().toString().padStart(2, '0')
  const minutes = d.getMinutes().toString().padStart(2, '0')
  const seconds = d.getSeconds().toString().padStart(2, '0')
  const ms = d.getMilliseconds().toString().padStart(3, '0')
  return `${hours}:${minutes}:${seconds}.${ms}`
}

export function formatJson(str: string): string {
  try {
    const parsed = JSON.parse(str)
    if (typeof parsed === 'number') {
      return str
    }
    return JSON.stringify(parsed, null, 2)
  } catch {
    return str
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function formatAge(nanoseconds: number): string {
  const seconds = nanoseconds / 1e9
  if (seconds < 60) return `${seconds.toFixed(0)}s`
  if (seconds < 3600) return `${(seconds / 60).toFixed(0)}m`
  if (seconds < 86400) return `${(seconds / 3600).toFixed(0)}h`
  return `${(seconds / 86400).toFixed(0)}d`
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}
