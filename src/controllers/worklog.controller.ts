import { JiraService } from '@/services'
import { getCredentialsFromCookie } from '@/middleware'
import type { CookieRecord } from '@/lib/cookie'
import type { WorklogPayload } from '@/types'

export class WorklogController {
  async create(cookie: CookieRecord, taskId: string, payload: WorklogPayload) {
    const credentials = await getCredentialsFromCookie(cookie)
    return JiraService.createWorklog(credentials, taskId, payload)
  }

  async update(cookie: CookieRecord, issueKey: string, worklogId: string, payload: WorklogPayload) {
    const credentials = await getCredentialsFromCookie(cookie)
    return JiraService.updateWorklog(credentials, issueKey, worklogId, payload)
  }

  async delete(cookie: CookieRecord, issueKey: string, worklogId: string) {
    const credentials = await getCredentialsFromCookie(cookie)
    return JiraService.deleteWorklog(credentials, issueKey, worklogId)
  }

  async getHistory(cookie: CookieRecord, startDate: string, endDate: string) {
    const credentials = await getCredentialsFromCookie(cookie)
    return JiraService.getWorklogHistory(credentials, startDate, endDate)
  }
}
