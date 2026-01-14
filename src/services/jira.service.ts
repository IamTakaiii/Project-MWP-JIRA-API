import { createLogger, ExternalServiceError } from '@/lib'
import type {
  JiraCredentials,
  WorklogPayload,
  WorklogItem,
  JiraIssue,
} from '@/types'

const log = createLogger('JiraService')

/**
 * Configuration constants
 */
const CONCURRENCY = 6
const MAX_SEARCH_RESULTS = 100
const MAX_TASK_RESULTS = 50
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Type definitions for Jira API responses
 */
interface SearchResponse {
  issues: JiraIssue[]
  total: number
}

interface WorklogApiResponse {
  worklogs: Array<{
    id: string
    author?: { accountId?: string; displayName?: string; emailAddress?: string }
    timeSpent: string
    timeSpentSeconds: number
    started?: string
    comment?: { content?: Array<{ content?: Array<{ text?: string }> }> }
    created: string
    updated: string
  }>
}

interface UserResponse {
  accountId: string
  displayName: string
}

/**
 * Cache for current user to avoid repeated API calls
 */
const userCache = new Map<string, { user: UserResponse; timestamp: number }>()
const USER_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Creates a cache key from credentials
 */
function getCacheKey(credentials: JiraCredentials): string {
  return `${credentials.jiraUrl}:${credentials.email}`
}

/**
 * Creates Base64 auth header for Jira API
 */
function createAuthHeader(email: string, apiToken: string): string {
  const credentials = `${email}:${apiToken}`
  return `Basic ${Buffer.from(credentials).toString('base64')}`
}

/**
 * Normalizes Jira URL by removing trailing slash
 */
function normalizeUrl(url: string): string {
  return url.replace(/\/$/, '')
}

/**
 * Builds a Jira API URL
 */
function buildApiUrl(baseUrl: string, path: string): string {
  const normalized = normalizeUrl(baseUrl)
  return `${normalized}/rest/api/3${path}`
}

/**
 * Makes a request to Jira API with error handling
 */
async function jiraRequest<T>(
  url: string,
  options: RequestInit,
  credentials: JiraCredentials
): Promise<T> {
  const authHeader = createAuthHeader(credentials.email, credentials.apiToken)

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const responseText = await response.text()

  if (!response.ok) {
    log.warn(
      { url, status: response.status, response: responseText.substring(0, 500) },
      'Jira API error'
    )
    throw new ExternalServiceError('Jira API', response.status, responseText)
  }

  // Handle empty responses (e.g., DELETE)
  if (!responseText) {
    return {} as T
  }

  try {
    return JSON.parse(responseText) as T
  } catch {
    return responseText as unknown as T
  }
}

/**
 * Processes array in batches with controlled concurrency
 */
async function processInBatches<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = CONCURRENCY
): Promise<R[]> {
  const results: R[] = []

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(processor))
    results.push(...batchResults)
  }

  return results
}

/**
 * Builds JQL query for task search
 */
