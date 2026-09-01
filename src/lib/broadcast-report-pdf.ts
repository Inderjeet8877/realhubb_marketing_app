// Builds the "Broadcast Report" PDF for the WhatsApp Reports tab — grouped by
// template (single/multiple/all), with an overall summary plus a per-template
// summary + full broadcast-level breakdown.
//
// Layout is deliberately table-driven (jspdf-autotable) rather than manually
// positioned text/rects wherever a table would do: autoTable owns pagination
// for its own rows (wraps long text instead of clipping/overlapping it, and
// breaks to a new page on its own when a table runs long), which is exactly
// the class of bug ("text overlapping", "layout issues") that manual y-cursor
// math is prone to. The only manual positioning here is section titles and
// header bars between tables, each guarded by ensureSpace() so a header is
// never stranded alone at the bottom of a page with its table pushed to the
// next one. No row data is ever truncated ("...and N more") — every matching
// broadcast is included; autoTable simply continues across as many pages as
// needed.
import jsPDF from 'jspdf';
// jspdf-autotable v3+ dropped the old "import 'jspdf-autotable' for its side
// effect, then call doc.autoTable(...)" style as the reliable path — that
// self-attach only fires when a `window.jsPDF` GLOBAL already exists (see the
// package's own source), which a bundled ES-module import never sets. The
// documented, version-proof API is this function-call form instead; it also
// sets `doc.lastAutoTable` as a plain property regardless of any global.
import autoTable from 'jspdf-autotable';
import { formatDuration } from './format';

export interface BroadcastReportRow {
  id: string;
  batchName: string;
  templateName: string | null;
  status: string; // 'processing' | 'completed' | 'cancelled' | 'failed'
  cancelReason: string | null;
  total: number;
  sent: number;
  failed: number;
  delivered: number;
  read: number;
  createdAt: string | null;
  finishedAt: string | null;
}

const MARGIN = 14;
const FOOTER_RESERVE = 18;
const PAGE_TOP = 15;
const GREEN: [number, number, number] = [22, 101, 52];
const DARK_GRAY: [number, number, number] = [55, 65, 81];
const GRAY_TEXT: [number, number, number] = [100, 100, 100];
const NO_TEMPLATE_LABEL = 'Custom / No Template';

function pageWidthOf(doc: jsPDF) { return doc.internal.pageSize.getWidth(); }
function pageHeightOf(doc: jsPDF) { return doc.internal.pageSize.getHeight(); }

