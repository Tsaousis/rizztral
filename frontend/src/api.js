import { fallbackLeaderboard, offlineRequest, saveLeaderboardSnapshot } from './offline.js'

export const API_BASE = (window.RIZZTRAL_API_BASE || import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')
export const apiUrl = (path) => `${API_BASE}/api${path}`

let browserFallback = false

export const isBrowserFallback = () => browserFallback

async function fetchJson(path, options, timeout) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(apiUrl(path), {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.detail || 'The villa lost its signal. Try again.')
    return body
  } finally {
    window.clearTimeout(timer)
  }
}

export async function wakeServer() {
  if (!API_BASE || browserFallback) return !browserFallback
  const deadline = Date.now() + 55_000
  while (Date.now() < deadline) {
    try {
      await fetchJson('/health', {}, Math.min(10_000, deadline - Date.now()))
      return true
    } catch {
      if (Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 1200))
      }
    }
  }
  browserFallback = true
  return false
}

export async function request(path, options = {}) {
  if (browserFallback) return offlineRequest(path, options)
  try {
    return await fetchJson(path, options, path === '/config' ? 4_000 : 14_000)
  } catch (error) {
    if (path === '/config') return offlineRequest(path, options)
    if (path.startsWith('/leaderboard')) {
      const snapshot = fallbackLeaderboard()
      return path.includes('daily=true') ? snapshot.today : snapshot
    }
    if (path === '/games') {
      browserFallback = true
      return offlineRequest(path, options)
    }
    throw error
  }
}

export function cacheLeaderboard(value) {
  saveLeaderboardSnapshot(value)
}
