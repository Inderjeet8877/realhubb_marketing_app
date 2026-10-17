import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../app/providers.dart';
import '../../core/format.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import 'data.dart';
import 'widgets.dart';

/// Meta campaigns for the picked account and date range (web: /dashboard/campaigns,
/// which hard-coded 30 days — the API accepts date_preset/since/until, so we pass it).
class CampaignsScreen extends ConsumerStatefulWidget {
  const CampaignsScreen({super.key});

  @override
  ConsumerState<CampaignsScreen> createState() => _CampaignsScreenState();
}

class _CampaignsScreenState extends ConsumerState<CampaignsScreen> {
  MetaRange _range = const MetaRange('last_30d');
  CampaignSort _sort = CampaignSort.spend;

  @override
  Widget build(BuildContext context) {
    final account = ref.watch(accountProvider);
    final q = (account: account, range: _range);
    final async = ref.watch(campaignsProvider(q));
    final c = context.colors;
    final list = async.value;
    final t = list == null ? null : CampaignTotals.of(list);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Campaigns'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            icon: const Icon(LucideIcons.refreshCw),
            onPressed: () => ref.invalidate(campaignsProvider(q)),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(campaignsProvider(q).future).then((_) {}, onError: (_) {}),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(Space.s4),
          children: [
            Text(
              t == null ? _range.label : '${_range.label} · ${t.count} campaigns · ${t.active} active',
              style: AppText.body.copyWith(color: c.textSecondary),
            ),
            const SizedBox(height: Space.s3),
            MetaFilterBar(range: _range, onRange: (r) => setState(() => _range = r)),
            const SizedBox(height: Space.s4),
            AsyncBody<List<Campaign>>(
              value: async,
              onRetry: () => ref.invalidate(campaignsProvider(q)),
              loading: const SizedBox(height: 600, child: LoadingList(count: 6, itemHeight: 110)),
              data: (list) => list.isEmpty
                  ? EmptyState(
                      icon: LucideIcons.megaphone,
                      title: 'No campaigns found',
                      message:
                          'Nothing for ${accountLabels[account]} in this range. Try another account, '
                          'or check the Meta connection in Settings.',
                      actionLabel: 'Open Settings',
                      onAction: () => context.go('/more/settings'),
                    )
                  : _body(list, account),
            ),
          ],
        ),
      ),
    );
  }

  Widget _body(List<Campaign> list, String account) {
    final t = CampaignTotals.of(list);
    final (cplLabel, cplTone, _) = cplStyle(cplLevel(t.cpl));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        StatGrid(
          children: [
            StatCard(label: 'Campaigns', value: number(t.count), icon: LucideIcons.megaphone),
            StatCard(label: 'Active', value: number(t.active), icon: LucideIcons.trendingUp, tone: Tone.success),
            StatCard(label: 'Total spend', value: rupees(t.spend), icon: LucideIcons.indianRupee),
            StatCard(label: 'Total leads', value: number(t.leads), icon: LucideIcons.users),
            StatCard(
              label: 'Avg CPL',
              value: t.cpl > 0 ? rupees(t.cpl) : '—',
              icon: LucideIcons.target,
              tone: t.cpl > 0 ? cplTone : Tone.neutral,
              sub: t.cpl > 0 ? cplLabel : null,
              subTone: cplTone,
            ),
          ],
        ),
        const SizedBox(height: Space.s5),
        const SectionHeader('Campaign performance', subtitle: 'Sort by'),
        Wrap(
          spacing: Space.s2,
          children: [
            for (final s in CampaignSort.values)
              ChoiceChip(
                label: Text(s == CampaignSort.cpl ? 'CPL' : s.name[0].toUpperCase() + s.name.substring(1)),
                selected: _sort == s,
                onSelected: (_) => setState(() => _sort = s),
              ),
          ],
        ),
        const SizedBox(height: Space.s3),
        for (final c in sortCampaigns(list, _sort)) ...[
          CampaignTile(c, showAccount: account == 'all', detailed: true),
          const SizedBox(height: Space.s3),
        ],
        CampaignTotalsCard(t),
      ],
    );
  }
}
