import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import 'rcs_logic.dart';

final rcsConfigProvider = FutureProvider.autoDispose<({bool configured, List<String> missing})>((ref) async {
  final d = await ref.read(apiClientProvider).get('/api/rcs/config-status');
  return (configured: d['configured'] == true, missing: [for (final m in (d['missing'] as List? ?? const [])) '$m']);
});

final rcsContactsProvider = FutureProvider.autoDispose<List<Recipient>>((ref) async {
  final d = await ref.read(apiClientProvider).get('/api/contacts');
  return [
    for (final c in (d['contacts'] as List? ?? const []))
      if ('${c['phone'] ?? ''}'.isNotEmpty) (name: '${c['name'] ?? c['phone']}', phone: '${c['phone']}'),
  ];
});

class RcsMessage {
  RcsMessage.fromJson(Map<String, dynamic> j)
    : name = '${j['name'] ?? ''}',
      phone = '${j['phone'] ?? ''}',
      message = '${j['message'] ?? ''}',
      success = j['success'] == true,
      errorDesc = j['errorDesc'] as String?,
      createdAt = parseDate(j['createdAt']);
  final String name, phone, message;
  final bool success;
  final String? errorDesc;
  final DateTime? createdAt;
}

final rcsMessagesProvider = FutureProvider.autoDispose<List<RcsMessage>>((ref) async {
  final d = await ref.read(apiClientProvider).get('/api/rcs/messages');
  return [for (final m in (d['messages'] as List? ?? const [])) RcsMessage.fromJson(Map<String, dynamic>.from(m))];
});

/// RCS via Ping Smart (web: dashboard/rcs). Sending stays disabled until the
/// server reports the DLT config as complete.
class RcsScreen extends ConsumerStatefulWidget {
  const RcsScreen({super.key});

  @override
  ConsumerState<RcsScreen> createState() => _RcsScreenState();
}

class _RcsScreenState extends ConsumerState<RcsScreen> {
  final _message = TextEditingController();
  final _quickName = TextEditingController();
  final _quickPhone = TextEditingController();
  final _search = TextEditingController();
  final _selected = <String>{};
  bool _sending = false;
  (String, Tone)? _notice;

  @override
  void dispose() {
    for (final c in [_message, _quickName, _quickPhone, _search]) {
      c.dispose();
    }
    super.dispose();
  }

  List<Recipient> get _recipients => buildRecipients(
    contacts: ref.read(rcsContactsProvider).value ?? const [],
    selectedPhones: _selected,
    quickName: _quickName.text,
    quickPhone: _quickPhone.text,
  );

  Future<void> _refresh() async {
    ref.invalidate(rcsConfigProvider);
    ref.invalidate(rcsContactsProvider);
    await ref.refresh(rcsMessagesProvider.future).catchError((_) => <RcsMessage>[]);
  }

