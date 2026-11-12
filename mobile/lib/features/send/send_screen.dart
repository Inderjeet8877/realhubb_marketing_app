import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import 'bulk/bulk_send_screen.dart';
import 'data.dart';
import 'template_preview.dart';

enum _Kind { template, text }

class _Sent {
  _Sent(this.to, this.summary, this.at);
  final String to, summary;
  final DateTime at;
}

/// Valid when the normalised number has 11–15 digits (country code included).
String? validatePhone(String? raw) {
  final d = normalizePhone(raw ?? '');
  if (d.isEmpty) return 'Enter a phone number';
  if (d.length < 11 || d.length > 15) return 'Enter a full number, e.g. +91 98765 43210';
  return null;
}

/// Single WhatsApp send (template or custom text). Bulk lives in bulk/.
class SendScreen extends ConsumerStatefulWidget {
  const SendScreen({super.key});

  @override
  ConsumerState<SendScreen> createState() => _SendScreenState();
}

class _SendScreenState extends ConsumerState<SendScreen> {
  final _form = GlobalKey<FormState>();
  final _phone = TextEditingController();
  final _text = TextEditingController();
  final _media = TextEditingController();
  final _recent = <_Sent>[]; // this session only, like the web
  _Kind _kind = _Kind.template;
  WaTemplate? _template;
  bool _sending = false;

  @override
  void dispose() {
    _phone.dispose();
    _text.dispose();
    _media.dispose();
    super.dispose();
  }

  bool get _missingMedia => _kind == _Kind.template && (_template?.needsMedia ?? false) && _media.text.trim().isEmpty;

