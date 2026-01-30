import { createLogger } from '@/lib'
import type {
  ActiveEpic,
  EpicWorklogReport,
  JiraCredentials,
  JiraIssue,
  JiraUser,
  JiraWorklogEntry,
  MonthlyReport,
  TaskSearchOptions,
  UserWorklogSummary,
  WorklogItem,
  WorklogPayload,
} from '@/types'
import {
  buildApiUrl,
  request,
  processBatch,
  getCachedUser,
  setCachedUser,
  getCachedReport,
  setCachedReport,
  getReportCacheKey,
  getCachedProjects,
  setCachedProjects,
  getCachedBoards,
  setCachedBoards,
  createReportContext,
  fetchIssuesByEpics,
  fetchWorklogsForIssues,
  buildEpicReports,
  createMonthlyReport,
  type EpicInfo,
} from './jira'

const log = createLogger('JiraService')
const MAX_RESULTS = 100
const MS_PER_DAY = 86400000

// ============================================================================
// User & Auth
// ============================================================================

export async function getCurrentUser(credentials: JiraCredentials): Promise<JiraUser> {
  const cached = getCachedUser(credentials)
  if (cached) return cached

  const url = buildApiUrl(credentials.jiraUrl, '/myself')
  const user = await request<JiraUser>(url, 'GET', credentials)
  setCachedUser(credentials, user)

  return user
}

// ============================================================================
// Task Search
// ============================================================================

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

// ============================================================================
// Worklog CRUD
// ============================================================================

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

// ============================================================================
// Worklog History
// ============================================================================