function buildTaskSearchJQL(options: { searchText?: string; status?: string }): string {
  const jqlParts: string[] = ['assignee = currentUser()']

  if (options.status && options.status !== 'all') {
    jqlParts.push(`status = "${options.status}"`)
  }

  if (options.searchText?.trim()) {
    const escaped = options.searchText.trim().replace(/"/g, '\\"')
    jqlParts.push(`(summary ~ "${escaped}" OR key ~ "${escaped}")`)
  }

  return `${jqlParts.join(' AND ')} ORDER BY updated DESC`
}

/**
 * Extracts comment text from Jira worklog comment structure
 */
function extractCommentText(comment?: { content?: Array<{ content?: Array<{ text?: string }> }> }): string {
  return comment?.content?.[0]?.content?.[0]?.text || ''
}

/**
 * Jira Service - handles all Jira API interactions
 */
export const JiraService = {
  /**
   * Create a worklog entry for an issue
   */
  async createWorklog(
    credentials: JiraCredentials,
    issueKey: string,
    payload: WorklogPayload
  ): Promise<unknown> {
    const url = buildApiUrl(credentials.jiraUrl, `/issue/${issueKey}/worklog`)

    log.info({ issueKey }, 'Creating worklog')

    return jiraRequest(url, {
      method: 'POST',
      body: JSON.stringify(payload),
    }, credentials)
  },

  /**
   * Update an existing worklog
   */
  async updateWorklog(
    credentials: JiraCredentials,
    issueKey: string,
    worklogId: string,
    payload: WorklogPayload
  ): Promise<unknown> {
    const url = buildApiUrl(credentials.jiraUrl, `/issue/${issueKey}/worklog/${worklogId}`)

    log.info({ issueKey, worklogId }, 'Updating worklog')

    return jiraRequest(url, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }, credentials)
  },

  /**
   * Delete a worklog
   */
  async deleteWorklog(
    credentials: JiraCredentials,
    issueKey: string,
    worklogId: string
  ): Promise<{ success: boolean }> {
    const url = buildApiUrl(credentials.jiraUrl, `/issue/${issueKey}/worklog/${worklogId}`)

    log.info({ issueKey, worklogId }, 'Deleting worklog')

    await jiraRequest(url, {
      method: 'DELETE',
    }, credentials)

    return { success: true }
  },

  /**
   * Get current user info with caching
   */
  async getCurrentUser(credentials: JiraCredentials): Promise<UserResponse> {
    const cacheKey = getCacheKey(credentials)
    const cached = userCache.get(cacheKey)

    // Return cached user if still valid
    if (cached && Date.now() - cached.timestamp < USER_CACHE_TTL) {
      return cached.user
    }

    const url = buildApiUrl(credentials.jiraUrl, '/myself')
    const user = await jiraRequest<UserResponse>(url, { method: 'GET' }, credentials)

    // Update cache
    userCache.set(cacheKey, { user, timestamp: Date.now() })

    return user
  },

  /**
   * Search for issues assigned to current user
   */
  async searchMyTasks(
    credentials: JiraCredentials,
    options: { searchText?: string; status?: string } = {}
  ): Promise<{ issues: JiraIssue[]; total: number }> {
    const url = buildApiUrl(credentials.jiraUrl, '/search/jql')
    const jql = buildTaskSearchJQL(options)

    log.debug({ jql }, 'Searching tasks')

    const response = await jiraRequest<SearchResponse>(url, {
      method: 'POST',
      body: JSON.stringify({
        jql,
        fields: ['key', 'summary', 'status', 'issuetype', 'project'],
        maxResults: MAX_TASK_RESULTS,
      }),
    }, credentials)

    return {
      issues: response.issues || [],
      total: response.total || 0,
    }
  },

  /**
   * Get worklog history for a date range
   */
  async getWorklogHistory(
    credentials: JiraCredentials,
    startDate: string,
    endDate: string
  ): Promise<{ worklogs: WorklogItem[]; totalIssues: number }> {
    // Step 1: Get current user (cached)
    const currentUser = await this.getCurrentUser(credentials)
    log.info({ user: currentUser.displayName }, 'Fetching worklog history')

    // Step 2: Calculate date range timestamps (optimize by calculating once)
    const startMs = new Date(startDate).getTime()
    const endMs = new Date(endDate).getTime() + MILLISECONDS_PER_DAY // end of day

    // Step 3: Search for issues with worklogs in date range
    const jql = `worklogAuthor = currentUser() AND worklogDate >= ${startDate} AND worklogDate <= ${endDate} ORDER BY updated DESC`
    const searchUrl = buildApiUrl(credentials.jiraUrl, '/search/jql')

    const searchResponse = await jiraRequest<SearchResponse>(searchUrl, {
      method: 'POST',
      body: JSON.stringify({
        jql,
        fields: ['key', 'summary', 'project'],
        maxResults: MAX_SEARCH_RESULTS,
      }),
    }, credentials)

    const issues = searchResponse.issues || []
    log.debug({ count: issues.length }, 'Found issues with worklogs')

    if (issues.length === 0) {
      return { worklogs: [], totalIssues: 0 }
    }

    // Step 4: Fetch worklogs for each issue concurrently in batches
    const fetchWorklogsForIssue = async (issue: JiraIssue): Promise<WorklogItem[]> => {
      const worklogUrl = buildApiUrl(
        credentials.jiraUrl,
        `/issue/${issue.key}/worklog?startedAfter=${startMs}&startedBefore=${endMs}`
      )

      try {
        const response = await jiraRequest<WorklogApiResponse>(
          worklogUrl,
          { method: 'GET' },
          credentials
        )

        return (response.worklogs || [])
          .filter((wl) => {
            if (!wl.started) return false
            const wlStartedMs = new Date(wl.started).getTime()
            return (
              wl.author?.accountId === currentUser.accountId &&
              wlStartedMs >= startMs &&
              wlStartedMs <= endMs
            )
          })
          .map((wl) => ({
            id: wl.id,
            issueKey: issue.key,
            issueSummary: issue.fields.summary,
            projectKey: issue.fields.project?.key,
            author: wl.author?.displayName || wl.author?.emailAddress,
            authorAccountId: wl.author?.accountId,
            timeSpent: wl.timeSpent,
            timeSpentSeconds: wl.timeSpentSeconds,
            started: wl.started!,
            comment: extractCommentText(wl.comment),
            created: wl.created,
            updated: wl.updated,
          }))
      } catch (error) {
        log.warn({ issueKey: issue.key, error }, 'Failed to fetch worklogs for issue')
        return []
      }
    }

    // Process in batches for controlled concurrency
    const worklogArrays = await processInBatches(issues, fetchWorklogsForIssue)
    const worklogs = worklogArrays.flat()

    // Sort by started date (newest first)
    // Pre-compute timestamps for better performance
    const worklogsWithTimestamps = worklogs.map((wl) => ({
      worklog: wl,
      timestamp: new Date(wl.started).getTime(),
    }))
    worklogsWithTimestamps.sort((a, b) => b.timestamp - a.timestamp)

    const sortedWorklogs = worklogsWithTimestamps.map((item) => item.worklog)

    log.info({ count: sortedWorklogs.length }, 'Total worklogs found')

    return { worklogs: sortedWorklogs, totalIssues: issues.length }
  },
}
