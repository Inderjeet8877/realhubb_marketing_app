import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../app/providers.dart';
import '../../core/format.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import 'data.dart';

/// Campaign widgets shared by Campaigns and the Dashboard's Meta view.

const accountLabels = {'all': 'All accounts', '1': 'Account 1', '2': 'Account 2', '3': 'Account 3'};

(String, Tone, IconData) cplStyle(CplLevel l) => switch (l) {
  CplLevel.good => ('Good', Tone.success, LucideIcons.circleCheck),
  CplLevel.moderate => ('Moderate', Tone.warning, LucideIcons.triangleAlert),
  CplLevel.high => ('High', Tone.danger, LucideIcons.circleAlert),
  CplLevel.none => ('No leads', Tone.neutral, LucideIcons.circleDot),
};

/// "₹420 · Moderate" pill — value, label and icon, never colour alone.
class CplBadge extends StatelessWidget {
  const CplBadge(this.cpl, {super.key});
  final double cpl;

  @override
  Widget build(BuildContext context) {
    final level = cplLevel(cpl);
    if (level == CplLevel.none) return const StatusBadge('—');
    final (label, tone, icon) = cplStyle(level);
    return StatusBadge('${rupees(cpl)} · $label', tone: tone, icon: icon);
  }
}

class CampaignStatusBadge extends StatelessWidget {
  const CampaignStatusBadge(this.status, {super.key});
  final String status;

  @override
  Widget build(BuildContext context) {
    final (tone, icon) = switch (status) {
      'ACTIVE' => (Tone.success, LucideIcons.circleCheck),
      'PAUSED' => (Tone.warning, LucideIcons.circlePause),
      'COMPLETED' => (Tone.neutral, LucideIcons.flag),
      'ARCHIVED' => (Tone.neutral, LucideIcons.archive),
      _ => (Tone.neutral, LucideIcons.circleDot),
    };
    final label = status.isEmpty ? 'Unknown' : status[0] + status.substring(1).toLowerCase().replaceAll('_', ' ');
    return StatusBadge(label, tone: tone, icon: icon);
  }
}

/// Label over value, for metric rows inside cards.
class Metric extends StatelessWidget {
  const Metric(this.label, this.value, {super.key, this.tone});
  final String label;
  final Widget value;
  final Tone? tone;

  Metric.text(this.label, String text, {super.key, this.tone}) : value = _MetricText(text, tone);

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label, style: AppText.caption.copyWith(color: context.colors.textSecondary)),
      const SizedBox(height: 2),
      value,
    ],
  );
}

class _MetricText extends StatelessWidget {
  const _MetricText(this.text, this.tone);
  final String text;
  final Tone? tone;

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: AppText.label.copyWith(color: tone?.fg(context.colors) ?? context.colors.textPrimary),
    maxLines: 1,
    overflow: TextOverflow.ellipsis,
  );
}

/// One campaign as a card (phones get cards instead of a wide table).
class CampaignTile extends StatelessWidget {
  const CampaignTile(this.c, {super.key, this.showAccount = true, this.detailed = false});
  final Campaign c;
  final bool showAccount, detailed;

  @override
  Widget build(BuildContext context) {
    final col = context.colors;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            c.name,
            style: AppText.label.copyWith(color: col.textPrimary),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          if (c.objective.isNotEmpty)
            Text(objectiveLabel(c.objective), style: AppText.caption.copyWith(color: col.textTertiary)),
          const SizedBox(height: Space.s2),
          Wrap(
            spacing: Space.s2,
            runSpacing: Space.s1,
            children: [
              CampaignStatusBadge(c.status),
              if (showAccount && c.accountName.isNotEmpty)
                StatusBadge(c.accountName, tone: Tone.brand, icon: LucideIcons.wallet),
            ],
          ),
          const SizedBox(height: Space.s3),
          Wrap(
            spacing: Space.s5,
            runSpacing: Space.s2,
            children: [
              Metric.text('Spend', rupees(c.spend)),
              if (detailed) ...[
                Metric.text('Impressions', number(c.impressions)),
                Metric.text('Clicks', number(c.clicks)),
                Metric.text('CTR', percent(c.ctr, decimals: 2), tone: c.ctr >= 2 ? Tone.success : null),
              ],
              Metric.text('Leads', number(c.leads)),
              Metric('CPL', CplBadge(c.cpl)),
            ],
          ),
        ],
      ),
    );
  }
}

