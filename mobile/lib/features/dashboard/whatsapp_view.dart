import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/format.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import 'data.dart';
import 'widgets.dart';

/// WhatsApp side of the dashboard (web: WhatsAppDashboardContent.tsx).
class WhatsAppView extends ConsumerStatefulWidget {
  const WhatsAppView({super.key});

  @override
  ConsumerState<WhatsAppView> createState() => _WhatsAppViewState();
}

class _WhatsAppViewState extends ConsumerState<WhatsAppView> {
  int _days = 30;

  Future<void> _refresh() async {
    ref.invalidate(waHealthProvider);
    ref.invalidate(waTemplateIssuesProvider);
    ref.invalidate(metaExpiryProvider);
    ref.invalidate(waEngagementProvider);
    await ref.refresh(waInsightsProvider(_days).future).then((_) {}, onError: (_) {});
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final insights = ref.watch(waInsightsProvider(_days));
    final health = ref.watch(waHealthProvider);
    final issues = ref.watch(waTemplateIssuesProvider).value;
    final expiry = ref.watch(metaExpiryProvider).value;
    final phone = insights.value?.phoneNumber;

    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(Space.s4, 0, Space.s4, Space.s8),
        children: [
          Text(
            'Live delivery and messaging stats from Meta${phone == null ? '' : ' for ${displayPhone(phone)}'}',
            style: AppText.body.copyWith(color: c.textSecondary),
          ),
          const SizedBox(height: Space.s3),
          Wrap(
            spacing: Space.s2,
            children: [
              for (final d in const [7, 30, 90])
                ChoiceChip(
                  label: Text('Last $d days'),
                  selected: _days == d,
                  onSelected: (_) => setState(() => _days = d),
                ),
            ],
          ),
          const SizedBox(height: Space.s4),
          health.when(
            skipLoadingOnRefresh: true,
            loading: () => Container(
              height: 88,
              decoration: BoxDecoration(color: c.surfaceHover, borderRadius: BorderRadius.circular(Radii.lg)),
            ),
            error: (e, _) => AlertBanner(
              tone: Tone.neutral,
              title: "Couldn't load number quality",
              message: '$e',
              actionLabel: 'Try again',
              onAction: () => ref.invalidate(waHealthProvider),
            ),
            data: (h) => _QualityCard(h),
          ),
          const SizedBox(height: Space.s4),
          AsyncBody<WaInsights>(
            value: insights,
            onRetry: () => ref.invalidate(waInsightsProvider(_days)),
            loading: const SizedBox(height: 520, child: LoadingList(count: 4, itemHeight: 110)),
            data: (d) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                StatGrid(
                  children: [
                    StatCard(label: 'Sent', value: number(d.totalSent), icon: LucideIcons.send),
                    StatCard(
                      label: 'Delivered',
                      value: number(d.totalDelivered),
                      icon: LucideIcons.checkCheck,
                      tone: Tone.success,
                    ),
                    StatCard(
                      label: 'Delivery rate',
                      value: percent(d.deliveryRate),
                      icon: LucideIcons.trendingUp,
                      tone: Tone.info,
                    ),
                  ],
                ),
                const SizedBox(height: Space.s4),
                ActionQueue(
                  whatsappActions(
                    quality: health.value?.qualityRating,
                    rejected: issues?.$1 ?? 0,
                    paused: issues?.$2 ?? 0,
                    expiring: expiry,
                  ),
                ),
                const SizedBox(height: Space.s4),
                _DeliveryChart(d.dayPoints),
                const SizedBox(height: Space.s4),
                _Charges(d),
              ],
            ),
          ),
          const SizedBox(height: Space.s4),
          const _Strategist(),
        ],
      ),
    );
  }
}

