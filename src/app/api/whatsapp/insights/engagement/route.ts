import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MIN_SAMPLE_SIZE = 50; // below this, a day/template's rate is too noisy to rank

interface DayStat { day: string; sent: number; delivered: number; read: number; readRate: number }
interface TemplateStat { template: string; sent: number; read: number; readRate: number; avgLength: number }

// Analyzes real historical send/delivery data from Firestore (not Meta's API — Meta doesn't
// expose day/hour/template breakdowns) to answer marketing-strategist questions: which days
// engage best, what time to send, how templates compare, and whether copy length correlates
// with read rate. This is one-shot on page load, not polled — reading the whole
// whatsapp_conversations history on every refresh would burn through the Firestore Spark
// plan's daily quota the same way an earlier bug in this app already did once.
export async function GET() {
  try {
    const snap = await adminDb
      .collection('whatsapp_conversations')
      .where('direction', '==', 'outbound')
      .get();

    const byDay: Record<string, { sent: number; delivered: number; read: number }> = {};
    const byHour: Record<number, { sent: number; read: number }> = {};
    const byTemplate: Record<string, { sent: number; delivered: number; read: number; totalLength: number }> = {};

    let earliestMs = Infinity;
    let latestMs = -Infinity;

    snap.forEach((doc) => {
      const d = doc.data();
      if (!d.createdAt?.toDate) return;
      const utcMs = d.createdAt.toDate().getTime();
      earliestMs = Math.min(earliestMs, utcMs);
      latestMs = Math.max(latestMs, utcMs);

      // Shift to IST (UTC+5:30) so day/hour buckets reflect the recipient's local time.
      const istDate = new Date(utcMs + 5.5 * 3600 * 1000);
      const dayName = DAY_NAMES[istDate.getUTCDay()];
      const hour = istDate.getUTCHours();
      const status: string = d.status || 'sent';
      const isDelivered = status === 'delivered' || status === 'read';
      const isRead = status === 'read';
      const template = d.templateName || '(custom text)';

      byDay[dayName] = byDay[dayName] || { sent: 0, delivered: 0, read: 0 };
      byDay[dayName].sent++;
      if (isDelivered) byDay[dayName].delivered++;
      if (isRead) byDay[dayName].read++;

      byHour[hour] = byHour[hour] || { sent: 0, read: 0 };
      byHour[hour].sent++;
      if (isRead) byHour[hour].read++;

      byTemplate[template] = byTemplate[template] || { sent: 0, delivered: 0, read: 0, totalLength: 0 };
      byTemplate[template].sent++;
      if (isDelivered) byTemplate[template].delivered++;
      if (isRead) byTemplate[template].read++;
      byTemplate[template].totalLength += (d.message || '').length;
    });

    const dayStats: DayStat[] = DAY_NAMES
      .filter((d) => byDay[d])
      .map((d) => ({
        day: d,
        sent: byDay[d].sent,
        delivered: byDay[d].delivered,
        read: byDay[d].read,
        readRate: byDay[d].sent > 0 ? (byDay[d].read / byDay[d].sent) * 100 : 0,
      }));

    const hourStats = Object.entries(byHour)
      .map(([hour, h]) => ({ hour: Number(hour), sent: h.sent, read: h.read, readRate: h.sent > 0 ? (h.read / h.sent) * 100 : 0 }))
      .sort((a, b) => a.hour - b.hour);

    const templateStats: TemplateStat[] = Object.entries(byTemplate).map(([template, t]) => ({
      template,
      sent: t.sent,
      read: t.read,
      readRate: t.sent > 0 ? (t.read / t.sent) * 100 : 0,
      avgLength: t.sent > 0 ? Math.round(t.totalLength / t.sent) : 0,
    }));

    // Rank only buckets with enough volume to mean something.
    const rankableDays = dayStats.filter((d) => d.sent >= MIN_SAMPLE_SIZE).sort((a, b) => b.readRate - a.readRate);
    const rankableHours = hourStats.filter((h) => h.sent >= MIN_SAMPLE_SIZE).sort((a, b) => b.readRate - a.readRate);
    const rankableTemplates = templateStats.filter((t) => t.sent >= MIN_SAMPLE_SIZE).sort((a, b) => b.readRate - a.readRate);

    // Simple correlation check: does shorter copy associate with higher read rate, among
    // templates with enough volume to compare?
    let copyLengthObservation: string | null = null;
    if (rankableTemplates.length >= 2) {
      const sortedByLength = [...rankableTemplates].sort((a, b) => a.avgLength - b.avgLength);
      const shortest = sortedByLength[0];
      const longest = sortedByLength[sortedByLength.length - 1];
      if (shortest.template !== longest.template) {
        copyLengthObservation = shortest.readRate > longest.readRate
          ? `Shorter copy performed better in this data: "${shortest.template}" (${shortest.avgLength} chars) had a ${shortest.readRate.toFixed(1)}% read rate vs. "${longest.template}" (${longest.avgLength} chars) at ${longest.readRate.toFixed(1)}%.`
          : `Longer copy did not hurt engagement here: "${longest.template}" (${longest.avgLength} chars) actually had a ${longest.readRate.toFixed(1)}% read rate vs. "${shortest.template}"'s (${shortest.avgLength} chars) ${shortest.readRate.toFixed(1)}%.`;
      }
    }

    return NextResponse.json({
      success: true,
      totalMessages: snap.size,
      earliestDate: earliestMs !== Infinity ? new Date(earliestMs).toISOString() : null,
      latestDate: latestMs !== -Infinity ? new Date(latestMs).toISOString() : null,
      dayStats,
      hourStats,
      templateStats,
      bestDay: rankableDays[0] || null,
      worstDay: rankableDays[rankableDays.length - 1] || null,
      bestHour: rankableHours[0] || null,
      bestTemplate: rankableTemplates[0] || null,
      worstTemplate: rankableTemplates[rankableTemplates.length - 1] || null,
      copyLengthObservation,
      minSampleSize: MIN_SAMPLE_SIZE,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to analyze engagement data' }, { status: 500 });
  }
}