  Future<void> _send() async {
    FocusScope.of(context).unfocus();
    if (_message.text.trim().isEmpty) {
      setState(() => _notice = ('Write a message first.', Tone.danger));
      return;
    }
    setState(() {
      _sending = true;
      _notice = null;
    });
    try {
      final d = await ref
          .read(apiClientProvider)
          .post(
            '/api/rcs/send',
            body: {
              'message': _message.text,
              'contacts': [
                for (final r in _recipients) {'name': r.name, 'phone': r.phone},
              ],
            },
          );
      final sent = d['sent'] ?? 0, failed = d['failed'] ?? 0;
      setState(() {
        _notice = (
          failed > 0 ? '$sent sent, $failed failed.' : '$sent sent.',
          failed > 0 ? Tone.warning : Tone.success,
        );
        _selected.clear();
        _quickName.clear();
        _quickPhone.clear();
      });
      ref.invalidate(rcsMessagesProvider);
    } on ApiException catch (e) {
      setState(() => _notice = (e.message, Tone.danger));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final config = ref.watch(rcsConfigProvider).value;
    final configured = config?.configured ?? true; // assume OK until known, like the web
    final count = _recipients.length;

    return Scaffold(
      appBar: AppBar(title: const Text('RCS messaging')),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.all(Space.s4),
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Send RCS messages via Ping Smart. Every send is logged below.',
                    style: AppText.body.copyWith(color: c.textSecondary),
                  ),
                ),
                const SizedBox(width: Space.s2),
                const StatusBadge('Coming soon', tone: Tone.warning, icon: LucideIcons.sparkles),
              ],
            ),
            const SizedBox(height: Space.s4),
            const AlertBanner(
              tone: Tone.info,
              title: 'This channel is being set up',
              message:
                  'Sending is built and ready. It needs your DLT-registered Sender ID, Content ID and Entity ID '
                  'from Ping Smart, then it switches on automatically.',
            ),
            if (config != null && !config.configured) ...[
              const SizedBox(height: Space.s3),
              AlertBanner(
                tone: Tone.warning,
                title: "RCS isn't set up yet",
                message:
                    'Missing: ${config.missing.join(', ')}. Add these on the server. '
                    'Send stays disabled until then.',
              ),
            ],
            const SizedBox(height: Space.s6),
            const SectionHeader('Compose'),
            AppCard(child: _composer(context, configured, count)),
            const SizedBox(height: Space.s6),
            const SectionHeader('Sent messages'),
            _SentList(onRetry: () => ref.invalidate(rcsMessagesProvider)),
          ],
        ),
      ),
    );
  }

  Widget _composer(BuildContext context, bool configured, int count) {
    final c = context.colors;
    void changed(_) => setState(() {});
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _message,
          minLines: 3,
          maxLines: 6,
          decoration: const InputDecoration(labelText: 'Message', alignLabelWithHint: true),
        ),
        const SizedBox(height: Space.s3),
        TextField(
          controller: _quickName,
          decoration: const InputDecoration(labelText: 'Name (optional, for a one-off number)'),
        ),
        const SizedBox(height: Space.s3),
        TextField(
          controller: _quickPhone,
          onChanged: changed,
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(labelText: 'Phone number (one-off send)'),
        ),
        const SizedBox(height: Space.s4),
        Row(
          children: [
            Icon(LucideIcons.users, size: 16, color: c.textSecondary),
            const SizedBox(width: Space.s2),
            Text('Or select from contacts', style: AppText.label.copyWith(color: c.textSecondary)),
            const Spacer(),
            if (_selected.isNotEmpty)
              TextButton(onPressed: () => setState(_selected.clear), child: Text('Clear ${_selected.length}')),
          ],
        ),
        const SizedBox(height: Space.s2),
        TextField(
          controller: _search,
          onChanged: changed,
          decoration: const InputDecoration(
            labelText: 'Search contacts',
            prefixIcon: Icon(LucideIcons.search, size: 18),
          ),
        ),
        const SizedBox(height: Space.s2),
        _contactPicker(context),
        if (_notice != null) ...[const SizedBox(height: Space.s3), AlertBanner(tone: _notice!.$2, title: _notice!.$1)],
        const SizedBox(height: Space.s4),
        FilledButton.icon(
          onPressed: !configured || _sending || count == 0 ? null : _send,
          icon: _sending
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(LucideIcons.send, size: 18),
          label: Text(
            _sending
                ? 'Sending…'
                : count == 0
                ? 'Send'
                : 'Send to $count',
          ),
        ),
      ],
    );
  }

  Widget _contactPicker(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(rcsContactsProvider);
    if (async.isLoading && !async.hasValue) {
      return const SizedBox(height: 120, child: LoadingList(count: 2, itemHeight: 40));
    }
    if (async.hasError && !async.hasValue) {
      return AlertBanner(
        tone: Tone.danger,
        title: "Contacts couldn't load",
        message: '${async.error}. You can still send to a one-off number.',
        actionLabel: 'Try again',
        onAction: () => ref.invalidate(rcsContactsProvider),
      );
    }
    final all = async.value ?? const <Recipient>[];
    final shown = filterContacts(all, _search.text);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          constraints: const BoxConstraints(maxHeight: 280),
          decoration: BoxDecoration(
            border: Border.all(color: c.border),
            borderRadius: BorderRadius.circular(Radii.md),
          ),
          child: shown.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(Space.s4),
                  child: Center(
                    child: Text(
                      all.isEmpty ? 'No contacts yet.' : 'No matching contacts.',
                      style: AppText.body.copyWith(color: c.textTertiary),
                    ),
                  ),
                )
              : ListView.builder(
                  shrinkWrap: true,
                  itemCount: shown.length,
                  itemBuilder: (_, i) {
                    final r = shown[i];
                    return CheckboxListTile(
                      dense: true,
                      value: _selected.contains(r.phone),
                      onChanged: (v) => setState(() => v! ? _selected.add(r.phone) : _selected.remove(r.phone)),
                      title: Text(r.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                      subtitle: Text(displayPhone(r.phone)),
                      controlAffinity: ListTileControlAffinity.leading,
                    );
                  },
                ),
        ),
        if (all.length > 200 && _search.text.trim().isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: Space.s1),
            child: Text(
              'Showing first 200 of ${number(all.length)}. Search to narrow down.',
              style: AppText.caption.copyWith(color: c.textTertiary),
            ),
          ),
      ],
    );
  }
}

class _SentList extends ConsumerWidget {
  const _SentList({required this.onRetry});
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    return ref
        .watch(rcsMessagesProvider)
        .when(
          skipLoadingOnRefresh: true,
          loading: () => const SizedBox(height: 260, child: LoadingList(count: 3)),
          error: (e, _) => AlertBanner(
            tone: Tone.danger,
            title: "Couldn't load sent messages",
            message: '$e',
            actionLabel: 'Try again',
            onAction: onRetry,
          ),
          data: (msgs) => msgs.isEmpty
              ? AppCard(
                  child: Text(
                    'No RCS messages sent yet. Messages you send above appear here.',
                    style: AppText.body.copyWith(color: c.textSecondary),
                  ),
                )
              : Column(
                  children: [
                    for (final m in msgs)
                      Padding(
                        padding: const EdgeInsets.only(bottom: Space.s3),
                        child: AppCard(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      m.name,
                                      style: AppText.label.copyWith(color: c.textPrimary),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  Text(dateTime(m.createdAt), style: AppText.caption.copyWith(color: c.textTertiary)),
                                ],
                              ),
                              Text(displayPhone(m.phone), style: AppText.caption.copyWith(color: c.textSecondary)),
                              const SizedBox(height: Space.s2),
                              Text(m.message, style: AppText.body.copyWith(color: c.textPrimary)),
                              const SizedBox(height: Space.s2),
                              m.success
                                  ? const StatusBadge('Sent', tone: Tone.success, icon: LucideIcons.circleCheck)
                                  : const StatusBadge('Failed', tone: Tone.danger, icon: LucideIcons.circleX),
                              if (!m.success && m.errorDesc != null)
                                Padding(
                                  padding: const EdgeInsets.only(top: Space.s1),
                                  child: Text(m.errorDesc!, style: AppText.caption.copyWith(color: c.dangerFg)),
                                ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
        );
  }
}
