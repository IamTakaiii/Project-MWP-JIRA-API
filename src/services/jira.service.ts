import { createLogger, ExternalServiceError } from '@/lib'
import type {
  JiraCredentials,
  WorklogPayload,
  WorklogItem,
  JiraIssue,
} from '@/types'
import type { SearchResponse, WorklogApiResponse, UserResponse } from '@/types/services/jira.types'

const log = createLogger('JiraService')

const CONCURRENCY = 6
const MAX_SEARCH_RESULTS = 100
const MAX_TASK_RESULTS = 50
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000
const USER_CACHE_TTL = 5 * 60 * 1000

class UrlBuilder {
  normalize(url: string): string {
    return url.replace(/\/$/, '')
  }

  buildApiUrl(baseUrl: string, path: string): string {
    const normalized = this.normalize(baseUrl)
    return `${normalized}/rest/api/3${path}`
  }
}

class AuthHeaderBuilder {
  create(email: string, apiToken: string): string {
    const credentials = `${email}:${apiToken}`
    return `Basic ${Buffer.from(credentials).toString('base64')}`
  }
}

class JiraHttpClient {
  constructor(
    private urlBuilder: UrlBuilder,
    private authBuilder: AuthHeaderBuilder
  ) {}

  async request<T>(
    url: string,
    options: RequestInit,
    credentials: JiraCredentials
  ): Promise<T> {
    const authHeader = this.authBuilder.create(credentials.email, credentials.apiToken)

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

    if (!responseText) {
      return {} as T
    }

    try {
      return JSON.parse(responseText) as T
    } catch {
      return responseText as unknown as T
    }
  }
}

class BatchProcessor {
  async process<T, R>(
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
}

class JqlBuilder {
  buildTaskSearch(options: { searchText?: string; status?: string }): string {
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

  buildWorklogHistory(startDate: string, endDate: string): string {
    return `worklogAuthor = currentUser() AND worklogDate >= ${startDate} AND worklogDate <= ${endDate} ORDER BY updated DESC`
  }
}

class WorklogMapper {
  extractCommentText(comment?: { content?: Array<{ content?: Array<{ text?: string }> }> }): string {
    return comment?.content?.[0]?.content?.[0]?.text || ''
  }

  toWorklogItem(worklog: WorklogApiResponse['worklogs'][0], issue: JiraIssue): WorklogItem {
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
      comment: this.extractCommentText(worklog.comment),
      created: worklog.created,
      updated: worklog.updated,
    }
  }
}

class UserCache {
  private cache = new Map<string, { user: UserResponse; timestamp: number }>()

  getCacheKey(credentials: JiraCredentials): string {
    return `${credentials.jiraUrl}:${credentials.email}`
  }

  get(credentials: JiraCredentials): UserResponse | null {
    const cacheKey = this.getCacheKey(credentials)
    const cached = this.cache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < USER_CACHE_TTL) {
      return cached.user
    }

    return null
  }

  set(credentials: JiraCredentials, user: UserResponse): void {
    const cacheKey = this.getCacheKey(credentials)
    this.cache.set(cacheKey, { user, timestamp: Date.now() })
  }
}

class JiraApiService {
  constructor(
    private client: JiraHttpClient,
    private urlBuilder: UrlBuilder,
    private jqlBuilder: JqlBuilder,
    private worklogMapper: WorklogMapper,
    private userCache: UserCache,
    private batchProcessor: BatchProcessor
  ) {}

  async createWorklog(
    credentials: JiraCredentials,
    issueKey: string,
    payload: WorklogPayload
  ): Promise<unknown> {
    const url = this.urlBuilder.buildApiUrl(credentials.jiraUrl, `/issue/${issueKey}/worklog`)

    log.info({ issueKey }, 'Creating worklog')

    return this.client.request(url, {
      method: 'POST',
      body: JSON.stringify(payload),
    }, credentials)
  }

