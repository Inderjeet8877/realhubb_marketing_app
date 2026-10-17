import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../app/providers.dart';
import '../../core/api_client.dart';
import '../../core/config.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import '../auth/auth_controller.dart';
import 'legal_pages.dart';
import 'settings_logic.dart';

final metaStatusProvider = FutureProvider.autoDispose<List<MetaSlot>>((ref) async {
  final d = await ref.read(apiClientProvider).get('/api/meta/status');
  return [for (final s in (d['slots'] as List? ?? const [])) MetaSlot.fromJson(Map<String, dynamic>.from(s))];
});

final devicesProvider = FutureProvider.autoDispose<List<Device>>((ref) async {
  final d = await ref.read(apiClientProvider).get('/api/notifications/register');
  return [for (final x in (d['devices'] as List? ?? const [])) Device.fromJson(Map<String, dynamic>.from(x))];
});

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(devicesProvider);
          await ref.refresh(metaStatusProvider.future).catchError((_) => <MetaSlot>[]);
        },
        child: ListView(
          padding: const EdgeInsets.all(Space.s4),
          children: [
            const _Section('Meta connection', subtitle: 'Campaigns, leads and WhatsApp all use this login.'),
            const _MetaCard(),
            const _Section('Notifications'),
            const _NotificationsCard(),
            const _Section('Registered devices'),
            const _DevicesCard(),
            const _Section('Appearance'),
            AppCard(
              child: SegmentedButton<ThemeMode>(
                segments: const [
                  ButtonSegment(value: ThemeMode.system, label: Text('System'), icon: Icon(LucideIcons.monitor)),
                  ButtonSegment(value: ThemeMode.light, label: Text('Light'), icon: Icon(LucideIcons.sun)),
                  ButtonSegment(value: ThemeMode.dark, label: Text('Dark'), icon: Icon(LucideIcons.moon)),
                ],
                selected: {ref.watch(themeModeProvider)},
                onSelectionChanged: (s) => ref.read(themeModeProvider.notifier).set(s.first),
              ),
            ),
            const _Section('Account and data'),
            const _AccountCard(),
            const _Section('About'),
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Broadzen 1.0.0', style: AppText.label.copyWith(color: c.textPrimary)),
                  const SizedBox(height: Space.s1),
                  Text(AppConfig.apiBase, style: AppText.caption.copyWith(color: c.textTertiary)),
                ],
              ),
            ),
            const SizedBox(height: Space.s6),
          ],
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section(this.title, {this.subtitle});
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: Space.s6),
    child: SectionHeader(title, subtitle: subtitle),
  );
}

/// Card with zero padding so ListTiles keep their own 48dp+ rows.
class _ListCard extends StatelessWidget {
  const _ListCard(this.children);
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => AppCard(
    padding: const EdgeInsets.symmetric(vertical: Space.s1),
    child: Column(children: children),
  );
}

Widget _inlineError(Object e, VoidCallback retry) => Padding(
  padding: const EdgeInsets.all(Space.s3),
  child: AlertBanner(
    tone: Tone.danger,
    title: "Couldn't load this",
    message: '$e',
    actionLabel: 'Try again',
    onAction: retry,
  ),
);

class _MetaCard extends ConsumerStatefulWidget {
  const _MetaCard();

  @override
  ConsumerState<_MetaCard> createState() => _MetaCardState();
}

class _MetaCardState extends ConsumerState<_MetaCard> {
  String? _busy;

