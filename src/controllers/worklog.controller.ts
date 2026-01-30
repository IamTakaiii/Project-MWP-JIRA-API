import type { CookieRecord } from '@/lib/cookie'
import { getCredentialsFromCookie } from '@/middleware'
import { JiraService } from '@/services'
import type { WorklogPayload } from '@/types'

export async function create(cookie: CookieRecord, taskId: string, payload: WorklogPayload) {
  const credentials = await getCredentialsFromCookie(cookie)
  return JiraService.createWorklog(credentials, taskId, payload)
}

export async function update(
  cookie: CookieRecord,
  issueKey: string,
  worklogId: string,
  payload: WorklogPayload,
) {
  const credentials = await getCredentialsFromCookie(cookie)
  return JiraService.updateWorklog(credentials, issueKey, worklogId, payload)
}

export async function remove(cookie: CookieRecord, issueKey: string, worklogId: string) {
  const credentials = await getCredentialsFromCookie(cookie)
  return JiraService.deleteWorklog(credentials, issueKey, worklogId)
}

export async function getHistory(cookie: CookieRecord, startDate: string, endDate: string) {
  const credentials = await getCredentialsFromCookie(cookie)
  return JiraService.getWorklogHistory(credentials, startDate, endDate)
}

export async function getEpicReport(cookie: CookieRecord, epicKey: string) {
  const credentials = await getCredentialsFromCookie(cookie)
  return JiraService.getEpicWorklogReport(credentials, epicKey)
}

export async function getActiveEpics(cookie: CookieRecord, startDate: string, endDate: string) {
  const credentials = await getCredentialsFromCookie(cookie)
  return JiraService.getActiveEpics(credentials, startDate, endDate)
}
