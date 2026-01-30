import type { CookieRecord } from '@/lib/cookie'
import { getCredentialsFromCookie } from '@/middleware'
import { JiraService, ExportService } from '@/services'
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

export async function getMonthlyReport(cookie: CookieRecord, startDate: string, endDate: string) {
  const credentials = await getCredentialsFromCookie(cookie)
  return JiraService.getMonthlyReport(credentials, startDate, endDate)
}

export async function exportHistoryExcel(cookie: CookieRecord, startDate: string, endDate: string) {
  const credentials = await getCredentialsFromCookie(cookie)
  const { worklogs } = await JiraService.getWorklogHistory(credentials, startDate, endDate)
  return ExportService.exportWorklogHistory(worklogs, startDate, endDate)
}

export async function exportEpicReportExcel(cookie: CookieRecord, epicKey: string) {
  const credentials = await getCredentialsFromCookie(cookie)
  const report = await JiraService.getEpicWorklogReport(credentials, epicKey)
  return ExportService.exportEpicReport(report, epicKey)
}

export async function exportActiveEpicsExcel(cookie: CookieRecord, startDate: string, endDate: string) {
  const credentials = await getCredentialsFromCookie(cookie)
  const epics = await JiraService.getActiveEpics(credentials, startDate, endDate)
  return ExportService.exportActiveEpics(epics, startDate, endDate)
}

export async function exportMonthlyReportExcel(cookie: CookieRecord, startDate: string, endDate: string) {
  const credentials = await getCredentialsFromCookie(cookie)
  const report = await JiraService.getMonthlyReport(credentials, startDate, endDate)
  return ExportService.exportMonthlyReport(report)
}

export async function getMonthlyReportByProject(cookie: CookieRecord, projectKey: string, startDate: string, endDate: string) {
  const credentials = await getCredentialsFromCookie(cookie)
  return JiraService.getMonthlyReportByProject(credentials, projectKey, startDate, endDate)
}

export async function getMonthlyReportByBoard(cookie: CookieRecord, boardId: number, startDate: string, endDate: string) {
  console.log('Controller received boardId:', boardId, 'type:', typeof boardId)
  const credentials = await getCredentialsFromCookie(cookie)
  return JiraService.getMonthlyReportByBoard(credentials, boardId, startDate, endDate)
}

export async function exportMonthlyReportByProjectExcel(cookie: CookieRecord, projectKey: string, startDate: string, endDate: string) {
  const credentials = await getCredentialsFromCookie(cookie)
  const report = await JiraService.getMonthlyReportByProject(credentials, projectKey, startDate, endDate)
  return ExportService.exportMonthlyReport(report)
}

export async function getMyProjects(cookie: CookieRecord) {
  const credentials = await getCredentialsFromCookie(cookie)
  return JiraService.getMyProjects(credentials)
}

export async function getBoards(cookie: CookieRecord) {
  const credentials = await getCredentialsFromCookie(cookie)
  return JiraService.getBoards(credentials)
}

export async function exportMonthlyReportByBoardExcel(cookie: CookieRecord, boardId: number, startDate: string, endDate: string) {
  const credentials = await getCredentialsFromCookie(cookie)
  const report = await JiraService.getMonthlyReportByBoard(credentials, boardId, startDate, endDate)
  return ExportService.exportMonthlyReport(report)
}