class _QualityCard extends StatelessWidget {
  const _QualityCard(this.h);
  final WaHealth h;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final g = qualityGuidance(h.qualityRating);
    final icon = switch (g.tone) {
      Tone.success => LucideIcons.shieldCheck,
      Tone.neutral => LucideIcons.shieldQuestionMark,
      _ => LucideIcons.shieldAlert,
    };
    Widget bullets(String title, List<String> items) => Padding(
      padding: const EdgeInsets.only(top: Space.s2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title.toUpperCase(), style: AppText.overline.copyWith(color: g.tone.fg(c))),
          for (final s in items)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text('•  $s', style: AppText.body.copyWith(color: c.textPrimary)),
            ),
        ],
      ),
    );
    return Container(
      decoration: BoxDecoration(color: g.tone.bg(c), borderRadius: BorderRadius.circular(Radii.lg)),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          leading: Icon(icon, color: g.tone.fg(c)),
          tilePadding: const EdgeInsets.symmetric(horizontal: Space.s4),
          childrenPadding: const EdgeInsets.fromLTRB(Space.s4, 0, Space.s4, Space.s4),
          expandedCrossAxisAlignment: CrossAxisAlignment.start,
          title: Text('Number quality: ${g.label}', style: AppText.label.copyWith(color: g.tone.fg(c))),
          subtitle: Padding(
            padding: const EdgeInsets.only(top: Space.s1),
            child: Wrap(
              spacing: Space.s2,
              runSpacing: Space.s1,
              children: [
                if (h.messagingLimitTier != null)
                  StatusBadge(formatTier(h.messagingLimitTier), icon: LucideIcons.gauge),
                Text('Reasons and how to improve', style: AppText.caption.copyWith(color: c.textSecondary)),
              ],
            ),
          ),
          children: [
            Text(g.summary, style: AppText.body.copyWith(color: c.textPrimary)),
            bullets('Common reasons', g.reasons),
            bullets('How to improve it', g.improve),
          ],
        ),
      ),
    );
  }
}

class _DeliveryChart extends StatelessWidget {
  const _DeliveryChart(this.points);
  final List<DayPoint> points;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final sentColor = c.brand, delColor = c.successIcon;
    String day(int i) => points[i].date.length >= 10 ? points[i].date.substring(5) : points[i].date;
    LineChartBarData line(List<FlSpot> spots, Color color) =>
        LineChartBarData(spots: spots, color: color, barWidth: 2, dotData: const FlDotData(show: false));
    return SectionCard(
      title: 'Sent vs delivered — by day',
      icon: LucideIcons.chartLine,
      child: points.isEmpty
          ? Padding(
              padding: const EdgeInsets.symmetric(vertical: Space.s8),
              child: Center(
                child: Text('No message activity in this range.', style: AppText.body.copyWith(color: c.textSecondary)),
              ),
            )
          : Column(
              children: [
                SizedBox(
                  height: 220,
                  child: LineChart(
                    LineChartData(
                      minY: 0,
                      gridData: FlGridData(
                        drawVerticalLine: false,
                        getDrawingHorizontalLine: (_) => FlLine(color: c.border, strokeWidth: 1),
                      ),
                      borderData: FlBorderData(show: false),
                      lineTouchData: LineTouchData(
                        touchTooltipData: LineTouchTooltipData(
                          getTooltipColor: (_) => c.surfaceRaised,
                          getTooltipItems: (spots) => [
                            for (final s in spots)
                              LineTooltipItem(
                                '${s.barIndex == 0 ? 'Sent' : 'Delivered'} ${day(s.x.toInt())}: ${number(s.y)}',
                                AppText.caption.copyWith(color: c.textPrimary),
                              ),
                          ],
                        ),
                      ),
                      titlesData: FlTitlesData(
                        topTitles: const AxisTitles(),
                        rightTitles: const AxisTitles(),
                        leftTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            reservedSize: 44,
                            getTitlesWidget: (v, meta) => v == meta.max || v != v.roundToDouble()
                                ? const SizedBox.shrink()
                                : Text(
                                    NumberFormat.compact().format(v),
                                    style: AppText.caption.copyWith(color: c.textTertiary),
                                  ),
                          ),
                        ),
                        bottomTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            interval: (points.length / 4).ceilToDouble().clamp(1, 1000),
                            getTitlesWidget: (v, _) => Text(
                              day(v.toInt().clamp(0, points.length - 1)),
                              style: AppText.caption.copyWith(color: c.textTertiary),
                            ),
                          ),
                        ),
                      ),
                      lineBarsData: [
                        line([
                          for (var i = 0; i < points.length; i++) FlSpot(i.toDouble(), points[i].sent.toDouble()),
                        ], sentColor),
                        line([
                          for (var i = 0; i < points.length; i++) FlSpot(i.toDouble(), points[i].delivered.toDouble()),
                        ], delColor),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: Space.s3),
                Wrap(spacing: Space.s4, children: [LegendDot(sentColor, 'Sent'), LegendDot(delColor, 'Delivered')]),
              ],
            ),
    );
  }
}