export async function getWorklogHistory(
  credentials: JiraCredentials,
  startDate: string,
  endDate: string,
): Promise<{ worklogs: WorklogItem[]; totalIssues: number }> {
  const currentUser = await getCurrentUser(credentials)
  log.info({ user: currentUser.displayName }, 'Fetching worklog history')

  const startMs = new Date(startDate).getTime()
  const endMs = new Date(endDate).getTime() + MS_PER_DAY

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

  const worklogArrays = await processBatch(issues, async (issue) => {
    const worklogUrl = buildApiUrl(
      credentials.jiraUrl,
      `/issue/${issue.key}/worklog?startedAfter=${startMs}&startedBefore=${endMs}`,
    )

    try {
      const response = await request<{ worklogs: JiraWorklogEntry[] }>(worklogUrl, 'GET', credentials)
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

function toWorklogItem(worklog: JiraWorklogEntry, issue: JiraIssue): WorklogItem {
  return {
    id: worklog.id,
    issueKey: issue.key,
    issueSummary: issue.fields.summary,
    projectKey: issue.fields.project?.key,
    author: worklog.author?.displayName || worklog.author?.emailAddress,
    authorAccountId: worklog.author?.accountId,
    timeSpent: worklog.timeSpent,
    timeSpentSeconds: worklog.timeSpentSeconds,
    started: worklog.started!,
    comment: worklog.comment?.content?.[0]?.content?.[0]?.text || '',
    created: worklog.created,
    updated: worklog.updated,
  }
}

// ============================================================================
// Epic Report
// ============================================================================

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

// ============================================================================
// Active Epics
// ============================================================================

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


// ============================================================================
// Monthly Reports (unified implementation)
// ============================================================================

export async function getMonthlyReport(
  credentials: JiraCredentials,
  startDate: string,
  endDate: string,
): Promise<MonthlyReport> {
  const cacheKey = getReportCacheKey(credentials, 'my', 'epics', startDate, endDate)
  const cached = getCachedReport(cacheKey)
  if (cached) {
    log.info({ cached: true }, 'Monthly report from cache')
    return cached
  }

  log.info({ startDate, endDate }, 'Generating monthly report')
  const ctx = createReportContext(credentials, startDate, endDate)

  // Find epics user worked on
  const epics = await findUserEpics(credentials, startDate, endDate)
  if (epics.length === 0) {
    return createMonthlyReport(ctx, [], 0)
  }

  const report = await buildReportForEpics(ctx, epics)
  setCachedReport(cacheKey, report)
  return report
}

export async function getMonthlyReportByProject(
  credentials: JiraCredentials,
  projectKey: string,
  startDate: string,
  endDate: string,
): Promise<MonthlyReport> {
  const cacheKey = getReportCacheKey(credentials, 'project', projectKey, startDate, endDate)
  const cached = getCachedReport(cacheKey)
  if (cached) {
    log.info({ projectKey, cached: true }, 'Monthly report by project from cache')
    return cached
  }

  log.info({ projectKey, startDate, endDate }, 'Generating monthly report by project')
  const ctx = createReportContext(credentials, startDate, endDate)

  // Find all epics in project
  const epics = await findProjectEpics(credentials, projectKey)
  if (epics.length === 0) {
    return createMonthlyReport(ctx, [], 0)
  }

  const report = await buildReportForEpics(ctx, epics)
  setCachedReport(cacheKey, report)
  return report
}

export async function getMonthlyReportByBoard(
  credentials: JiraCredentials,
  boardId: number,
  startDate: string,
  endDate: string,
): Promise<MonthlyReport> {
  const cacheKey = getReportCacheKey(credentials, 'board', boardId, startDate, endDate)
  const cached = getCachedReport(cacheKey)
  if (cached) {
    log.info({ boardId, cached: true }, 'Monthly report by board from cache')
    return cached
  }

  log.info({ boardId, startDate, endDate }, 'Generating monthly report by board')
  const ctx = createReportContext(credentials, startDate, endDate)

  // Find issues with worklogs in board
  const { epics, issues } = await findBoardIssuesWithWorklogs(credentials, boardId, startDate, endDate)
  if (epics.length === 0) {
    return createMonthlyReport(ctx, [], 0)
  }

  // Group issues by epic
  const issuesByEpic = new Map<string, JiraIssue[]>()
  for (const issue of issues) {
    const epicKey = issue.fields.parent?.key
    if (!epicKey) continue
    if (!issuesByEpic.has(epicKey)) {
      issuesByEpic.set(epicKey, [])
    }
    issuesByEpic.get(epicKey)!.push(issue)
  }

  // Fetch worklogs and build report
  const worklogsByIssue = await fetchWorklogsForIssues(ctx, issues, 25)
  const { reports, totalSeconds } = buildEpicReports(ctx, epics, issuesByEpic, worklogsByIssue)

  log.info({ boardId, epics: reports.length, totalIssues: issues.length }, 'Monthly report by board generated')

  const report = createMonthlyReport(ctx, reports, totalSeconds)
  setCachedReport(cacheKey, report)
  return report
}

// Helper: build report for given epics
async function buildReportForEpics(
  ctx: ReturnType<typeof createReportContext>,
  epics: EpicInfo[],
): Promise<MonthlyReport> {
  const epicKeys = epics.map(e => e.epicKey)
  const issuesByEpic = await fetchIssuesByEpics(ctx, epicKeys)

  const allIssues = Array.from(issuesByEpic.values()).flat()
  const worklogsByIssue = await fetchWorklogsForIssues(ctx, allIssues, 10)

  const { reports, totalSeconds } = buildEpicReports(ctx, epics, issuesByEpic, worklogsByIssue)

  log.info({ epics: reports.length, totalIssues: allIssues.length }, 'Monthly report generated')
  return createMonthlyReport(ctx, reports, totalSeconds)
}

// Helper: find epics user worked on
async function findUserEpics(
  credentials: JiraCredentials,
  startDate: string,
  endDate: string,
): Promise<EpicInfo[]> {
  const jql = `worklogAuthor = currentUser() AND worklogDate >= "${startDate}" AND worklogDate <= "${endDate}" ORDER BY updated DESC`
  const url = buildApiUrl(credentials.jiraUrl, '/search/jql')

  const response = await request<{ issues: JiraIssue[] }>(url, 'POST', credentials, {
    jql,
    fields: ['key', 'summary', 'parent', 'project'],
    maxResults: MAX_RESULTS,
  })

  const epics: EpicInfo[] = []
  const seen = new Set<string>()

  for (const issue of response.issues || []) {
    const parent = issue.fields.parent
    if (parent?.key && !seen.has(parent.key)) {
      seen.add(parent.key)
      epics.push({
        epicKey: parent.key,
        epicSummary: parent.fields?.summary || parent.key,
      })
    }
  }

  return epics
}

// Helper: find all epics in project
async function findProjectEpics(
  credentials: JiraCredentials,
  projectKey: string,
): Promise<EpicInfo[]> {
  const jql = `project = "${projectKey}" AND issuetype = Epic ORDER BY created DESC`
  const url = buildApiUrl(credentials.jiraUrl, '/search/jql')

  const response = await request<{ issues: JiraIssue[] }>(url, 'POST', credentials, {
    jql,
    fields: ['key', 'summary'],
    maxResults: MAX_RESULTS,
  })

  return (response.issues || []).map(epic => ({
    epicKey: epic.key,
    epicSummary: epic.fields.summary,
  }))
}

// Helper: find board issues with worklogs
async function findBoardIssuesWithWorklogs(
  credentials: JiraCredentials,
  boardId: number,
  startDate: string,
  endDate: string,
): Promise<{ epics: EpicInfo[]; issues: JiraIssue[] }> {
  const baseUrl = credentials.jiraUrl.replace(/\/$/, '')

  // Get board filter
  let boardFilter: string | undefined
  try {
    const configUrl = `${baseUrl}/rest/agile/1.0/board/${boardId}/configuration`
    const config = await request<{ filter?: { id: string } }>(configUrl, 'GET', credentials)
    boardFilter = config.filter?.id
  } catch {
    log.warn({ boardId }, 'Could not get board configuration')
  }

  // Build JQL
  let jql: string
  if (boardFilter) {
    jql = `filter = ${boardFilter} AND worklogDate >= "${startDate}" AND worklogDate <= "${endDate}" ORDER BY updated DESC`
  } else {
    const boardInfoUrl = `${baseUrl}/rest/agile/1.0/board/${boardId}`
    const boardInfo = await request<{ location?: { projectKey?: string } }>(boardInfoUrl, 'GET', credentials)
    const projectKey = boardInfo.location?.projectKey

    if (!projectKey) {
      log.warn({ boardId }, 'Board has no filter or project')
      return { epics: [], issues: [] }
    }
    jql = `project = "${projectKey}" AND worklogDate >= "${startDate}" AND worklogDate <= "${endDate}" ORDER BY updated DESC`
  }

  // Fetch issues with pagination
  const searchUrl = buildApiUrl(credentials.jiraUrl, '/search/jql')
  const allIssues: JiraIssue[] = []
  let nextPageToken: string | undefined

  do {
    const body: Record<string, unknown> = {
      jql,
      fields: ['key', 'summary', 'parent'],
      maxResults: 100,
    }
    if (nextPageToken) {
      body['nextPageToken'] = nextPageToken
    }

    const response = await request<{ issues: JiraIssue[]; nextPageToken?: string }>(
      searchUrl,
      'POST',
      credentials,
      body,
    )

    allIssues.push(...(response.issues || []))
    nextPageToken = response.nextPageToken
  } while (nextPageToken)

  log.info({ boardId, issuesWithWorklogs: allIssues.length }, 'Found issues with worklogs in date range')

  // Extract epics
  const epicMap = new Map<string, EpicInfo>()
  for (const issue of allIssues) {
    const parent = issue.fields.parent
    if (parent?.key && !epicMap.has(parent.key)) {
      epicMap.set(parent.key, {
        epicKey: parent.key,
        epicSummary: parent.fields?.summary || parent.key,
      })
    }
  }

  return { epics: Array.from(epicMap.values()), issues: allIssues }
}

// ============================================================================
// Projects & Boards
// ============================================================================

export async function getMyProjects(
  credentials: JiraCredentials,
): Promise<{ key: string; name: string }[]> {
  const cached = getCachedProjects(credentials)
  if (cached) {
    log.info({ count: cached.length, cached: true }, 'Projects fetched from cache')
    return cached
  }

  log.info('Fetching user projects')

  const projects = await fetchAllPages<{ key: string; name: string }>(
    credentials,
    '/project/search',
    (item) => ({ key: item.key, name: item.name }),
  )

  const sorted = projects.sort((a, b) => a.key.localeCompare(b.key))
  setCachedProjects(credentials, sorted)

  log.info({ count: sorted.length }, 'Projects fetched')
  return sorted
}

export async function getBoards(
  credentials: JiraCredentials,
): Promise<{ id: number; name: string; projectKey?: string }[]> {
  const cached = getCachedBoards(credentials)
  if (cached) {
    log.info({ count: cached.length, cached: true }, 'Boards fetched from cache')
    return cached
  }

  log.info('Fetching boards')

  const baseUrl = credentials.jiraUrl.replace(/\/$/, '')
  const boards = await fetchAllPagesAgile<{ id: number; name: string; projectKey?: string }>(
    credentials,
    baseUrl,
    '/board',
    (item) => ({
      id: item.id,
      name: item.name,
      ...(item.location?.projectKey && { projectKey: item.location.projectKey }),
    }),
  )

  const sorted = boards.sort((a, b) => a.name.localeCompare(b.name))
  setCachedBoards(credentials, sorted)

  log.info({ count: sorted.length }, 'Boards fetched')
  return sorted
}

// Generic pagination helper for REST API v3
async function fetchAllPages<T>(
  credentials: JiraCredentials,
  path: string,
  transform: (item: any) => T,
): Promise<T[]> {
  const firstUrl = buildApiUrl(credentials.jiraUrl, `${path}?startAt=0&maxResults=100`)
  const firstResponse = await request<{ values: any[]; total: number }>(firstUrl, 'GET', credentials)

  const results: T[] = firstResponse.values.map(transform)
  const total = firstResponse.total

  if (results.length < total) {
    const pages: number[] = []
    for (let startAt = 100; startAt < total; startAt += 100) {
      pages.push(startAt)
    }

    const pageResults = await Promise.all(
      pages.map(async (startAt) => {
        const url = buildApiUrl(credentials.jiraUrl, `${path}?startAt=${startAt}&maxResults=100`)
        const response = await request<{ values: any[] }>(url, 'GET', credentials)
        return response.values.map(transform)
      }),
    )

    for (const page of pageResults) {
      results.push(...page)
    }
  }

  return results
}

// Generic pagination helper for Agile API
async function fetchAllPagesAgile<T>(
  credentials: JiraCredentials,
  baseUrl: string,
  path: string,
  transform: (item: any) => T,
): Promise<T[]> {
  const firstUrl = `${baseUrl}/rest/agile/1.0${path}?startAt=0&maxResults=100`
  const firstResponse = await request<{ values: any[]; total: number }>(firstUrl, 'GET', credentials)

  const results: T[] = firstResponse.values.map(transform)
  const total = firstResponse.total

  if (results.length < total) {
    const pages: number[] = []
    for (let startAt = 100; startAt < total; startAt += 100) {
      pages.push(startAt)
    }

    const pageResults = await Promise.all(
      pages.map(async (startAt) => {
        const url = `${baseUrl}/rest/agile/1.0${path}?startAt=${startAt}&maxResults=100`
        const response = await request<{ values: any[] }>(url, 'GET', credentials)
        return response.values.map(transform)
      }),
    )

    for (const page of pageResults) {
      results.push(...page)
    }
  }

  return results
}
