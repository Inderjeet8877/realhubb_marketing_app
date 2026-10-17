import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../app/providers.dart';
import '../../core/format.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import '../campaigns/data.dart';
import '../campaigns/widgets.dart';
import 'data.dart';
import 'widgets.dart';

/// Meta Ads side of the dashboard (web: MetaDashboardContent.tsx).
/// Campaigns are fetched for all accounts; the account picker filters locally
/// (same as the web) so the per-account cards always show all three.
class MetaView extends ConsumerStatefulWidget {
  const MetaView({super.key});

  @override
  ConsumerState<MetaView> createState() => _MetaViewState();
}

class _MetaViewState extends ConsumerState<MetaView> {
  MetaRange _range = const MetaRange('maximum');
  String _report = 'all';
  int _shown = 10;

  CampaignQuery get _q => (account: 'all', range: _range);

  Future<void> _refresh() async {
    ref.invalidate(metaLeadsProvider);
    ref.invalidate(newEnquiriesProvider);
    await ref.refresh(campaignsProvider(_q).future).then((_) {}, onError: (_) {});
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(campaignsProvider(_q));
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(Space.s4, 0, Space.s4, Space.s8),
        children: [
          Text(
            'Meta Ads performance · ${_range.label}',
            style: AppText.body.copyWith(color: context.colors.textSecondary),
          ),
          const SizedBox(height: Space.s3),
          MetaFilterBar(
            range: _range,
            onRange: (r) => setState(() {
              _range = r;
              _shown = 10;
            }),
          ),
          const SizedBox(height: Space.s4),
          AsyncBody<List<Campaign>>(
            value: async,
            onRetry: () => ref.invalidate(campaignsProvider(_q)),
            loading: const SizedBox(height: 640, child: LoadingList(count: 6, itemHeight: 96)),
            data: (all) => all.isEmpty
                ? EmptyState(
                    icon: LucideIcons.plug,
                    title: 'No Meta campaigns yet',
                    message: 'Connect a Meta ad account in Settings, or pick a wider date range.',
                    actionLabel: 'Open Settings',
                    onAction: () => context.go('/more/settings'),
                  )
                : _content(all),
          ),
        ],
      ),
    );
  }

  Widget _content(List<Campaign> all) {
    final account = ref.watch(accountProvider);
    final leads = ref.watch(metaLeadsProvider);
    final newEnq = ref.watch(newEnquiriesProvider).value ?? 0;
    final filtered = account == 'all' ? all : all.where((c) => c.accountId == account).toList();
    final t = CampaignTotals.of(filtered);
    final (cplLabel, cplTone, cplIcon) = cplStyle(cplLevel(t.cpl));
    final totalLeads = t.leads > 0 ? t.leads : (leads.value?.totalLeads ?? 0);

    final reportCamps = (_report == 'all' ? all : all.where((c) => c.accountId == _report)).toList()
      ..sort((a, b) {
        final s = b.spend.compareTo(a.spend);
        return s != 0 ? s : (a.cpl > 0 ? a.cpl : 1e9).compareTo(b.cpl > 0 ? b.cpl : 1e9);
      });

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        StatGrid(
          children: [
            StatCard(
              label: 'Total campaigns',
              value: number(t.count),
              sub: '${t.active} active',
              icon: LucideIcons.chartColumn,
            ),
            StatCard(label: 'Spend', value: rupees(t.spend), icon: LucideIcons.indianRupee),
            StatCard(label: 'Impressions', value: number(t.impressions), icon: LucideIcons.eye),
            StatCard(
              label: 'Clicks',
              value: number(t.clicks),
              sub: t.impressions > 0 ? '${percent(t.ctr, decimals: 2)} CTR' : null,
              icon: LucideIcons.mousePointerClick,
            ),
            StatCard(label: 'Leads', value: number(totalLeads), icon: LucideIcons.users, tone: Tone.success),
            StatCard(
              label: 'Avg CPL',
              value: t.cpl > 0 ? rupees(t.cpl) : '—',
              sub: t.cpl > 0 ? cplLabel : null,
              subTone: cplTone,
              icon: t.cpl > 0 ? cplIcon : LucideIcons.target,
              tone: t.cpl > 0 ? cplTone : Tone.neutral,
            ),
          ],
        ),
        const SizedBox(height: Space.s4),
        _AccountCards(all),
        const SizedBox(height: Space.s4),
        ActionQueue(metaActions(all, newEnq)),
        const SizedBox(height: Space.s4),
        if (reportCamps.any((c) => c.cpl > 0)) ...[
          _CplChart(reportCamps.where((c) => c.cpl > 0).take(8).toList()),
          const SizedBox(height: Space.s4),
        ],
        _StatusDonut(filtered),
        const SizedBox(height: Space.s5),
        const SectionHeader('Campaign report', subtitle: 'Spend · Leads · CPL per campaign'),
        Wrap(
          spacing: Space.s2,
          children: [
            for (final id in ['all', '1', '2', '3'])
              ChoiceChip(
                label: Text(id == 'all' ? 'All' : 'Acc $id'),
                selected: _report == id,
                onSelected: (_) => setState(() {
                  _report = id;
                  _shown = 10;
                }),
              ),
          ],
        ),
        const SizedBox(height: Space.s3),
        if (reportCamps.isEmpty)
          const EmptyState(icon: LucideIcons.megaphone, title: 'No campaigns for this account')
        else ...[
          for (final c in reportCamps.take(_shown)) ...[CampaignTile(c), const SizedBox(height: Space.s3)],
          if (reportCamps.length > _shown)
            OutlinedButton(
              onPressed: () => setState(() => _shown += 10),
              child: Text('Show more (${math.min(_shown, reportCamps.length)} of ${reportCamps.length})'),
            ),
          const SizedBox(height: Space.s3),
          CampaignTotalsCard(CampaignTotals.of(reportCamps)),
        ],
        const SizedBox(height: Space.s5),
        _ConnectedPages(leads, onRetry: () => ref.invalidate(metaLeadsProvider)),
      ],
    );
  }
}

