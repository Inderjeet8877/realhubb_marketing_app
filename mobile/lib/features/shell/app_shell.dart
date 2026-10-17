import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

/// Bottom tabs (phone) / NavigationRail (≥600dp) — DESIGN_PLAN §4.
/// Same five destinations on both: Home · Inbox · Leads · Contacts · More.
class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  static const _items = [
    (LucideIcons.house, 'Home'),
    (LucideIcons.messageSquare, 'Inbox'),
    (LucideIcons.target, 'Leads'),
    (LucideIcons.users, 'Contacts'),
    (LucideIcons.ellipsis, 'More'),
  ];

  void _go(int i) => shell.goBranch(i, initialLocation: i == shell.currentIndex);

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 600;
    if (wide) {
      return Scaffold(
        body: Row(
          children: [
            NavigationRail(
              selectedIndex: shell.currentIndex,
              onDestinationSelected: _go,
              labelType: NavigationRailLabelType.all,
              destinations: [
                for (final (icon, label) in _items) NavigationRailDestination(icon: Icon(icon), label: Text(label)),
              ],
            ),
            const VerticalDivider(width: 1),
            Expanded(child: shell),
          ],
        ),
      );
    }
    return Scaffold(
      body: shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: _go,
        destinations: [for (final (icon, label) in _items) NavigationDestination(icon: Icon(icon), label: label)],
      ),
    );
  }
}
