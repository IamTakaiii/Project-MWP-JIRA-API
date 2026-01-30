import { ExternalServiceError, createLogger } from '@/lib'
import type {
  ActiveEpic,
  EpicWorklogReport,
  JiraCredentials,
  JiraIssue,
  JiraUser,
  JiraWorklogEntry,
  TaskSearchOptions,
  UserWorklogSummary,
  WorklogItem,
  WorklogPayload,
} from '@/types'

const log = createLogger('JiraService')

const CONCURRENCY = 6
const MAX_RESULTS = 100
const MS_PER_DAY = 86400000
const USER_CACHE_TTL = 300000

// User cache
const userCache = new Map<string, { user: JiraUser; timestamp: number }>()

function getCacheKey(creds: JiraCredentials): string {
  return `${creds.jiraUrl}:${creds.email}`
}

// HTTP helpers
function buildAuthHeader(email: string, apiToken: string): string {
  return `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`
}

function buildApiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}/rest/api/3${path}`
}

async function request<T>(
  url: string,
  method: string,
  credentials: JiraCredentials,
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: buildAuthHeader(credentials.email, credentials.apiToken),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await response.text()

  if (!response.ok) {
    log.warn({ url, status: response.status }, 'Jira API error')
    throw new ExternalServiceError('Jira API', response.status, text)
  }

  return text ? JSON.parse(text) : ({} as T)
}

// Batch processing
async function processBatch<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  batchSize = CONCURRENCY,
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = await Promise.all(items.slice(i, i + batchSize).map(fn))
    results.push(...batch)
  }
  return results
}

// JQL builders
function buildTaskSearchJql(options: TaskSearchOptions): string {
  const parts = ['assignee = currentUser()']
  if (options.status && options.status !== 'all') {
    parts.push(`status = "${options.status}"`)
  }
  if (options.searchText?.trim()) {
    const escaped = options.searchText.trim().replace(/"/g, '\\"')
    parts.push(`(summary ~ "${escaped}" OR key ~ "${escaped}")`)
  }
  return `${parts.join(' AND ')} ORDER BY updated DESC`
}

// Worklog helpers
function extractComment(comment?: JiraWorklogEntry['comment']): string {
  return comment?.content?.[0]?.content?.[0]?.text || ''
}

function toWorklogItem(worklog: JiraWorklogEntry, issue: JiraIssue): WorklogItem {
  const author = worklog.author?.displayName || worklog.author?.emailAddress
  return {
    id: worklog.id,
    issueKey: issue.key,
    issueSummary: issue.fields.summary,
    projectKey: issue.fields.project?.key,
    author,
    authorAccountId: worklog.author?.accountId,
    timeSpent: worklog.timeSpent,
    timeSpentSeconds: worklog.timeSpentSeconds,
    started: worklog.started!,
    comment: extractComment(worklog.comment),
    created: worklog.created,
    updated: worklog.updated,
  }
}

// Service methods
export async function getCurrentUser(credentials: JiraCredentials): Promise<JiraUser> {
  const cacheKey = getCacheKey(credentials)
  const cached = userCache.get(cacheKey)

  if (cached && Date.now() - cached.timestamp < USER_CACHE_TTL) {
    return cached.user
  }

  const url = buildApiUrl(credentials.jiraUrl, '/myself')
  const user = await request<JiraUser>(url, 'GET', credentials)
  userCache.set(cacheKey, { user, timestamp: Date.now() })

  return user
}

export async function searchMyTasks(
  credentials: JiraCredentials,
  options: TaskSearchOptions = {},
): Promise<{ issues: JiraIssue[]; total: number }> {
  const url = buildApiUrl(credentials.jiraUrl, '/search/jql')
  const jql = buildTaskSearchJql(options)

  const response = await request<{ issues: JiraIssue[]; total: number }>(url, 'POST', credentials, {
    jql,
    fields: ['key', 'summary', 'status', 'issuetype', 'project'],
    maxResults: 50,
  })

  return { issues: response.issues || [], total: response.total || 0 }
}

export async function createWorklog(
  credentials: JiraCredentials,
  issueKey: string,
  payload: WorklogPayload,
): Promise<unknown> {
  const url = buildApiUrl(credentials.jiraUrl, `/issue/${issueKey}/worklog`)
  log.info({ issueKey }, 'Creating worklog')
  return request(url, 'POST', credentials, payload)
}

export async function updateWorklog(
  credentials: JiraCredentials,
  issueKey: string,
  worklogId: string,
  payload: WorklogPayload,
): Promise<unknown> {
  const url = buildApiUrl(credentials.jiraUrl, `/issue/${issueKey}/worklog/${worklogId}`)
  log.info({ issueKey, worklogId }, 'Updating worklog')
  return request(url, 'PUT', credentials, payload)
}

export async function deleteWorklog(
  credentials: JiraCredentials,
  issueKey: string,
  worklogId: string,
): Promise<{ success: boolean }> {
  const url = buildApiUrl(credentials.jiraUrl, `/issue/${issueKey}/worklog/${worklogId}`)
  log.info({ issueKey, worklogId }, 'Deleting worklog')
  await request(url, 'DELETE', credentials)
  return { success: true }
}

export async function getWorklogHistory(
  credentials: JiraCredentials,
  startDate: string,
  endDate: string,
): Promise<{ worklogs: WorklogItem[]; totalIssues: number }> {
  const currentUser = await getCurrentUser(credentials)
  log.info({ user: currentUser.displayName }, 'Fetching worklog history')

  const startMs = new Date(startDate).getTime()
  const endMs = new Date(endDate).getTime() + MS_PER_DAY

  // Search issues with worklogs
  const jql = `worklogAuthor = currentUser() AND worklogDate >= ${startDate} AND worklogDate <= ${endDate} ORDER BY updated DESC`
  const url = buildApiUrl(credentials.jiraUrl, '/search/jql')

  const searchResponse = await request<{ issues: JiraIssue[]; total: number }>(
    url,
    'POST',
    credentials,
    { jql, fields: ['key', 'summary', 'project'], maxResults: MAX_RESULTS },
  )

  const issues = searchResponse.issues || []
  if (issues.length === 0) {
    return { worklogs: [], totalIssues: 0 }
  }

  // Fetch worklogs for each issue
  const worklogArrays = await processBatch(issues, async (issue) => {
    const worklogUrl = buildApiUrl(
      credentials.jiraUrl,
      `/issue/${issue.key}/worklog?startedAfter=${startMs}&startedBefore=${endMs}`,
    )

    try {
      const response = await request<{ worklogs: JiraWorklogEntry[] }>(
        worklogUrl,
        'GET',
        credentials,
      )

      return (response.worklogs || [])
        .filter((wl) => {
          if (!wl.started) return false
          const wlMs = new Date(wl.started).getTime()
          return wl.author?.accountId === currentUser.accountId && wlMs >= startMs && wlMs <= endMs
        })
        .map((wl) => toWorklogItem(wl, issue))
    } catch {
      log.warn({ issueKey: issue.key }, 'Failed to fetch worklogs')
      return []
    }
  })

  const worklogs = worklogArrays
    .flat()
    .sort((a, b) => new Date(b.started).getTime() - new Date(a.started).getTime())

  log.info({ count: worklogs.length }, 'Total worklogs found')
  return { worklogs, totalIssues: issues.length }
}

export async function getEpicWorklogReport(
  credentials: JiraCredentials,
  epicKey: string,
): Promise<EpicWorklogReport> {
  log.info({ epicKey }, 'Generating Epic worklog report')

  const jql = `parent = "${epicKey}" ORDER BY created DESC`
  const url = buildApiUrl(credentials.jiraUrl, '/search/jql')

  const response = await request<{ issues: JiraIssue[] }>(url, 'POST', credentials, {
    jql,
    fields: ['key', 'summary', 'worklog'],
    maxResults: MAX_RESULTS,
  })

  const issues = response.issues || []
  const userMap = new Map<string, UserWorklogSummary>()
  let totalSeconds = 0
  const heavyIssues: JiraIssue[] = []

  // Process embedded worklogs
  for (const issue of issues) {
    const worklogData = issue.fields.worklog
    if (!worklogData) continue

    if (worklogData.total > worklogData.maxResults) {
      heavyIssues.push(issue)
    } else {
      processWorklogs(worklogData.worklogs, issue.key, userMap)
      totalSeconds += worklogData.worklogs.reduce((acc, wl) => acc + wl.timeSpentSeconds, 0)
    }
  }

  // Fetch full worklogs for heavy issues
  if (heavyIssues.length > 0) {
    await processBatch(heavyIssues, async (issue) => {
      const worklogUrl = buildApiUrl(credentials.jiraUrl, `/issue/${issue.key}/worklog`)
      try {
        const res = await request<{ worklogs: JiraWorklogEntry[] }>(worklogUrl, 'GET', credentials)
        processWorklogs(res.worklogs || [], issue.key, userMap)
        totalSeconds += (res.worklogs || []).reduce((acc, wl) => acc + wl.timeSpentSeconds, 0)
      } catch {
        log.warn({ issueKey: issue.key }, 'Failed to fetch worklogs')
      }
    })
  }

  const users = Array.from(userMap.values())
    .map((u) => ({ ...u, issues: [...new Set(u.issues)].sort() }))
    .sort((a, b) => b.totalTimeSeconds - a.totalTimeSeconds)

  return { totalIssues: issues.length, totalTimeSeconds: totalSeconds, users }
}

function processWorklogs(
  worklogs: JiraWorklogEntry[],
  issueKey: string,
  userMap: Map<string, UserWorklogSummary>,
): void {
  for (const wl of worklogs) {
    if (!wl.author?.accountId) continue

    const { accountId, displayName = 'Unknown' } = wl.author

    if (!userMap.has(accountId)) {
      userMap.set(accountId, { accountId, displayName, totalTimeSeconds: 0, issues: [] })
    }

    const summary = userMap.get(accountId)!
    summary.totalTimeSeconds += wl.timeSpentSeconds
    summary.issues.push(issueKey)
  }
}

export async function getActiveEpics(
  credentials: JiraCredentials,
  startDate: string,
  endDate: string,
): Promise<ActiveEpic[]> {
  log.info({ startDate, endDate }, 'Fetching active Epics')

  const jql = `worklogAuthor = currentUser() AND worklogDate >= "${startDate}" AND worklogDate <= "${endDate}" ORDER BY updated DESC`
  const url = buildApiUrl(credentials.jiraUrl, '/search/jql')

  const response = await request<{ issues: JiraIssue[] }>(url, 'POST', credentials, {
    jql,
    fields: ['key', 'summary', 'parent', 'project'],
    maxResults: MAX_RESULTS,
  })

  const epicMap = new Map<string, ActiveEpic>()

  for (const issue of response.issues || []) {
    const parent = issue.fields.parent
    if (parent?.key) {
      if (!epicMap.has(parent.key)) {
        epicMap.set(parent.key, {
          key: parent.key,
          summary: parent.fields?.summary || parent.key,
          issuesCount: 0,
        })
      }
      epicMap.get(parent.key)!.issuesCount++
    }
  }

  return Array.from(epicMap.values()).sort((a, b) => b.issuesCount - a.issuesCount)
}