  Future<void> _disconnect(MetaSlot s) async {
    final ok = await confirm(
      context,
      title: 'Disconnect account ${s.slot}?',
      message: 'Campaigns, leads and WhatsApp for this slot fall back to server settings until you reconnect.',
      confirmLabel: 'Disconnect',
      danger: true,
    );
    if (!ok || !mounted) return;
    setState(() => _busy = s.slot);
    try {
      await ref.read(apiClientProvider).post('/api/meta/disconnect', body: {'slot': s.slot});
      if (mounted) showSnack(context, 'Account ${s.slot} disconnected.', tone: Tone.success);
      ref.invalidate(metaStatusProvider);
    } on ApiException catch (e) {
      if (mounted) {
        showSnack(
          context,
          e.status == 401 ? 'Sign-in required (${e.message}). Disconnect on the web for now.' : e.message,
          tone: Tone.danger,
        );
      }
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(metaStatusProvider);
    final slots = async.value ?? const [];
    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (async.isLoading && !async.hasValue)
            const SizedBox(height: 220, child: LoadingList(count: 3, itemHeight: 52))
          else if (async.hasError && !async.hasValue)
            _inlineError(async.error!, () => ref.invalidate(metaStatusProvider))
          else
            for (final s in slots) _slotTile(c, s),
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.s4, Space.s2, Space.s4, Space.s3),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                FilledButton.icon(
                  onPressed: () => openLink(context, Uri.parse('${AppConfig.apiBase}/dashboard/settings')),
                  icon: const Icon(LucideIcons.externalLink, size: 18),
                  label: Text(slots.any((s) => s.connected) ? 'Connect another account on web' : 'Connect on web'),
                ),
                const SizedBox(height: Space.s2),
                Row(
                  children: [
                    Icon(LucideIcons.refreshCw, size: 14, color: c.textTertiary),
                    const SizedBox(width: Space.s2),
                    Expanded(
                      child: Text(
                        'Meta logins expire after about 60 days. Reconnect when the warning appears.',
                        style: AppText.caption.copyWith(color: c.textTertiary),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _slotTile(AppColors c, MetaSlot s) {
    final (label, tone) = s.status;
    final icon = switch (tone) {
      Tone.success => LucideIcons.circleCheck,
      Tone.warning => LucideIcons.triangleAlert,
      _ => LucideIcons.clock,
    };
    return ListTile(
      title: Text('Account ${s.slot}${s.label == null ? '' : ' · ${s.label}'}'),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: Space.s1),
        child: Wrap(
          spacing: Space.s2,
          runSpacing: Space.s1,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            StatusBadge(label, tone: tone, icon: icon),
            if (s.expiryText != null)
              Text(
                s.expiryText!,
                style: AppText.caption.copyWith(color: tone == Tone.warning ? c.warningFg : c.textTertiary),
              ),
            if (!s.connected)
              Text('Using server settings, if configured', style: AppText.caption.copyWith(color: c.textTertiary)),
          ],
        ),
      ),
      trailing: !s.connected
          ? null
          : _busy == s.slot
          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
          : TextButton.icon(
              style: TextButton.styleFrom(foregroundColor: c.dangerFg),
              onPressed: _busy == null ? () => _disconnect(s) : null,
              icon: const Icon(LucideIcons.unlink, size: 16),
              label: const Text('Disconnect'),
            ),
    );
  }
}

class _NotificationsCard extends ConsumerStatefulWidget {
  const _NotificationsCard();

  @override
  ConsumerState<_NotificationsCard> createState() => _NotificationsCardState();
}

class _NotificationsCardState extends ConsumerState<_NotificationsCard> {
  // ponytail: local prefs only; wire to FCM registration once Firebase sign-in lands.
  Widget _toggle(String key, String title, IconData icon) {
    final prefs = ref.read(prefsProvider);
    return SwitchListTile(
      secondary: Icon(icon),
      title: Text(title),
      subtitle: const Text('Coming with sign-in'),
      value: prefs.getBool(key) ?? true,
      onChanged: (v) => setState(() => prefs.setBool(key, v)),
    );
  }

  @override
  Widget build(BuildContext context) => _ListCard([
    _toggle('notif_push', 'Push notifications', LucideIcons.bell),
    _toggle('notif_sound', 'Sound', LucideIcons.volume2),
  ]);
}

class _DevicesCard extends ConsumerStatefulWidget {
  const _DevicesCard();

  @override
  ConsumerState<_DevicesCard> createState() => _DevicesCardState();
}

class _DevicesCardState extends ConsumerState<_DevicesCard> {
  String? _removing;

  Future<void> _remove(Device d) async {
    final ok = await confirm(
      context,
      title: 'Remove ${d.label}?',
      message: 'This device stops getting push notifications until the app registers it again.',
      confirmLabel: 'Remove',
      danger: true,
    );
    if (!ok || !mounted) return;
    setState(() => _removing = d.token);
    try {
      await ref.read(apiClientProvider).delete('/api/notifications/register', body: {'token': d.token});
      ref.invalidate(devicesProvider);
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, tone: Tone.danger);
    } finally {
      if (mounted) setState(() => _removing = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(devicesProvider);
    if (async.isLoading && !async.hasValue) {
      return const SizedBox(height: 170, child: LoadingList(count: 2, itemHeight: 56));
    }
    if (async.hasError && !async.hasValue) {
      return AppCard(
        padding: EdgeInsets.zero,
        child: _inlineError(async.error!, () => ref.invalidate(devicesProvider)),
      );
    }
    final devices = async.value!;
    if (devices.isEmpty) {
      return AppCard(
        child: Row(
          children: [
            Icon(LucideIcons.smartphone, color: c.textTertiary),
            const SizedBox(width: Space.s3),
            Expanded(
              child: Text(
                'No devices registered yet. Devices appear here once push notifications are switched on.',
                style: AppText.body.copyWith(color: c.textSecondary),
              ),
            ),
          ],
        ),
      );
    }
    return _ListCard([
      Padding(
        padding: const EdgeInsets.fromLTRB(Space.s4, Space.s2, Space.s4, 0),
        child: Text(
          '${devices.length} device${devices.length == 1 ? '' : 's'} receiving push notifications',
          style: AppText.caption.copyWith(color: c.textTertiary),
        ),
      ),
      for (final d in devices)
        ListTile(
          leading: Icon(d.isWeb ? LucideIcons.globe : LucideIcons.smartphone, color: c.brandText),
          title: Text(d.label, maxLines: 1, overflow: TextOverflow.ellipsis),
          subtitle: Text('${d.platformLine} · ${d.lastActive()}\n${d.installed}'),
          isThreeLine: true,
          trailing: _removing == d.token
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : IconButton(
                  tooltip: 'Remove ${d.label}',
                  color: c.dangerFg,
                  icon: const Icon(LucideIcons.trash2),
                  onPressed: _removing == null ? () => _remove(d) : null,
                ),
        ),
    ]);
  }
}

class _AccountCard extends ConsumerWidget {
  const _AccountCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final auth = ref.watch(authProvider);
    void push(Widget page) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));
    return _ListCard([
      ListTile(
        leading: const Icon(LucideIcons.user),
        title: Text(auth.email ?? (auth.devPreview ? 'Dev preview' : 'Not signed in')),
        subtitle: const Text('Signed in as'),
      ),
      ListTile(
        leading: const Icon(LucideIcons.shieldCheck),
        title: const Text('Privacy policy'),
        trailing: const Icon(LucideIcons.chevronRight),
        onTap: () => push(const PrivacyScreen()),
      ),
      ListTile(
        leading: const Icon(LucideIcons.userX),
        title: const Text('Request data deletion'),
        subtitle: const Text('Delete your account or specific data'),
        trailing: const Icon(LucideIcons.chevronRight),
        onTap: () => push(DataDeletionScreen(email: auth.email)),
      ),
      ListTile(
        leading: Icon(LucideIcons.logOut, color: c.dangerFg),
        title: Text('Sign out', style: TextStyle(color: c.dangerFg)),
        onTap: () async {
          final ok = await confirm(
            context,
            title: 'Sign out?',
            message: "You'll need to sign in again to use Broadzen.",
            confirmLabel: 'Sign out',
            danger: true,
          );
          if (ok) await ref.read(authProvider.notifier).signOut();
        },
      ),
    ]);
  }
}