// Advances past a page break if the next block wouldn't fit above the
// reserved footer strip — keeps a section header from ever being drawn alone
// at the bottom of a page with its table stranded on the next one.
function ensureSpace(doc: jsPDF, cursorY: number, needed: number): number {
  if (cursorY + needed > pageHeightOf(doc) - FOOTER_RESERVE) {
    doc.addPage();
    return PAGE_TOP;
  }
  return cursorY;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtPercent(n: number | null): string {
  return n == null ? '—' : `${n.toFixed(1)}%`;
}

function fmtDurationOrDash(ms: number | null): string {
  return ms == null ? '—' : formatDuration(ms);
}

function statusLabel(status: string): string {
  switch (status) {
    case 'completed':  return 'Completed';
    case 'processing': return 'In Progress';
    case 'cancelled':  return 'Cancelled';
    case 'failed':     return 'Failed';
    default:           return status || '—';
  }
}

interface Aggregate {
  totalBroadcasts: number;
  totalTargeted: number;
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  totalFailed: number;
  completed: number;
  cancelled: number;
  failedJobs: number;
  processing: number;
  avgDurationMs: number | null;
  successRate: number | null;
}

function sum(rows: BroadcastReportRow[], pick: (r: BroadcastReportRow) => number): number {
  return rows.reduce((acc, r) => acc + (pick(r) || 0), 0);
}

function aggregate(rows: BroadcastReportRow[]): Aggregate {
  const completedRows = rows.filter(r => r.status === 'completed');
  const durations = completedRows
    .filter(r => r.createdAt && r.finishedAt)
    .map(r => new Date(r.finishedAt as string).getTime() - new Date(r.createdAt as string).getTime())
    .filter(ms => Number.isFinite(ms) && ms >= 0);
  const totalTargeted = sum(rows, r => r.total);
  const totalSent = sum(rows, r => r.sent);

  return {
    totalBroadcasts: rows.length,
    totalTargeted,
    totalSent,
    totalDelivered: sum(rows, r => r.delivered),
    totalRead: sum(rows, r => r.read),
    totalFailed: sum(rows, r => r.failed),
    completed: completedRows.length,
    cancelled: rows.filter(r => r.status === 'cancelled').length,
    failedJobs: rows.filter(r => r.status === 'failed').length,
    processing: rows.filter(r => r.status === 'processing').length,
    avgDurationMs: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
    successRate: totalTargeted > 0 ? (totalSent / totalTargeted) * 100 : null,
  };
}

interface TemplateGroup {
  templateName: string;
  rows: BroadcastReportRow[];
}

function groupByTemplate(rows: BroadcastReportRow[]): TemplateGroup[] {
  const map = new Map<string, BroadcastReportRow[]>();
  for (const r of rows) {
    const key = r.templateName || NO_TEMPLATE_LABEL;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  const groups = Array.from(map.entries()).map(([templateName, groupRows]) => ({ templateName, rows: groupRows }));
  // Highest-volume template first; custom/no-template broadcasts pinned last
  // since they're not really "a template" being evaluated.
  groups.sort((a, b) => {
    if (a.templateName === NO_TEMPLATE_LABEL) return 1;
    if (b.templateName === NO_TEMPLATE_LABEL) return -1;
    return sum(b.rows, r => r.sent) - sum(a.rows, r => r.sent);
  });
  return groups;
}

function drawStatTable(doc: jsPDF, startY: number, stats: [string, string][]): number {
  autoTable(doc, {
    startY,
    head: [['Metric', 'Value']],
    body: stats,
    theme: 'grid',
    margin: { left: MARGIN, right: MARGIN, bottom: FOOTER_RESERVE },
    headStyles: { fillColor: GREEN, textColor: 255, fontSize: 9, halign: 'left' },
    styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
    columnStyles: { 0: { cellWidth: 95, fontStyle: 'bold' }, 1: { cellWidth: 'auto', halign: 'right' } },
  });
  return (doc as any).lastAutoTable.finalY;
}

function drawDetailTable(doc: jsPDF, startY: number, rows: BroadcastReportRow[]): number {
  const sorted = rows.slice().sort((a, b) => {
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bt - at;
  });

  const body = sorted.map(r => {
    const durationMs = r.status === 'completed' && r.createdAt && r.finishedAt
      ? new Date(r.finishedAt).getTime() - new Date(r.createdAt).getTime()
      : null;
    const note = r.status === 'cancelled' && r.cancelReason ? r.cancelReason
      : r.status === 'failed' ? 'Broadcast failed'
      : '';
    return [
      r.batchName || 'Unknown Batch',
      fmtDate(r.createdAt),
      statusLabel(r.status),
      String(r.total ?? 0),
      String(r.sent ?? 0),
      String(r.delivered ?? 0),
      String(r.read ?? 0),
      String(r.failed ?? 0),
      fmtDurationOrDash(durationMs),
      note,
    ];
  });

  autoTable(doc, {
    startY,
    head: [['Batch Name', 'Date', 'Status', 'Total', 'Sent', 'Delivered', 'Read', 'Failed', 'Duration', 'Note']],
    body,
    theme: 'striped',
    margin: { left: MARGIN, right: MARGIN, bottom: FOOTER_RESERVE },
    headStyles: { fillColor: DARK_GRAY, textColor: 255, fontSize: 7.5, halign: 'center' },
    styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak', valign: 'middle' },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 24 },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 12, halign: 'center' },
      4: { cellWidth: 12, halign: 'center' },
      5: { cellWidth: 14, halign: 'center' },
      6: { cellWidth: 12, halign: 'center' },
      7: { cellWidth: 12, halign: 'center' },
      8: { cellWidth: 16, halign: 'center' },
      9: { cellWidth: 'auto' },
    },
  });
  return (doc as any).lastAutoTable.finalY;
}

export function buildBroadcastReportPdf(rows: BroadcastReportRow[], opts: { scopeLabel: string }): jsPDF {
  const doc = new jsPDF();
  const pageWidth = pageWidthOf(doc);
  let y = PAGE_TOP;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...GREEN);
  doc.text('WhatsApp Broadcast Report', pageWidth / 2, y, { align: 'center' });
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...GRAY_TEXT);
  doc.text(opts.scopeLabel, pageWidth / 2, y, { align: 'center' });
  y += 6;
  doc.setFontSize(8.5);
  doc.text(`Generated ${new Date().toLocaleString('en-IN')}`, pageWidth / 2, y, { align: 'center' });
  y += 10;

  if (rows.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...GRAY_TEXT);
    doc.text('No broadcasts match the selected scope.', pageWidth / 2, y + 10, { align: 'center' });
    stampFooters(doc);
    return doc;
  }

  const overall = aggregate(rows);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(30, 30, 30);
  doc.text('Overall Summary', MARGIN, y);
  y += 4;
  y = drawStatTable(doc, y, [
    ['Total Broadcasts', String(overall.totalBroadcasts)],
    ['Total Contacts Targeted', String(overall.totalTargeted)],
    ['Total Sent', String(overall.totalSent)],
    ['Total Delivered', String(overall.totalDelivered)],
    ['Total Read', String(overall.totalRead)],
    ['Total Failed', String(overall.totalFailed)],
    ['Overall Success Rate (Sent / Targeted)', fmtPercent(overall.successRate)],
    ['Completed / Cancelled / Failed / In Progress', `${overall.completed} / ${overall.cancelled} / ${overall.failedJobs} / ${overall.processing}`],
    ['Average Duration (completed broadcasts)', fmtDurationOrDash(overall.avgDurationMs)],
  ]);
  y += 10;

  for (const group of groupByTemplate(rows)) {
    // Bar (9) + gap + summary table header/first row — enough that a header
    // never gets drawn with nothing but the very bottom margin under it.
    y = ensureSpace(doc, y, 30);

    doc.setFillColor(...GREEN);
    doc.rect(MARGIN, y, pageWidth - MARGIN * 2, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Template: ${group.templateName}  (${group.rows.length} broadcast${group.rows.length === 1 ? '' : 's'})`, MARGIN + 3, y + 6.3);
    y += 13;

    const groupStats = aggregate(group.rows);
    y = drawStatTable(doc, y, [
      ['Broadcasts', String(groupStats.totalBroadcasts)],
      ['Total Targeted', String(groupStats.totalTargeted)],
      ['Sent', String(groupStats.totalSent)],
      ['Delivered', String(groupStats.totalDelivered)],
      ['Read', String(groupStats.totalRead)],
      ['Failed', String(groupStats.totalFailed)],
      ['Success Rate', fmtPercent(groupStats.successRate)],
      ['Average Duration', fmtDurationOrDash(groupStats.avgDurationMs)],
    ]);
    y += 6;

    y = ensureSpace(doc, y, 20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 30, 30);
    doc.text('Broadcast Details', MARGIN, y);
    y += 4;

    y = drawDetailTable(doc, y, group.rows);
    y += 12;
  }

  stampFooters(doc);
  return doc;
}

// Drawn in one final pass over every page that ended up existing, rather than
// inside each autoTable's own per-page hook — avoids re-deriving page count
// mid-document and guarantees exactly one footer per page regardless of how
// many separate autoTable calls contributed content to it. Table `margin.
// bottom` (FOOTER_RESERVE) already keeps row content clear of this strip, so
// the footer can never land on top of real data.
function stampFooters(doc: jsPDF): void {
  const pageWidth = pageWidthOf(doc);
  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const h = pageHeightOf(doc);
    doc.setDrawColor(220, 220, 220);
    doc.line(MARGIN, h - 14, pageWidth - MARGIN, h - 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text('RealHubb WhatsApp Broadcast Report', MARGIN, h - 9);
    doc.text(`Page ${p} of ${pageCount}`, pageWidth - MARGIN, h - 9, { align: 'right' });
  }
}
