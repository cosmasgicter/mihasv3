/**
 * Notification Analytics Export Utilities
 * Provides functions to export notification analytics data in various formats
 * Requirements: 6.5 - Generate reports on notification effectiveness
 */

import { jsPDF } from 'jspdf'
import * as XLSX from 'xlsx'

export interface NotificationAnalyticsExportData {
  summary: {
    total_notifications: number
    successful_deliveries: number
    failed_deliveries: number
    overall_success_rate: number
    time_period_days: number
    generated_at: string
  }
  channel_breakdown: Array<{
    channel: string
    total_notifications: number
    success_rate: number
    delivery_rate: number
  }>
  daily_trends: Array<{
    date: string
    total_notifications: number
    success_rate: number
  }>
  optimal_hours: Array<{
    hour: number
    success_rate: number
    total_notifications: number
  }>
  user_engagement?: Array<{
    user_id: string
    engagement_score: number
    preferred_channel: string
    total_notifications_received: number
  }>
}

export type ExportFormat = 'pdf' | 'excel' | 'csv' | 'json'

/**
 * Export notification analytics data in the specified format
 */
export async function exportNotificationAnalytics(
  data: NotificationAnalyticsExportData,
  format: ExportFormat,
  filename?: string
): Promise<void> {
  const baseFilename = filename || `notification-analytics-${new Date().toISOString().split('T')[0]}`
  
  switch (format) {
    case 'pdf':
      await exportToPDF(data, `${baseFilename}.pdf`)
      break
    case 'excel':
      await exportToExcel(data, `${baseFilename}.xlsx`)
      break
    case 'csv':
      await exportToCSV(data, `${baseFilename}.csv`)
      break
    case 'json':
      await exportToJSON(data, `${baseFilename}.json`)
      break
    default:
      throw new Error(`Unsupported export format: ${format}`)
  }
}

/**
 * Export to PDF format
 */
async function exportToPDF(data: NotificationAnalyticsExportData, filename: string): Promise<void> {
  const doc = new jsPDF()
  let yPosition = 20

  // Title
  doc.setFontSize(20)
  doc.text('Notification Analytics Report', 20, yPosition)
  yPosition += 20

  // Summary section
  doc.setFontSize(16)
  doc.text('Summary', 20, yPosition)
  yPosition += 10

  doc.setFontSize(12)
  doc.text(`Report Period: ${data.summary.time_period_days} days`, 20, yPosition)
  yPosition += 8
  doc.text(`Generated: ${data.summary.generated_at}`, 20, yPosition)
  yPosition += 8
  doc.text(`Total Notifications: ${data.summary.total_notifications.toLocaleString()}`, 20, yPosition)
  yPosition += 8
  doc.text(`Successful Deliveries: ${data.summary.successful_deliveries.toLocaleString()}`, 20, yPosition)
  yPosition += 8
  doc.text(`Failed Deliveries: ${data.summary.failed_deliveries.toLocaleString()}`, 20, yPosition)
  yPosition += 8
  doc.text(`Overall Success Rate: ${data.summary.overall_success_rate.toFixed(1)}%`, 20, yPosition)
  yPosition += 20

  // Channel breakdown
  if (data.channel_breakdown.length > 0) {
    doc.setFontSize(16)
    doc.text('Channel Performance', 20, yPosition)
    yPosition += 15

    doc.setFontSize(10)
    doc.text('Channel', 20, yPosition)
    doc.text('Total', 60, yPosition)
    doc.text('Success Rate', 100, yPosition)
    doc.text('Delivery Rate', 140, yPosition)
    yPosition += 8

    data.channel_breakdown.forEach(channel => {
      doc.text(channel.channel, 20, yPosition)
      doc.text(channel.total_notifications.toString(), 60, yPosition)
      doc.text(`${channel.success_rate.toFixed(1)}%`, 100, yPosition)
      doc.text(`${channel.delivery_rate.toFixed(1)}%`, 140, yPosition)
      yPosition += 6

      if (yPosition > 270) {
        doc.addPage()
        yPosition = 20
      }
    })
  }

  // Optimal hours
  if (data.optimal_hours.length > 0) {
    yPosition += 15
    if (yPosition > 250) {
      doc.addPage()
      yPosition = 20
    }

    doc.setFontSize(16)
    doc.text('Optimal Delivery Hours (Top 10)', 20, yPosition)
    yPosition += 15

    doc.setFontSize(10)
    doc.text('Hour', 20, yPosition)
    doc.text('Success Rate', 60, yPosition)
    doc.text('Total Sent', 120, yPosition)
    yPosition += 8

    data.optimal_hours.slice(0, 10).forEach(hour => {
      doc.text(`${hour.hour}:00`, 20, yPosition)
      doc.text(`${hour.success_rate.toFixed(1)}%`, 60, yPosition)
      doc.text(hour.total_notifications.toString(), 120, yPosition)
      yPosition += 6
    })
  }

  // Save the PDF
  doc.save(filename)
}