  async updateWorklog(
    credentials: JiraCredentials,
    issueKey: string,
    worklogId: string,
    payload: WorklogPayload
  ): Promise<unknown> {
    const url = this.urlBuilder.buildApiUrl(
      credentials.jiraUrl,
      `/issue/${issueKey}/worklog/${worklogId}`
    )

    log.info({ issueKey, worklogId }, 'Updating worklog')

    return this.client.request(url, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }, credentials)
  }

  async deleteWorklog(
    credentials: JiraCredentials,
    issueKey: string,
    worklogId: string
  ): Promise<{ success: boolean }> {
    const url = this.urlBuilder.buildApiUrl(
      credentials.jiraUrl,
      `/issue/${issueKey}/worklog/${worklogId}`
    )

    log.info({ issueKey, worklogId }, 'Deleting worklog')

    await this.client.request(url, { method: 'DELETE' }, credentials)

    return { success: true }
  }

  async getCurrentUser(credentials: JiraCredentials): Promise<UserResponse> {
    const cached = this.userCache.get(credentials)
    if (cached) return cached

    const url = this.urlBuilder.buildApiUrl(credentials.jiraUrl, '/myself')
    const user = await this.client.request<UserResponse>(url, { method: 'GET' }, credentials)

    this.userCache.set(credentials, user)

    return user
  }

  async searchMyTasks(
    credentials: JiraCredentials,
    options: { searchText?: string; status?: string } = {}
  ): Promise<{ issues: JiraIssue[]; total: number }> {
    const url = this.urlBuilder.buildApiUrl(credentials.jiraUrl, '/search/jql')
    const jql = this.jqlBuilder.buildTaskSearch(options)

    log.debug({ jql }, 'Searching tasks')

    const response = await this.client.request<SearchResponse>(url, {
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
  }

  async getWorklogHistory(
    credentials: JiraCredentials,
    startDate: string,
    endDate: string
  ): Promise<{ worklogs: WorklogItem[]; totalIssues: number }> {
    const currentUser = await this.getCurrentUser(credentials)
    log.info({ user: currentUser.displayName }, 'Fetching worklog history')

    const startMs = new Date(startDate).getTime()
    const endMs = new Date(endDate).getTime() + MILLISECONDS_PER_DAY

    const issues = await this.searchIssuesWithWorklogs(credentials, startDate, endDate)

    if (issues.length === 0) {
      return { worklogs: [], totalIssues: 0 }
    }

    const worklogArrays = await this.batchProcessor.process(
      issues,
      (issue) => this.fetchWorklogsForIssue(credentials, issue, currentUser, startMs, endMs)
    )

    const worklogs = worklogArrays.flat()
    const sortedWorklogs = this.sortWorklogsByDate(worklogs)

    log.info({ count: sortedWorklogs.length }, 'Total worklogs found')

    return { worklogs: sortedWorklogs, totalIssues: issues.length }
  }

  private async searchIssuesWithWorklogs(
    credentials: JiraCredentials,
    startDate: string,
    endDate: string
  ): Promise<JiraIssue[]> {
    const jql = this.jqlBuilder.buildWorklogHistory(startDate, endDate)
    const searchUrl = this.urlBuilder.buildApiUrl(credentials.jiraUrl, '/search/jql')

    const searchResponse = await this.client.request<SearchResponse>(searchUrl, {
      method: 'POST',
      body: JSON.stringify({
        jql,
        fields: ['key', 'summary', 'project'],
        maxResults: MAX_SEARCH_RESULTS,
      }),
    }, credentials)

    const issues = searchResponse.issues || []
    log.debug({ count: issues.length }, 'Found issues with worklogs')

    return issues
  }

  private async fetchWorklogsForIssue(
    credentials: JiraCredentials,
    issue: JiraIssue,
    currentUser: UserResponse,
    startMs: number,
    endMs: number
  ): Promise<WorklogItem[]> {
    const worklogUrl = this.urlBuilder.buildApiUrl(
      credentials.jiraUrl,
      `/issue/${issue.key}/worklog?startedAfter=${startMs}&startedBefore=${endMs}`
    )

    try {
      const response = await this.client.request<WorklogApiResponse>(
        worklogUrl,
        { method: 'GET' },
        credentials
      )

      return (response.worklogs || [])
        .filter((wl) => this.isValidWorklog(wl, currentUser, startMs, endMs))
        .map((wl) => this.worklogMapper.toWorklogItem(wl, issue))
    } catch (error) {
      log.warn({ issueKey: issue.key, error }, 'Failed to fetch worklogs for issue')
      return []
    }
  }

  private isValidWorklog(
    worklog: WorklogApiResponse['worklogs'][0],
    currentUser: UserResponse,
    startMs: number,
    endMs: number
  ): boolean {
    if (!worklog.started) return false
    const wlStartedMs = new Date(worklog.started).getTime()
    return (
      worklog.author?.accountId === currentUser.accountId &&
      wlStartedMs >= startMs &&
      wlStartedMs <= endMs
    )
  }

  private sortWorklogsByDate(worklogs: WorklogItem[]): WorklogItem[] {
    const worklogsWithTimestamps = worklogs.map((wl) => ({
      worklog: wl,
      timestamp: new Date(wl.started).getTime(),
    }))

    worklogsWithTimestamps.sort((a, b) => b.timestamp - a.timestamp)

    return worklogsWithTimestamps.map((item) => item.worklog)
  }
}

const urlBuilder = new UrlBuilder()
const authBuilder = new AuthHeaderBuilder()
const client = new JiraHttpClient(urlBuilder, authBuilder)
const jqlBuilder = new JqlBuilder()
const worklogMapper = new WorklogMapper()
const userCache = new UserCache()
const batchProcessor = new BatchProcessor()

const apiService = new JiraApiService(
  client,
  urlBuilder,
  jqlBuilder,
  worklogMapper,
  userCache,
  batchProcessor
)

export const JiraService = {
  createWorklog: (credentials: JiraCredentials, issueKey: string, payload: WorklogPayload) =>
    apiService.createWorklog(credentials, issueKey, payload),
  updateWorklog: (credentials: JiraCredentials, issueKey: string, worklogId: string, payload: WorklogPayload) =>
    apiService.updateWorklog(credentials, issueKey, worklogId, payload),
  deleteWorklog: (credentials: JiraCredentials, issueKey: string, worklogId: string) =>
    apiService.deleteWorklog(credentials, issueKey, worklogId),
  getCurrentUser: (credentials: JiraCredentials) =>
    apiService.getCurrentUser(credentials),
  searchMyTasks: (credentials: JiraCredentials, options?: { searchText?: string; status?: string }) =>
    apiService.searchMyTasks(credentials, options),
  getWorklogHistory: (credentials: JiraCredentials, startDate: string, endDate: string) =>
    apiService.getWorklogHistory(credentials, startDate, endDate),
}