class _AccountCards extends StatelessWidget {
  const _AccountCards(this.all);
  final List<Campaign> all;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final stats = {
      for (final id in ['1', '2', '3']) id: CampaignTotals.of(all.where((x) => x.accountId == id)),
    };
    final totalSpend = stats.values.fold<double>(0, (s, t) => s + t.spend);
    return LayoutBuilder(
      builder: (context, box) {
        final cols = box.maxWidth >= 600 ? 3 : 1;
        final w = (box.maxWidth - Space.s3 * (cols - 1)) / cols;
        return Wrap(
          spacing: Space.s3,
          runSpacing: Space.s3,
          children: [
            for (final MapEntry(key: id, value: t) in stats.entries)
              SizedBox(
                width: w,
                child: AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('ACCOUNT $id', style: AppText.overline.copyWith(color: c.brandText)),
                                Text(
                                  '${t.count} campaigns · ${t.active} active',
                                  style: AppText.caption.copyWith(color: c.textSecondary),
                                ),
                              ],
                            ),
                          ),
                          t.active > 0
                              ? const StatusBadge('Live', tone: Tone.success, icon: LucideIcons.circleCheck)
                              : const StatusBadge('Inactive', icon: LucideIcons.circlePause),
                        ],
                      ),
                      const SizedBox(height: Space.s3),
                      Row(
                        children: [
                          Expanded(child: Metric.text('Spend', rupees(t.spend))),
                          Expanded(child: Metric.text('Leads', number(t.leads))),
                          Expanded(child: Metric.text('CPL', t.cpl > 0 ? rupees(t.cpl) : '—')),
                        ],
                      ),
                      const SizedBox(height: Space.s3),
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              'Share of total spend',
                              style: AppText.caption.copyWith(color: c.textSecondary),
                            ),
                          ),
                          Text(
                            percent(totalSpend > 0 ? t.spend / totalSpend * 100 : 0, decimals: 0),
                            style: AppText.caption.copyWith(color: c.textPrimary),
                          ),
                        ],
                      ),
                      const SizedBox(height: Space.s1),
                      ProgressLine(totalSpend > 0 ? t.spend / totalSpend * 100 : 0),
                    ],
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