/// Totals row under a campaign list.
class CampaignTotalsCard extends StatelessWidget {
  const CampaignTotalsCard(this.t, {super.key});
  final CampaignTotals t;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(Space.s4),
    decoration: BoxDecoration(color: context.colors.surfaceHover, borderRadius: BorderRadius.circular(Radii.lg)),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Total', style: AppText.label.copyWith(color: context.colors.textPrimary)),
        const SizedBox(height: Space.s2),
        Wrap(
          spacing: Space.s5,
          runSpacing: Space.s2,
          children: [
            Metric.text('Spend', rupees(t.spend)),
            Metric.text('Impressions', number(t.impressions)),
            Metric.text('Clicks', number(t.clicks)),
            Metric.text('CTR', t.impressions > 0 ? percent(t.ctr, decimals: 2) : '—'),
            Metric.text('Leads', number(t.leads)),
            Metric('Avg CPL', CplBadge(t.cpl)),
          ],
        ),
      ],
    ),
  );
}

/// Opens a bottom sheet of options and returns the picked key.
Future<T?> pickOption<T>(BuildContext context, String title, Map<T, String> options, T selected) =>
    showModalBottomSheet<T>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.s4, 0, Space.s4, Space.s2),
              child: Text(title, style: AppText.h3.copyWith(color: context.colors.textPrimary)),
            ),
            for (final e in options.entries)
              ListTile(
                title: Text(e.value),
                trailing: e.key == selected ? Icon(LucideIcons.check, color: context.colors.brandText) : null,
                selected: e.key == selected,
                onTap: () => Navigator.pop(ctx, e.key),
              ),
          ],
        ),
      ),
    );

class _PickerButton extends StatelessWidget {
  const _PickerButton({required this.icon, required this.label, required this.onPressed, required this.semantic});
  final IconData icon;
  final String label, semantic;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => Semantics(
    label: semantic,
    button: true,
    excludeSemantics: true,
    child: OutlinedButton.icon(
      onPressed: onPressed,
      icon: Icon(icon, size: 16),
      label: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
          const SizedBox(width: Space.s1),
          const Icon(LucideIcons.chevronDown, size: 16),
        ],
      ),
      style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: Space.s3)),
    ),
  );
}

/// Date range control: presets + custom calendar range.
class RangeButton extends StatelessWidget {
  const RangeButton({super.key, required this.value, required this.onChanged});
  final MetaRange value;
  final ValueChanged<MetaRange> onChanged;

  Future<void> _pick(BuildContext context) async {
    final key = await pickOption<String>(context, 'Date range', {
      ...MetaRange.presets,
      'custom': 'Custom range…',
    }, value.custom == null ? value.preset : 'custom');
    if (key == null || !context.mounted) return;
    if (key != 'custom') return onChanged(MetaRange(key));
    final now = DateTime.now();
    final r = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 3),
      lastDate: now,
      initialDateRange: value.custom ?? DateTimeRange(start: now.subtract(const Duration(days: 30)), end: now),
    );
    if (r != null) onChanged(MetaRange('custom', r));
  }

  @override
  Widget build(BuildContext context) => _PickerButton(
    icon: LucideIcons.calendar,
    label: value.label,
    semantic: 'Date range: ${value.label}. Change',
    onPressed: () => _pick(context),
  );
}

/// Meta account picker bound to the persisted [accountProvider].
class AccountButton extends ConsumerWidget {
  const AccountButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final account = ref.watch(accountProvider);
    final label = accountLabels[account] ?? 'All accounts';
    return _PickerButton(
      icon: LucideIcons.wallet,
      label: label,
      semantic: 'Ad account: $label. Change',
      onPressed: () async {
        final picked = await pickOption(context, 'Ad account', accountLabels, account);
        if (picked != null) ref.read(accountProvider.notifier).set(picked);
      },
    );
  }
}

/// Range + account controls side by side (stacked if it won't fit).
class MetaFilterBar extends StatelessWidget {
  const MetaFilterBar({super.key, required this.range, required this.onRange});
  final MetaRange range;
  final ValueChanged<MetaRange> onRange;

  @override
  Widget build(BuildContext context) => Wrap(
    spacing: Space.s2,
    runSpacing: Space.s2,
    children: [
      RangeButton(value: range, onChanged: onRange),
      const AccountButton(),
    ],
  );
}
