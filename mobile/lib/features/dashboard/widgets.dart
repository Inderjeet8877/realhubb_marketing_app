import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import 'data.dart';

/// "Needs attention" card. Urgency is icon + text, not colour alone.
class ActionQueue extends StatelessWidget {
  const ActionQueue(this.items, {super.key});
  final List<ActionItem> items;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('Action queue', style: AppText.h3.copyWith(color: c.textPrimary)),
              ),
              if (items.isNotEmpty) StatusBadge('${items.length} to review', tone: Tone.brand),
            ],
          ),
          const SizedBox(height: Space.s2),
          if (items.isEmpty)
            Row(
              children: [
                Icon(LucideIcons.circleCheck, size: 18, color: c.successIcon),
                const SizedBox(width: Space.s2),
                Expanded(
                  child: Text(
                    'Nothing needs attention right now',
                    style: AppText.body.copyWith(color: c.textSecondary),
                  ),
                ),
              ],
            ),
          for (final it in items)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: Space.s1),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(color: it.tone.bg(c), borderRadius: BorderRadius.circular(Radii.md)),
                    child: Icon(it.icon, size: 18, color: it.tone.fg(c)),
                  ),
                  const SizedBox(width: Space.s3),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          it.title,
                          style: AppText.label.copyWith(color: c.textPrimary),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(it.subtitle, style: AppText.caption.copyWith(color: c.textSecondary)),
                      ],
                    ),
                  ),
                  if (it.route != null)
                    TextButton(
                      onPressed: () => context.go(it.route!),
                      child: Text(it.actionLabel, semanticsLabel: '${it.actionLabel}: ${it.title}'),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Thin progress bar (0–100) with token colours.
class ProgressLine extends StatelessWidget {
  const ProgressLine(this.percent, {super.key, this.color});
  final double percent;
  final Color? color;

  @override
  Widget build(BuildContext context) => LinearProgressIndicator(
    value: (percent / 100).clamp(0, 1).toDouble(),
    minHeight: 6,
    borderRadius: BorderRadius.circular(Radii.full),
    color: color ?? context.colors.brand,
    backgroundColor: context.colors.border,
  );
}

/// Card with a title (+ optional icon/subtitle) and body.
class SectionCard extends StatelessWidget {
  const SectionCard({super.key, required this.title, required this.child, this.icon, this.subtitle});
  final String title;
  final String? subtitle;
  final IconData? icon;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (icon != null) ...[Icon(icon, size: 18, color: c.textSecondary), const SizedBox(width: Space.s2)],
              Expanded(
                child: Text(title, style: AppText.h3.copyWith(color: c.textPrimary)),
              ),
            ],
          ),
          if (subtitle != null) Text(subtitle!, style: AppText.caption.copyWith(color: c.textSecondary)),
          const SizedBox(height: Space.s3),
          child,
        ],
      ),
    );
  }
}

/// Small square + label, for chart legends.
class LegendDot extends StatelessWidget {
  const LegendDot(this.color, this.label, {super.key});
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2)),
      ),
      const SizedBox(width: Space.s1),
      Flexible(
        child: Text(label, style: AppText.caption.copyWith(color: context.colors.textSecondary)),
      ),
    ],
  );
}

/// Chart palette (DESIGN_PLAN §3.3), mapped onto theme tokens.
List<Color> chartPalette(AppColors c) => [c.brand, c.successIcon, c.warningSolid, c.infoFg, c.textTertiary, c.dangerFg];