/// Bars are numbered; the list under the chart names each one with its CPL
/// band, so the chart never relies on colour or truncated axis labels.
class _CplChart extends StatelessWidget {
  const _CplChart(this.camps);
  final List<Campaign> camps;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final maxY = camps.map((x) => x.cpl).reduce(math.max) * 1.15;
    Color barColor(Campaign x) => switch (cplLevel(x.cpl)) {
      CplLevel.good => c.successIcon,
      CplLevel.moderate => c.warningSolid,
      _ => c.dangerFg,
    };
    return SectionCard(
      title: 'CPL by campaign',
      subtitle: 'Top ${camps.length} by spend · lower is better',
      icon: LucideIcons.chartColumn,
      child: Column(
        children: [
          SizedBox(
            height: 200,
            child: BarChart(
              BarChartData(
                maxY: maxY,
                gridData: FlGridData(
                  drawVerticalLine: false,
                  getDrawingHorizontalLine: (_) => FlLine(color: c.border, strokeWidth: 1),
                ),
                borderData: FlBorderData(show: false),
                barTouchData: BarTouchData(
                  touchTooltipData: BarTouchTooltipData(
                    getTooltipColor: (_) => c.surfaceRaised,
                    getTooltipItem: (g, _, rod, _) => BarTooltipItem(
                      '${camps[g.x].name}\n${rupees(rod.toY)}',
                      AppText.caption.copyWith(color: c.textPrimary),
                    ),
                  ),
                ),
                titlesData: FlTitlesData(
                  topTitles: const AxisTitles(),
                  rightTitles: const AxisTitles(),
                  leftTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 48,
                      getTitlesWidget: (v, meta) => v == meta.max
                          ? const SizedBox.shrink()
                          : Text(rupees(v), style: AppText.caption.copyWith(color: c.textTertiary)),
                    ),
                  ),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      getTitlesWidget: (v, _) =>
                          Text('${v.toInt() + 1}', style: AppText.caption.copyWith(color: c.textSecondary)),
                    ),
                  ),
                ),
                barGroups: [
                  for (var i = 0; i < camps.length; i++)
                    BarChartGroupData(
                      x: i,
                      barRods: [
                        BarChartRodData(
                          toY: camps[i].cpl,
                          width: 18,
                          color: barColor(camps[i]),
                          borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
                        ),
                      ],
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: Space.s3),
          for (var i = 0; i < camps.length; i++)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(
                children: [
                  SizedBox(
                    width: 24,
                    child: Text('${i + 1}', style: AppText.caption.copyWith(color: c.textTertiary)),
                  ),
                  Expanded(
                    child: Text(
                      camps[i].name,
                      style: AppText.body.copyWith(color: c.textPrimary),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: Space.s2),
                  CplBadge(camps[i].cpl),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _StatusDonut extends StatelessWidget {
  const _StatusDonut(this.camps);
  final List<Campaign> camps;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final counts = <String, int>{};
    for (final x in camps) {
      counts[x.status] = (counts[x.status] ?? 0) + 1;
    }
    final entries = counts.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    final palette = chartPalette(c);
    return SectionCard(
      title: 'Campaign status',
      icon: LucideIcons.chartPie,
      child: entries.isEmpty
          ? Text('No campaigns for this account', style: AppText.body.copyWith(color: c.textSecondary))
          : Row(
              children: [
                SizedBox(
                  width: 140,
                  height: 140,
                  child: PieChart(
                    PieChartData(
                      centerSpaceRadius: 40,
                      sectionsSpace: 2,
                      sections: [
                        for (var i = 0; i < entries.length; i++)
                          PieChartSectionData(
                            value: entries[i].value.toDouble(),
                            color: palette[i % palette.length],
                            radius: 26,
                            showTitle: false,
                          ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: Space.s4),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (var i = 0; i < entries.length; i++)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 3),
                          child: Row(
                            children: [
                              Expanded(child: LegendDot(palette[i % palette.length], _title(entries[i].key))),
                              Text('${entries[i].value}', style: AppText.label.copyWith(color: c.textPrimary)),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }

  static String _title(String s) => s.isEmpty ? 'Unknown' : s[0] + s.substring(1).toLowerCase().replaceAll('_', ' ');
}

class _ConnectedPages extends StatelessWidget {
  const _ConnectedPages(this.leads, {required this.onRetry});
  final AsyncValue<LeadsSummary> leads;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SectionCard(
      title: 'Connected Pages',
      subtitle: 'Facebook Pages granted access · lead forms per page',
      icon: LucideIcons.fileBadge,
      child: leads.when(
        skipLoadingOnRefresh: true,
        loading: () => const SizedBox(height: 120, child: LoadingList(count: 2, itemHeight: 40)),
        error: (e, _) => AlertBanner(
          tone: Tone.danger,
          title: "Couldn't load pages",
          message: '$e',
          actionLabel: 'Try again',
          onAction: onRetry,
        ),
        data: (s) => s.pages.isEmpty
            ? Text('No connected Pages found', style: AppText.body.copyWith(color: c.textSecondary))
            : Column(
                children: [
                  for (final p in s.pages)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(LucideIcons.fileBadge, color: c.textTertiary),
                      title: Text(p.name, style: AppText.label.copyWith(color: c.textPrimary)),
                      subtitle: Text('${p.forms} lead form${p.forms == 1 ? '' : 's'}'),
                      trailing: Text('${number(p.leads)} leads', style: AppText.label.copyWith(color: c.textPrimary)),
                    ),
                ],
              ),
      ),
    );
  }
}