  Future<void> _send() async {
    if (!_form.currentState!.validate()) return;
    final tpl = _kind == _Kind.template ? _template : null;
    if (_kind == _Kind.template && tpl == null) return showSnack(context, 'Choose a template', tone: Tone.danger);
    if (_kind == _Kind.text && _text.text.trim().isEmpty) {
      return showSnack(context, 'Type a message', tone: Tone.danger);
    }
    final phone = normalizePhone(_phone.text);
    setState(() => _sending = true);
    try {
      final d = await ref
          .read(apiClientProvider)
          .post(
            '/api/whatsapp/send',
            body: sendBody(phone: phone, text: _text.text.trim(), template: tpl, mediaUrl: _media.text),
          );
      if (d is! Map || d['success'] != true) throw ApiException('Failed to send');
      if (!mounted) return;
      setState(() {
        _recent.insert(0, _Sent(phone, tpl == null ? _text.text.trim() : 'Template: ${tpl.name}', DateTime.now()));
        _text.clear();
        if (tpl != null) {
          _template = null;
          _media.clear();
        }
      });
      HapticFeedback.lightImpact();
      showSnack(context, 'Sent to ${displayPhone(phone)}', tone: Tone.success);
    } catch (e) {
      if (mounted) showSnack(context, "Couldn't send: $e", tone: Tone.danger);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _refresh() =>
      Future.wait([ref.refresh(approvedTemplatesProvider.future), ref.refresh(waAccountProvider.future)])
          .catchError((_) => const <Object>[]);

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final account = ref.watch(waAccountProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Send message')),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: Form(
          key: _form,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(Space.s4),
            children: [
              FilledButton.tonalIcon(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const BulkSendScreen())),
                icon: const Icon(LucideIcons.users),
                label: const Text('Bulk send to many contacts'),
              ),
              const SizedBox(height: Space.s4),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Single message', style: AppText.h3.copyWith(color: c.textPrimary)),
                    const SizedBox(height: Space.s3),
                    _AccountStrip(account, onRetry: () => ref.invalidate(waAccountProvider)),
                    const SizedBox(height: Space.s4),
                    TextFormField(
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      autofillHints: const [AutofillHints.telephoneNumber],
                      decoration: const InputDecoration(
                        labelText: 'Recipient phone number',
                        hintText: '+91 98765 43210',
                        helperText: '10-digit numbers get +91 added',
                      ),
                      validator: validatePhone,
                    ),
                    const SizedBox(height: Space.s4),
                    Text('Message type', style: AppText.label.copyWith(color: c.textSecondary)),
                    const SizedBox(height: Space.s2),
                    SegmentedButton<_Kind>(
                      segments: const [
                        ButtonSegment(
                          value: _Kind.template,
                          label: Text('Template'),
                          icon: Icon(LucideIcons.layoutTemplate),
                        ),
                        ButtonSegment(value: _Kind.text, label: Text('Text'), icon: Icon(LucideIcons.messageSquare)),
                      ],
                      selected: {_kind},
                      onSelectionChanged: (s) => setState(() => _kind = s.first),
                    ),
                    const SizedBox(height: Space.s4),
                    if (_kind == _Kind.template)
                      ..._templateFields(account.value?.name ?? '')
                    else
                      TextFormField(
                        controller: _text,
                        minLines: 4,
                        maxLines: 8,
                        textCapitalization: TextCapitalization.sentences,
                        decoration: const InputDecoration(
                          labelText: 'Message',
                          hintText: 'Type your message',
                          alignLabelWithHint: true,
                          helperText: 'Free text only reaches people who messaged you in the last 24 hours',
                          helperMaxLines: 2,
                        ),
                      ),
                    const SizedBox(height: Space.s4),
                    if (_missingMedia) ...[
                      Text(
                        'This template needs a ${_template!.headerType} URL before it can be sent. '
                        'Meta accepts the call but never delivers it otherwise.',
                        style: AppText.caption.copyWith(color: c.dangerFg),
                      ),
                      const SizedBox(height: Space.s2),
                    ],
                    FilledButton.icon(
                      onPressed: _sending || _missingMedia ? null : _send,
                      icon: _sending
                          ? SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2, color: c.textSecondary),
                            )
                          : const Icon(LucideIcons.send),
                      label: Text(_sending ? 'Sending…' : 'Send message'),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: Space.s6),
              const SectionHeader('Recent messages', subtitle: 'Sent from this screen in this session'),
              if (_recent.isEmpty)
                Text('No messages sent yet.', style: AppText.body.copyWith(color: c.textSecondary))
              else
                for (final m in _recent.take(10))
                  Padding(
                    padding: const EdgeInsets.only(bottom: Space.s2),
                    child: AppCard(
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(displayPhone(m.to), style: AppText.label.copyWith(color: c.textPrimary)),
                                Text(
                                  m.summary,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: AppText.body.copyWith(color: c.textSecondary),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: Space.s2),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(chatTime(m.at), style: AppText.caption.copyWith(color: c.textTertiary)),
                              const SizedBox(height: Space.s1),
                              const StatusBadge('Sent', icon: LucideIcons.check),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _templateFields(String businessName) {
    final async = ref.watch(approvedTemplatesProvider);
    final list = async.value;
    if (list == null) {
      return [
        if (async.hasError)
          AlertBanner(
            tone: Tone.danger,
            title: "Couldn't load templates",
            message: '${async.error}',
            actionLabel: 'Try again',
            onAction: () => ref.invalidate(approvedTemplatesProvider),
          )
        else
          const LinearProgressIndicator(),
      ];
    }
    if (list.isEmpty) {
      return [
        AlertBanner(
          tone: Tone.warning,
          title: 'No approved templates',
          message: 'Create one on the Templates page and wait for Meta approval.',
          actionLabel: 'Reload',
          onAction: () => ref.invalidate(approvedTemplatesProvider),
        ),
      ];
    }
    // Keep the selection valid across refreshes (match by name).
    final sel = _template == null ? null : list.where((t) => t.name == _template!.name).firstOrNull;
    return [
      DropdownButtonFormField<WaTemplate>(
        key: ValueKey(sel?.name),
        initialValue: sel,
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'Template'),
        hint: const Text('Select a template'),
        items: [
          for (final t in list)
            DropdownMenuItem(
              value: t,
              child: Text(t.needsMedia ? '${t.name} · ${t.headerType}' : t.name, overflow: TextOverflow.ellipsis),
            ),
        ],
        onChanged: (t) => setState(() {
          _template = t;
          // Seed from the template's stored media URL (the web does the same).
          _media.text = t?.headerContent ?? '';
        }),
      ),
      if (sel != null) ...[
        const SizedBox(height: Space.s4),
        if (sel.needsMedia) ...[
          TextFormField(
            controller: _media,
            keyboardType: TextInputType.url,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              labelText: '${sel.headerType[0].toUpperCase()}${sel.headerType.substring(1)} URL (required)',
              hintText: 'https://your-server.com/file.jpg',
              helperText: 'Must be a public HTTPS link to the file',
            ),
            validator: (v) {
              final u = Uri.tryParse(v?.trim() ?? '');
              return u == null || !u.isScheme('https') || u.host.isEmpty ? 'Enter a public https:// link' : null;
            },
          ),
          const SizedBox(height: Space.s4),
        ],
        Center(
          child: TemplatePreview(
            template: sel,
            businessName: businessName,
            mediaUrl: sel.needsMedia ? _media.text : '',
          ),
        ),
      ],
    ];
  }
}

class _AccountStrip extends StatelessWidget {
  const _AccountStrip(this.account, {required this.onRetry});
  final AsyncValue<WaAccount> account;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final a = account.value;
    if (a != null) {
      final q = a.quality.toUpperCase();
      return AlertBanner(
        tone: Tone.success,
        title: 'Sending from ${a.label}',
        message: switch (q) {
          'GREEN' => 'Number quality: High',
          'YELLOW' => 'Number quality: Medium',
          'RED' => 'Number quality: Low',
          _ => null,
        },
      );
    }
    if (account.hasError) {
      return AlertBanner(
        tone: Tone.warning,
        title: "Couldn't load the sending number",
        message: '${account.error}',
        actionLabel: 'Try again',
        onAction: onRetry,
      );
    }
    return const AlertBanner(tone: Tone.info, title: 'Loading account…');
  }
}