class _Charges extends StatelessWidget {
  const _Charges(this.d);
  final WaInsights d;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    Widget child;
    if (!d.costAvailable) {
      child = AlertBanner(
        tone: Tone.neutral,
        title: d.costError == null
            ? "Couldn't load billing data from Meta right now"
            : 'Meta returned an error for billing data',
        message:
            '${d.costError == null ? '' : '${d.costError}\n'}For exact figures, check WhatsApp Manager → Phone numbers → Insights in Meta Business Suite.',
      );
    } else if (d.costByCategory.isEmpty) {
      child = Text('No billable messages in this date range.', style: AppText.body.copyWith(color: c.textSecondary));
    } else {
      child = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(money(d.totalCost, d.costCurrency), style: AppText.kpi.copyWith(color: c.textPrimary)),
          Text(
            'As billed by Meta for the last ${d.days} day${d.days == 1 ? '' : 's'} — matches WhatsApp Manager.',
            style: AppText.caption.copyWith(color: c.textTertiary),
          ),
          const SizedBox(height: Space.s2),
          for (final r in d.costByCategory) ...[
            const Divider(),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: Space.s2),
              child: Row(
                children: [
                  Expanded(
                    child: Text(categoryLabel(r.category), style: AppText.body.copyWith(color: c.textPrimary)),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(money(r.cost, d.costCurrency), style: AppText.label.copyWith(color: c.textPrimary)),
                      Text('${number(r.delivered)} messages', style: AppText.caption.copyWith(color: c.textTertiary)),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ],
      );
    }
    return SectionCard(title: 'Approximate total charges', icon: LucideIcons.indianRupee, child: child);
  }
}