/**
 * Export to Excel format
 */
async function exportToExcel(data: NotificationAnalyticsExportData, filename: string): Promise<void> {
  const workbook = XLSX.utils.book_new()

  // Summary sheet
  const summaryData = [
    ['Metric', 'Value'],
    ['Report Period (days)', data.summary.time_period_days],
    ['Generated At', data.summary.generated_at],
    ['Total Notifications', data.summary.total_notifications],
    ['Successful Deliveries', data.summary.successful_deliveries],
    ['Failed Deliveries', data.summary.failed_deliveries],
    ['Overall Success Rate (%)', data.summary.overall_success_rate.toFixed(1)]
  ]
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')

  // Channel breakdown sheet
  if (data.channel_breakdown.length > 0) {
    const channelData = [
      ['Channel', 'Total Notifications', 'Success Rate (%)', 'Delivery Rate (%)'],
      ...data.channel_breakdown.map(channel => [
        channel.channel,
        channel.total_notifications,
        channel.success_rate.toFixed(1),
        channel.delivery_rate.toFixed(1)
      ])
    ]
    const channelSheet = XLSX.utils.aoa_to_sheet(channelData)
    XLSX.utils.book_append_sheet(workbook, channelSheet, 'Channel Performance')
  }

  // Daily trends sheet
  if (data.daily_trends.length > 0) {
    const trendsData = [
      ['Date', 'Total Notifications', 'Success Rate (%)'],
      ...data.daily_trends.map(trend => [
        trend.date,
        trend.total_notifications,
        trend.success_rate.toFixed(1)
      ])
    ]
    const trendsSheet = XLSX.utils.aoa_to_sheet(trendsData)
    XLSX.utils.book_append_sheet(workbook, trendsSheet, 'Daily Trends')
  }

  // Optimal hours sheet
  if (data.optimal_hours.length > 0) {
    const hoursData = [
      ['Hour', 'Success Rate (%)', 'Total Notifications'],
      ...data.optimal_hours.map(hour => [
        `${hour.hour}:00`,
        hour.success_rate.toFixed(1),
        hour.total_notifications
      ])
    ]
    const hoursSheet = XLSX.utils.aoa_to_sheet(hoursData)
    XLSX.utils.book_append_sheet(workbook, hoursSheet, 'Optimal Hours')
  }

  // User engagement sheet (if available)
  if (data.user_engagement && data.user_engagement.length > 0) {
    const engagementData = [
      ['User ID', 'Engagement Score (%)', 'Preferred Channel', 'Total Notifications'],
      ...data.user_engagement.map(user => [
        user.user_id.substring(0, 8) + '...',
        user.engagement_score.toFixed(1),
        user.preferred_channel,
        user.total_notifications_received
      ])
    ]
    const engagementSheet = XLSX.utils.aoa_to_sheet(engagementData)
    XLSX.utils.book_append_sheet(workbook, engagementSheet, 'User Engagement')
  }

  // Save the Excel file
  XLSX.writeFile(workbook, filename)
}

/**
 * Export to CSV format (channel breakdown)
 */
async function exportToCSV(data: NotificationAnalyticsExportData, filename: string): Promise<void> {
  let csvContent = 'Channel,Total Notifications,Success Rate (%),Delivery Rate (%)\n'
  
  data.channel_breakdown.forEach(channel => {
    csvContent += `${channel.channel},${channel.total_notifications},${channel.success_rate.toFixed(1)},${channel.delivery_rate.toFixed(1)}\n`
  })

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * Export to JSON format
 */
async function exportToJSON(data: NotificationAnalyticsExportData, filename: string): Promise<void> {
  const jsonContent = JSON.stringify(data, null, 2)
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * Generate analytics report data from API responses
 */
export function generateAnalyticsReportData(
  analytics: any,
  deliveryRates?: any,
  userEngagement?: any
): NotificationAnalyticsExportData {
  return {
    summary: {
      total_notifications: analytics?.summary?.total_notifications || 0,
      successful_deliveries: analytics?.summary?.successful_deliveries || 0,
      failed_deliveries: analytics?.summary?.failed_deliveries || 0,
      overall_success_rate: analytics?.summary?.overall_success_rate || 0,
      time_period_days: analytics?.summary?.time_period_days || 7,
      generated_at: new Date().toISOString()
    },
    channel_breakdown: analytics?.channel_breakdown || [],
    daily_trends: analytics?.daily_trends || [],
    optimal_hours: analytics?.optimal_hours || [],
    user_engagement: userEngagement?.user_engagement || undefined
  }
}