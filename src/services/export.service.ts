import ExcelJS from 'exceljs'
import { createLogger } from '@/lib'
import type { WorklogItem, EpicWorklogReport, ActiveEpic, MonthlyReport } from '@/types'

const log = createLogger('ExportService')

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${minutes}m`
}

function applyHeaderStyle(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
  row.alignment = { horizontal: 'center', vertical: 'middle' }
}

export async function exportWorklogHistory(
  worklogs: WorklogItem[],
  startDate: string,
  endDate: string,
): Promise<Buffer> {
  log.info({ count: worklogs.length }, 'Exporting worklog history to Excel')

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'JIRA Worklog API'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Worklog History')

  sheet.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Issue Key', key: 'issueKey', width: 15 },
    { header: 'Summary', key: 'summary', width: 40 },
    { header: 'Project', key: 'project', width: 12 },
    { header: 'Time Spent', key: 'timeSpent', width: 12 },
    { header: 'Hours', key: 'hours', width: 10 },
    { header: 'Comment', key: 'comment', width: 30 },
  ]

  applyHeaderStyle(sheet.getRow(1))

  for (const wl of worklogs) {
    sheet.addRow({
      date: new Date(wl.started).toLocaleDateString('th-TH'),
      issueKey: wl.issueKey,
      summary: wl.issueSummary,
      project: wl.projectKey || '',
      timeSpent: wl.timeSpent,
      hours: wl.timeSpentSeconds / 3600,
      comment: wl.comment,
    })
  }

  // Add summary row
  const totalSeconds = worklogs.reduce((acc, wl) => acc + wl.timeSpentSeconds, 0)
  const summaryRow = sheet.addRow({
    date: '',
    issueKey: '',
    summary: 'Total',
    project: '',
    timeSpent: formatDuration(totalSeconds),
    hours: totalSeconds / 3600,
    comment: '',
  })
  summaryRow.font = { bold: true }

  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function exportEpicReport(
  report: EpicWorklogReport,
  epicKey: string,
): Promise<Buffer> {
  log.info({ epicKey }, 'Exporting Epic report to Excel')

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'JIRA Worklog API'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Epic Report')

  sheet.columns = [
    { header: 'User', key: 'user', width: 25 },
    { header: 'Time Spent', key: 'timeSpent', width: 15 },
    { header: 'Hours', key: 'hours', width: 10 },
    { header: 'Issues Worked', key: 'issuesCount', width: 15 },
    { header: 'Issue Keys', key: 'issues', width: 40 },
  ]

  applyHeaderStyle(sheet.getRow(1))

  for (const user of report.users) {
    sheet.addRow({
      user: user.displayName,
      timeSpent: formatDuration(user.totalTimeSeconds),
      hours: user.totalTimeSeconds / 3600,
      issuesCount: user.issues.length,
      issues: user.issues.join(', '),
    })
  }

  // Summary
  const summaryRow = sheet.addRow({
    user: 'Total',
    timeSpent: formatDuration(report.totalTimeSeconds),
    hours: report.totalTimeSeconds / 3600,
    issuesCount: report.totalIssues,
    issues: '',
  })
  summaryRow.font = { bold: true }

  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function exportActiveEpics(
  epics: ActiveEpic[],
  startDate: string,
  endDate: string,
): Promise<Buffer> {
  log.info({ count: epics.length }, 'Exporting active epics to Excel')

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'JIRA Worklog API'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Active Epics')

  sheet.columns = [
    { header: 'Epic Key', key: 'key', width: 15 },
    { header: 'Summary', key: 'summary', width: 50 },
    { header: 'Issues Count', key: 'issuesCount', width: 15 },
  ]

  applyHeaderStyle(sheet.getRow(1))

  for (const epic of epics) {
    sheet.addRow({
      key: epic.key,
      summary: epic.summary,
      issuesCount: epic.issuesCount,
    })
  }

  // Summary
  const totalIssues = epics.reduce((acc, e) => acc + e.issuesCount, 0)
  const summaryRow = sheet.addRow({
    key: '',
    summary: `Total (${startDate} - ${endDate})`,
    issuesCount: totalIssues,
  })
  summaryRow.font = { bold: true }

  return Buffer.from(await workbook.xlsx.writeBuffer())
}


export async function exportMonthlyReport(report: MonthlyReport): Promise<Buffer> {
  log.info({ startDate: report.startDate, endDate: report.endDate }, 'Exporting monthly report to Excel')

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'JIRA Worklog API'
  workbook.created = new Date()

  // Sort epics by total time (descending)
  const sortedEpics = [...report.epics].sort((a, b) => b.totalTimeSeconds - a.totalTimeSeconds)

  // Summary Sheet
  const summarySheet = workbook.addWorksheet('Summary')
  summarySheet.columns = [
    { header: 'Epic Key', key: 'epicKey', width: 15 },
    { header: 'Epic Summary', key: 'epicSummary', width: 40 },
    { header: 'Total Time', key: 'totalTime', width: 15 },
    { header: 'Hours', key: 'hours', width: 12 },
    { header: 'Contributors', key: 'contributors', width: 12 },
  ]
  applyHeaderStyle(summarySheet.getRow(1))

  for (const epic of sortedEpics) {
    summarySheet.addRow({
      epicKey: epic.epicKey || '(No Epic)',
      epicSummary: epic.epicSummary,
      totalTime: formatDuration(epic.totalTimeSeconds),
      hours: Math.round((epic.totalTimeSeconds / 3600) * 100) / 100,
      contributors: epic.users.length,
    })
  }

  const totalRow = summarySheet.addRow({
    epicKey: '',
    epicSummary: 'Grand Total',
    totalTime: formatDuration(report.totalTimeSeconds),
    hours: Math.round((report.totalTimeSeconds / 3600) * 100) / 100,
    contributors: '',
  })
  totalRow.font = { bold: true }
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } }

  // Detail Sheet - All data in one sheet
  const detailSheet = workbook.addWorksheet('Details')
  detailSheet.columns = [
    { header: 'Epic Key', key: 'epicKey', width: 15 },
    { header: 'Epic Summary', key: 'epicSummary', width: 35 },
    { header: 'User', key: 'user', width: 25 },
    { header: 'Issue Key', key: 'issueKey', width: 15 },
    { header: 'Issue Summary', key: 'issueSummary', width: 40 },
    { header: 'Time Spent', key: 'timeSpent', width: 12 },
    { header: 'Hours', key: 'hours', width: 10 },
  ]
  applyHeaderStyle(detailSheet.getRow(1))

  for (const epic of sortedEpics) {
    // Sort users by total time (descending)
    const sortedUsers = [...epic.users].sort((a, b) => b.totalTimeSeconds - a.totalTimeSeconds)
    
    for (const user of sortedUsers) {
      // Sort issues by time spent (descending)
      const sortedIssues = [...user.issues].sort((a, b) => b.timeSpentSeconds - a.timeSpentSeconds)
      
      for (const issue of sortedIssues) {
        detailSheet.addRow({
          epicKey: epic.epicKey || '(No Epic)',
          epicSummary: epic.epicSummary,
          user: user.displayName,
          issueKey: issue.issueKey,
          issueSummary: issue.issueSummary,
          timeSpent: formatDuration(issue.timeSpentSeconds),
          hours: Math.round((issue.timeSpentSeconds / 3600) * 100) / 100,
        })
      }
    }
  }

  // Per-Epic Sheets
  for (const epic of sortedEpics) {
    const sheetName = (epic.epicKey || 'No Epic').substring(0, 31) // Excel sheet name limit
    const epicSheet = workbook.addWorksheet(sheetName)
    
    // Epic header info
    epicSheet.mergeCells('A1:E1')
    const titleCell = epicSheet.getCell('A1')
    titleCell.value = `${epic.epicKey || 'No Epic'}: ${epic.epicSummary}`
    titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }

    epicSheet.mergeCells('A2:E2')
    const totalCell = epicSheet.getCell('A2')
    totalCell.value = `Total: ${formatDuration(epic.totalTimeSeconds)} (${Math.round((epic.totalTimeSeconds / 3600) * 100) / 100} hours)`
    totalCell.font = { bold: true }

    // Data starts at row 4
    epicSheet.getRow(4).values = ['User', 'Issue Key', 'Issue Summary', 'Time Spent', 'Hours']
    applyHeaderStyle(epicSheet.getRow(4))
    epicSheet.getColumn(1).width = 25
    epicSheet.getColumn(2).width = 15
    epicSheet.getColumn(3).width = 40
    epicSheet.getColumn(4).width = 12
    epicSheet.getColumn(5).width = 10

    // Sort users by total time (descending)
    const sortedUsers = [...epic.users].sort((a, b) => b.totalTimeSeconds - a.totalTimeSeconds)

    let rowNum = 5
    for (const user of sortedUsers) {
      // User subtotal row
      const userRow = epicSheet.getRow(rowNum)
      userRow.values = [
        user.displayName,
        '',
        `Subtotal: ${user.issues.length} issues`,
        formatDuration(user.totalTimeSeconds),
        Math.round((user.totalTimeSeconds / 3600) * 100) / 100,
      ]
      userRow.font = { bold: true }
      userRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
      rowNum++

      // Sort issues by time spent (descending)
      const sortedIssues = [...user.issues].sort((a, b) => b.timeSpentSeconds - a.timeSpentSeconds)

      // Issue rows
      for (const issue of sortedIssues) {
        epicSheet.getRow(rowNum).values = [
          '',
          issue.issueKey,
          issue.issueSummary,
          formatDuration(issue.timeSpentSeconds),
          Math.round((issue.timeSpentSeconds / 3600) * 100) / 100,
        ]
        rowNum++
      }
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer())
}