class _Strategist extends ConsumerWidget {
  const _Strategist();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(waEngagementProvider);
    final e = async.value;
    final range = e?.earliest != null && e?.latest != null
        ? ' from ${DateFormat('d MMM yyyy').format(e!.earliest!.toLocal())} to ${DateFormat('d MMM yyyy').format(e.latest!.toLocal())}'
        : '';
    return SectionCard(
      title: 'Marketing strategist analysis',
      subtitle: 'Based on ${e == null ? 'your' : number(e.totalMessages)} historical sends$range',
      icon: LucideIcons.trendingUp,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AlertBanner(
            tone: Tone.warning,
            title: 'Directional, not exact',
            message:
                'Delivery/read tracking had a bug (now fixed) that undercounted larger broadcasts more than smaller '
                'ones. Treat these comparisons as a starting hypothesis. Rankings only use days, hours and templates '
                'with at least ${e?.minSampleSize ?? 50} sends.',
          ),
          const SizedBox(height: Space.s3),
          AsyncBody<WaEngagement>(
            value: async,
            onRetry: () => ref.invalidate(waEngagementProvider),
            loading: const SizedBox(height: 260, child: LoadingList(count: 3, itemHeight: 64)),
            data: (e) => _analysis(context, e),
          ),
        ],
      ),
    );
  }

  Widget _analysis(BuildContext context, WaEngagement e) {
    final c = context.colors;
    final tiles = [
      _Tile(
        LucideIcons.calendar,
        Tone.info,
        'Best day to send',
        e.bestDay == null
            ? 'Not enough volume on any single day yet to rank.'
            : '${e.bestDay!.label} — ${percent(e.bestDay!.readRate)} read rate (${number(e.bestDay!.sent)} sent). '
                  'Worst: ${e.worstDay?.label} at ${percent(e.worstDay?.readRate)}.',
      ),
      _Tile(
        LucideIcons.clock,
        Tone.brand,
        'Best time to send',
        e.bestHour == null
            ? 'Not enough volume in any single hour yet to rank.'
            : 'Around ${formatHour(e.bestHour!.hour)} IST — ${percent(e.bestHour!.readRate)} read rate '
                  '(${number(e.bestHour!.sent)} sent).',
      ),
      _Tile(
        LucideIcons.fileText,
        Tone.success,
        'Best performing template',
        e.bestTemplate == null
            ? 'Not enough volume on any single template yet to rank.'
            : '${e.bestTemplate!.label} — ${percent(e.bestTemplate!.readRate)} read rate vs. '
                  '${e.worstTemplate?.label} at ${percent(e.worstTemplate?.readRate)}.',
      ),
      _Tile(
        LucideIcons.penLine,
        Tone.warning,
        'Copywriting observation',
        e.copyLengthObservation ??
            'Need at least two templates with enough volume to compare copy length against read rate.',
      ),
    ];
    Widget rateRow(RateStat s, String sub, Color color) {
      final low = s.sent < e.minSampleSize;
      final fg = low ? c.textTertiary : c.textPrimary;
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: Space.s2),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    s.label,
                    style: AppText.label.copyWith(color: fg),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Text(
                  '${percent(s.readRate)} read${low ? ' (low sample)' : ''}',
                  style: AppText.caption.copyWith(color: fg),
                ),
              ],
            ),
            Text(sub, style: AppText.caption.copyWith(color: c.textTertiary)),
            const SizedBox(height: Space.s1),
            ProgressLine(s.readRate, color: low ? c.borderStrong : color),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        LayoutBuilder(
          builder: (context, box) {
            final cols = box.maxWidth >= 600 ? 2 : 1;
            final w = (box.maxWidth - Space.s3 * (cols - 1)) / cols;
            return Wrap(
              spacing: Space.s3,
              runSpacing: Space.s3,
              children: [for (final t in tiles) SizedBox(width: w, child: t)],
            );
          },
        ),
        const SizedBox(height: Space.s2),
        Theme(
          data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
          child: ExpansionTile(
            tilePadding: EdgeInsets.zero,
            childrenPadding: const EdgeInsets.only(bottom: Space.s2),
            title: Text('Volume & frequency guidance', style: AppText.label.copyWith(color: c.textPrimary)),
            children: [
              Text(
                'Repeated marketing sends to the same number in a short window are the most common cause of blocks '
                "and quality downgrades. Cap marketing broadcasts to any one contact at roughly once every 3–5 days, "
                'use utility/service templates for anything more frequent, and watch the number quality card — a '
                'drop there is the earliest sign of send-frequency fatigue.',
                style: AppText.body.copyWith(color: c.textSecondary),
              ),
            ],
          ),
        ),
        Text('By day of week', style: AppText.h3.copyWith(color: c.textPrimary)),
        if (e.dayStats.isEmpty) Text('No sends yet.', style: AppText.body.copyWith(color: c.textSecondary)),
        for (final d in e.dayStats)
          rateRow(d, '${number(d.sent)} sent · ${number(d.delivered)} delivered · ${number(d.read)} read', c.brand),
        const SizedBox(height: Space.s4),
        Text('By template', style: AppText.h3.copyWith(color: c.textPrimary)),
        if (e.templateStats.isEmpty)
          Text('No template sends yet.', style: AppText.body.copyWith(color: c.textSecondary)),
        for (final t in e.templateStats) rateRow(t, '${number(t.sent)} sent · avg ${t.avgLength} chars', c.successIcon),
      ],
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile(this.icon, this.tone, this.title, this.body);
  final IconData icon;
  final Tone tone;
  final String title, body;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.all(Space.s3),
      decoration: BoxDecoration(
        color: c.surfaceSubtle,
        borderRadius: BorderRadius.circular(Radii.md),
        border: Border.all(color: c.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(color: tone.bg(c), borderRadius: BorderRadius.circular(Radii.sm)),
            child: Icon(icon, size: 16, color: tone.fg(c)),
          ),
          const SizedBox(width: Space.s3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: AppText.label.copyWith(color: c.textPrimary)),
                const SizedBox(height: 2),
                Text(body, style: AppText.body.copyWith(color: c.textSecondary)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
