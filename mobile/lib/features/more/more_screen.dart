import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';

/// Everything that isn't a bottom tab (DESIGN_PLAN §4 "More" sheet).
class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  static const _groups = [
    ('Meta Ads', [(LucideIcons.megaphone, 'Campaigns', 'Spend, leads and CPL per campaign', '/more/campaigns')]),
    (
      'WhatsApp',
      [
        (LucideIcons.send, 'Send & bulk send', 'Single messages and broadcasts', '/more/send'),
        (LucideIcons.chartColumn, 'Broadcasts', 'Reports, delivery and replies', '/more/broadcasts'),
        (LucideIcons.fileText, 'Templates', 'Create and track Meta templates', '/more/templates'),
        (LucideIcons.radio, 'RCS', 'Coming soon', '/more/rcs'),
      ],
    ),
    ('Audience', [(LucideIcons.inbox, 'Enquiries', 'Website form submissions', '/more/enquiries')]),
    ('Account', [(LucideIcons.settings, 'Settings', 'Meta connection, notifications, appearance', '/more/settings')]),
  ];

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(
        padding: const EdgeInsets.all(Space.s4),
        children: [
          for (final (group, items) in _groups) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.s1, Space.s3, 0, Space.s2),
              child: Text(group.toUpperCase(), style: AppText.overline.copyWith(color: c.textTertiary)),
            ),
            AppCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  for (final (i, (icon, title, sub, path)) in items.indexed) ...[
                    if (i > 0) const Divider(indent: 64),
                    ListTile(
                      minTileHeight: 64,
                      leading: Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(color: c.brandSubtle, borderRadius: BorderRadius.circular(Radii.md)),
                        child: Icon(icon, size: 20, color: c.brandText),
                      ),
                      title: Text(title, style: AppText.label.copyWith(color: c.textPrimary)),
                      subtitle: Text(sub, style: AppText.caption.copyWith(color: c.textSecondary)),
                      trailing: Icon(LucideIcons.chevronRight, size: 18, color: c.textTertiary),
                      onTap: () => context.go(path),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
