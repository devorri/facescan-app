import type { ReportResult } from './reportService';

/**
 * Generates an institutional, print-ready HTML report styled for A4/Letter paper
 * in landscape mode with high-contrast print typography and color badges.
 */
export function generatePrintableReportHtml(data: ReportResult): string {
  const { items, summary, generatedAt, filterLabels } = data;

  const tableRows = items.length === 0
    ? `<tr><td colspan="8" style="text-align: center; padding: 32px; color: #64748B; font-style: italic;">No access records found matching the selected filter criteria.</td></tr>`
    : items
        .map((item, index) => {
          const rowBg = index % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
          return `
            <tr style="background-color: ${rowBg}; page-break-inside: avoid;">
              <td style="text-align: center; font-weight: 700; color: #64748B; padding: 9px 8px; border-bottom: 1px solid #E2E8F0;">
                ${index + 1}
              </td>
              <td style="padding: 9px 10px; border-bottom: 1px solid #E2E8F0;">
                <div style="font-weight: 700; color: #0F172A; font-size: 13px;">${escapeHtml(item.facultyName)}</div>
                <div style="font-size: 10px; color: #64748B; margin-top: 1px;">${escapeHtml(item.facultyRole)}</div>
              </td>
              <td style="padding: 9px 10px; border-bottom: 1px solid #E2E8F0;">
                <div style="font-weight: 600; color: #1E293B; font-size: 12px;">${escapeHtml(item.laboratoryName)}</div>
                ${item.laboratoryLocation ? `<div style="font-size: 10px; color: #64748B;">${escapeHtml(item.laboratoryLocation)}</div>` : ''}
              </td>
              <td style="padding: 9px 8px; text-align: center; font-size: 12px; color: #334155; border-bottom: 1px solid #E2E8F0; white-space: nowrap;">
                ${escapeHtml(item.entryDateFormatted)}
              </td>
              <td style="padding: 9px 8px; text-align: center; font-size: 12px; font-weight: 700; color: #0284C7; border-bottom: 1px solid #E2E8F0; white-space: nowrap;">
                ${escapeHtml(item.entryTimeFormatted)}
              </td>
              <td style="padding: 9px 8px; text-align: center; font-size: 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #E2E8F0; white-space: nowrap;">
                ${escapeHtml(item.exitTimeFormatted)}
              </td>
              <td style="padding: 9px 8px; text-align: center; border-bottom: 1px solid #E2E8F0;">
                <span style="
                  display: inline-block;
                  padding: 3px 8px;
                  border-radius: 4px;
                  font-size: 10px;
                  font-weight: 800;
                  letter-spacing: 0.5px;
                  background-color: ${item.statusBadgeBg};
                  color: ${item.statusBadgeColor};
                  border: 1px solid ${item.statusBadgeColor}40;
                ">
                  ${item.displayStatus.toUpperCase()}
                </span>
              </td>
              <td style="padding: 9px 10px; font-size: 11px; color: #475569; border-bottom: 1px solid #E2E8F0;">
                ${escapeHtml(item.remarks || '—')}
              </td>
            </tr>
          `;
        })
        .join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Faculty Laboratory Access Report</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 12mm 10mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 16px 20px;
      color: #0F172A;
      background-color: #FFFFFF;
      font-size: 12px;
      line-height: 1.4;
    }
    .header {
      border-bottom: 2px solid #0284C7;
      padding-bottom: 12px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .title-area h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 800;
      color: #00152B;
      letter-spacing: -0.3px;
    }
    .title-area h2 {
      margin: 2px 0 0 0;
      font-size: 12px;
      font-weight: 600;
      color: #0284C7;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .meta-area {
      text-align: right;
      font-size: 11px;
      color: #475569;
    }
    .meta-area strong {
      color: #0F172A;
    }
    .filters-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      background: #F1F5F9;
      border: 1px solid #E2E8F0;
      border-radius: 6px;
      padding: 8px 12px;
      margin-bottom: 14px;
      font-size: 11px;
    }
    .filter-item {
      display: flex;
      gap: 4px;
    }
    .filter-label {
      color: #64748B;
      font-weight: 600;
    }
    .filter-val {
      color: #0F172A;
      font-weight: 700;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 10px;
      margin-bottom: 16px;
    }
    .summary-card {
      border: 1px solid #E2E8F0;
      border-radius: 6px;
      padding: 10px;
      text-align: center;
      background: #FFFFFF;
    }
    .summary-card.granted { border-top: 3px solid #10B981; background: #F0FDF4; }
    .summary-card.denied { border-top: 3px solid #EF4444; background: #FEF2F2; }
    .summary-card.late { border-top: 3px solid #F59E0B; background: #FFFBEB; }
    .summary-card.exited { border-top: 3px solid #3B82F6; background: #EFF6FF; }
    .summary-card.total { border-top: 3px solid #00152B; background: #F8FAFC; }
    .summary-num {
      font-size: 20px;
      font-weight: 800;
      margin-bottom: 2px;
    }
    .summary-card.granted .summary-num { color: #10B981; }
    .summary-card.denied .summary-num { color: #EF4444; }
    .summary-card.late .summary-num { color: #D97706; }
    .summary-card.exited .summary-num { color: #2563EB; }
    .summary-card.total .summary-num { color: #00152B; }
    .summary-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748B;
      letter-spacing: 0.3px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th {
      background-color: #00152B;
      color: #FFFFFF;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      padding: 8px 10px;
      text-align: left;
      border: 1px solid #00152B;
    }
    th.center {
      text-align: center;
    }
    .signoff-section {
      margin-top: 30px;
      display: flex;
      justify-content: space-between;
      page-break-inside: avoid;
      padding-top: 16px;
    }
    .signoff-box {
      width: 28%;
      text-align: center;
    }
    .signoff-line {
      border-bottom: 1px solid #0F172A;
      margin-bottom: 6px;
      height: 40px;
    }
    .signoff-title {
      font-weight: 700;
      font-size: 11px;
      color: #0F172A;
    }
    .signoff-sub {
      font-size: 10px;
      color: #64748B;
    }
    .footer-note {
      margin-top: 24px;
      border-top: 1px solid #E2E8F0;
      padding-top: 8px;
      font-size: 10px;
      color: #94A3B8;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <div class="title-area">
      <h1>CCS SMARTLAB • ACCESS & PUNCTUALITY REPORT</h1>
      <h2>Province of Pampanga — Laboratory Management System</h2>
    </div>
    <div class="meta-area">
      <div><strong>Date Generated:</strong> ${escapeHtml(generatedAt)}</div>
      <div><strong>Covered Period:</strong> ${escapeHtml(filterLabels.dateRangeText)}</div>
    </div>
  </div>

  <!-- Filters Applied -->
  <div class="filters-bar">
    <div class="filter-item">
      <span class="filter-label">Laboratory:</span>
      <span class="filter-val">${escapeHtml(filterLabels.laboratoryName)}</span>
    </div>
    <div class="filter-item" style="border-left: 1px solid #CBD5E1; padding-left: 12px;">
      <span class="filter-label">Faculty Filter:</span>
      <span class="filter-val">${escapeHtml(filterLabels.facultyName)}</span>
    </div>
    <div class="filter-item" style="border-left: 1px solid #CBD5E1; padding-left: 12px;">
      <span class="filter-label">Status:</span>
      <span class="filter-val">${escapeHtml(filterLabels.statusText)}</span>
    </div>
    <div class="filter-item" style="border-left: 1px solid #CBD5E1; padding-left: 12px;">
      <span class="filter-label">Late Grace Period:</span>
      <span class="filter-val" style="color: #D97706;">15 Minutes</span>
    </div>
  </div>

  <!-- Summary Statistics Grid -->
  <div class="summary-grid">
    <div class="summary-card total">
      <div class="summary-num">${summary.totalLogs}</div>
      <div class="summary-label">Total Logs</div>
    </div>
    <div class="summary-card granted">
      <div class="summary-num">${summary.totalGranted}</div>
      <div class="summary-label">Granted Access</div>
    </div>
    <div class="summary-card denied">
      <div class="summary-num">${summary.totalDenied}</div>
      <div class="summary-label">Denied Attempts</div>
    </div>
    <div class="summary-card late">
      <div class="summary-num">${summary.totalLate}</div>
      <div class="summary-label">Late Arrivals (>15m)</div>
    </div>
    <div class="summary-card exited">
      <div class="summary-num">${summary.totalExited}</div>
      <div class="summary-label">Exited / Checked Out</div>
    </div>
  </div>

  <!-- Main Log Entries Table -->
  <table>
    <thead>
      <tr>
        <th style="width: 35px;" class="center">#</th>
        <th style="width: 22%;">Faculty Member</th>
        <th style="width: 18%;">Laboratory</th>
        <th style="width: 11%;" class="center">Date</th>
        <th style="width: 9%;" class="center">Time In</th>
        <th style="width: 9%;" class="center">Time Out</th>
        <th style="width: 11%;" class="center">Status</th>
        <th style="width: 20%;">Remarks / Attendance Note</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>

  <!-- Official Sign-off Area -->
  <div class="signoff-section">
    <div class="signoff-box">
      <div class="signoff-line"></div>
      <div class="signoff-title">Prepared By</div>
      <div class="signoff-sub">Laboratory In-Charge / Assistant</div>
    </div>
    <div class="signoff-box">
      <div class="signoff-line"></div>
      <div class="signoff-title">Verified By</div>
      <div class="signoff-sub">CCS Department Head</div>
    </div>
    <div class="signoff-box">
      <div class="signoff-line"></div>
      <div class="signoff-title">Approved By</div>
      <div class="signoff-sub">Dean / Campus Director</div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer-note">
    <span>CCS Smartlab Facial Recognition Access Control System</span>
    <span>Automated Report • Total Faculty: ${summary.uniqueFacultyCount}</span>
  </div>
</body>
</html>
  `.trim();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
