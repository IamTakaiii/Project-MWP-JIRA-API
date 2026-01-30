import type { JiraCredentials, JiraUser, MonthlyReport } from '@/types'

const USER_CACHE_TTL = 300000
const REPORT_CACHE_TTL = 300000
const PROJECT_CACHE_TTL = 300000
const BOARD_CACHE_TTL = 300000

interface CacheEntry<T> {
  data: T
  timestamp: number
}

function getCacheKey(creds: JiraCredentials): string {
  return `${creds.jiraUrl}:${creds.email}`
}

// Generic cache helper
function createCache<T>(ttl: number) {
  const cache = new Map<string, CacheEntry<T>>()

  return {
    get(key: string): T | null {
      const entry = cache.get(key)
      if (entry && Date.now() - entry.timestamp < ttl) {
        return entry.data
      }
      return null
    },
    set(key: string, data: T): void {
      cache.set(key, { data, timestamp: Date.now() })
    },
    clear(): void {
      cache.clear()
    },
  }
}

// User cache
const userCache = createCache<JiraUser>(USER_CACHE_TTL)

export function getCachedUser(creds: JiraCredentials): JiraUser | null {
  return userCache.get(getCacheKey(creds))
}

export function setCachedUser(creds: JiraCredentials, user: JiraUser): void {
  userCache.set(getCacheKey(creds), user)
}

// Report cache
const reportCache = createCache<MonthlyReport>(REPORT_CACHE_TTL)

export function getReportCacheKey(
  creds: JiraCredentials,
  type: string,
  id: string | number,
  startDate: string,
  endDate: string,
): string {
  return `${getCacheKey(creds)}:${type}:${id}:${startDate}:${endDate}`
}

export function getCachedReport(key: string): MonthlyReport | null {
  return reportCache.get(key)
}

export function setCachedReport(key: string, report: MonthlyReport): void {
  reportCache.set(key, report)
}

// Project cache
type ProjectInfo = { key: string; name: string }
const projectCache = createCache<ProjectInfo[]>(PROJECT_CACHE_TTL)

export function getCachedProjects(creds: JiraCredentials): ProjectInfo[] | null {
  return projectCache.get(getCacheKey(creds))
}

export function setCachedProjects(creds: JiraCredentials, projects: ProjectInfo[]): void {
  projectCache.set(getCacheKey(creds), projects)
}

// Board cache
type BoardInfo = { id: number; name: string; projectKey?: string }
const boardCache = createCache<BoardInfo[]>(BOARD_CACHE_TTL)

export function getCachedBoards(creds: JiraCredentials): BoardInfo[] | null {
  return boardCache.get(getCacheKey(creds))
}

export function setCachedBoards(creds: JiraCredentials, boards: BoardInfo[]): void {
  boardCache.set(getCacheKey(creds), boards)
}
