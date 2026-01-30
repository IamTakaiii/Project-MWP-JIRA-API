import type {
  JiraCredentials,
  JiraIssue,
  JiraWorklogEntry,
  MonthlyEpicReport,
  MonthlyReport,
  MonthlyUserEpicWorklog,
} from '@/types'
import { createLogger } from '@/lib'
import { buildApiUrl, processBatch, request } from './http-client'

const log = createLogger('ReportBuilder')
const MS_PER_DAY = 86400000

export interface EpicInfo {
  epicKey: string
  epicSummary: string
}

export interface ReportContext {
  credentials: JiraCredentials
  startDate: string
  endDate: string
  startMs: number
  endMs: number
}

export function createReportContext(
  credentials: JiraCredentials,
  startDate: string,
  endDate: string,
): ReportContext {
  return {
    credentials,
    startDate,
    endDate,
    startMs: new Date(startDate).getTime(),
    endMs: new Date(endDate).getTime() + MS_PER_DAY,
  }
}

// Fetch issues for multiple epics in single query
export async function fetchIssuesByEpics(
  ctx: ReportContext,
  epicKeys: string[],
): Promise<Map<string, JiraIssue[]>> {
  if (epicKeys.length === 0) return new Map()

  const url = buildApiUrl(ctx.credentials.jiraUrl, '/search/jql')
  const jql = `parent in (${epicKeys.map(k => `"${k}"`).join(', ')}) ORDER BY parent ASC`

  const response = await request<{ issues: JiraIssue[] }>(url, 'POST', ctx.credentials, {
    jql,
    fields: ['key', 'summary', 'parent'],
    maxResults: 200,
  })

  const issuesByEpic = new Map<string, JiraIssue[]>()
  for (const issue of response.issues || []) {
    const epicKey = issue.fields.parent?.key
    if (!epicKey) continue
    if (!issuesByEpic.has(epicKey)) {
      issuesByEpic.set(epicKey, [])
    }
    issuesByEpic.get(epicKey)!.push(issue)
  }

  return issuesByEpic
}

// Fetch worklogs for issues
export async function fetchWorklogsForIssues(
  ctx: ReportContext,
  issues: JiraIssue[],
  concurrency = 10,
): Promise<Map<string, JiraWorklogEntry[]>> {
  const results = new Map<string, JiraWorklogEntry[]>()

  await processBatch(issues, async (issue) => {
    const url = buildApiUrl(
      ctx.credentials.jiraUrl,
      `/issue/${issue.key}/worklog?startedAfter=${ctx.startMs}&startedBefore=${ctx.endMs}`,
    )
    try {
      const res = await request<{ worklogs: JiraWorklogEntry[] }>(url, 'GET', ctx.credentials)
      results.set(issue.key, res.worklogs || [])
    } catch {
      log.warn({ issueKey: issue.key }, 'Failed to fetch worklogs')
      results.set(issue.key, [])
    }
  }, concurrency)

  return results
}

// Build epic reports from issues and worklogs
export function buildEpicReports(
  ctx: ReportContext,
  epics: EpicInfo[],
  issuesByEpic: Map<string, JiraIssue[]>,
  worklogsByIssue: Map<string, JiraWorklogEntry[]>,
): { reports: MonthlyEpicReport[]; totalSeconds: number } {
  const epicReports: MonthlyEpicReport[] = []
  let grandTotalSeconds = 0

  for (const epic of epics) {
    const issues = issuesByEpic.get(epic.epicKey) || []
    if (issues.length === 0) continue

    const { users, totalSeconds } = aggregateWorklogs(ctx, issues, worklogsByIssue)

    if (totalSeconds > 0) {
      epicReports.push({
        epicKey: epic.epicKey,
        epicSummary: epic.epicSummary,
        totalTimeSeconds: totalSeconds,
        users,
      })
      grandTotalSeconds += totalSeconds
    }
  }

  epicReports.sort((a, b) => b.totalTimeSeconds - a.totalTimeSeconds)
  return { reports: epicReports, totalSeconds: grandTotalSeconds }
}

function aggregateWorklogs(
  ctx: ReportContext,
  issues: JiraIssue[],
  worklogsByIssue: Map<string, JiraWorklogEntry[]>,
): { users: MonthlyUserEpicWorklog[]; totalSeconds: number } {
  const userMap = new Map<string, MonthlyUserEpicWorklog>()
  let totalSeconds = 0

  for (const issue of issues) {
    const worklogs = worklogsByIssue.get(issue.key) || []

    for (const wl of worklogs) {
      if (!wl.author?.accountId || !wl.started) continue

      const wlMs = new Date(wl.started).getTime()
      if (wlMs < ctx.startMs || wlMs > ctx.endMs) continue

      const { accountId, displayName = 'Unknown' } = wl.author

      if (!userMap.has(accountId)) {
        userMap.set(accountId, {
          accountId,
          displayName,
          totalTimeSeconds: 0,
          issues: [],
        })
      }

      const user = userMap.get(accountId)!
      user.totalTimeSeconds += wl.timeSpentSeconds
      totalSeconds += wl.timeSpentSeconds

      let issueEntry = user.issues.find(i => i.issueKey === issue.key)
      if (!issueEntry) {
        issueEntry = {
          issueKey: issue.key,
          issueSummary: issue.fields.summary,
          timeSpentSeconds: 0,
        }
        user.issues.push(issueEntry)
      }
      issueEntry.timeSpentSeconds += wl.timeSpentSeconds
    }
  }

  const users = Array.from(userMap.values())
    .map(u => ({
      ...u,
      issues: u.issues.sort((a, b) => b.timeSpentSeconds - a.timeSpentSeconds),
    }))
    .sort((a, b) => b.totalTimeSeconds - a.totalTimeSeconds)

  return { users, totalSeconds }
}

// Create final report
export function createMonthlyReport(
  ctx: ReportContext,
  epicReports: MonthlyEpicReport[],
  totalSeconds: number,
): MonthlyReport {
  return {
    startDate: ctx.startDate,
    endDate: ctx.endDate,
    totalTimeSeconds: totalSeconds,
    epics: epicReports,
  }
}
