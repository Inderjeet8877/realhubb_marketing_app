import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../app/providers.dart';
import '../../theme/tokens.dart';
import 'meta_view.dart';
import 'whatsapp_view.dart';

/// Home tab: Meta | WhatsApp switch (choice persisted). Only the active view
/// is mounted, so only its data is fetched — same as the web.
class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  static const _key = 'dashboard_view';
  late String _view = ref.read(prefsProvider).getString(_key) ?? 'meta';

  void _set(String v) {
    setState(() => _view = v);
    ref.read(prefsProvider).setString(_key, v);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Dashboard')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(Space.s4),
            child: SizedBox(
              width: double.infinity,
              child: SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'meta', label: Text('Meta'), icon: Icon(LucideIcons.megaphone, size: 16)),
                  ButtonSegment(
                    value: 'whatsapp',
                    label: Text('WhatsApp'),
                    icon: Icon(LucideIcons.messageCircle, size: 16),
                  ),
                ],
                selected: {_view},
                showSelectedIcon: false,
                onSelectionChanged: (s) => _set(s.first),
              ),
            ),
          ),
          Expanded(child: _view == 'whatsapp' ? const WhatsAppView() : const MetaView()),
        ],
      ),
    );
  }
}
