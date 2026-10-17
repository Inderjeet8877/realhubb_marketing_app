import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../widgets/ui.dart';

/// Placeholder — replaced by the feature build.
class InboxScreen extends StatelessWidget {
  const InboxScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Inbox')),
    body: const EmptyState(icon: LucideIcons.hammer, title: 'Being built'),
  );
}
