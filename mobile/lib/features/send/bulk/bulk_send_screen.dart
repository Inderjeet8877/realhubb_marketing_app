import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api_client.dart';
import '../../../core/format.dart';
import '../../../theme/app_theme.dart';
import '../../../theme/tokens.dart';
import '../../../widgets/ui.dart';
import 'bulk_data.dart';
import 'bulk_progress.dart';

const _allContacts = '\u0000all';

/// Bulk send as 3 steps: Message → Audience → Review, then live progress
/// (web: Bulk Send modal in app/dashboard/whatsapp/page.tsx).
class BulkSendScreen extends ConsumerStatefulWidget {
  const BulkSendScreen({super.key});

  @override
  ConsumerState<BulkSendScreen> createState() => _BulkSendScreenState();
}

class _BulkSendScreenState extends ConsumerState<BulkSendScreen> {
  int _step = 0;
  bool _isTemplate = true;
  WaTemplate? _template;
  final _media = TextEditingController();
  final _text = TextEditingController();
  final _from = TextEditingController();
  final _to = TextEditingController();

  String? _batch; // batch name, _allContacts, or null (nothing chosen yet)
  List<BulkContact>? _contacts;
  Object? _contactsError;
  bool _loadingContacts = false;
  final Set<String> _selected = {};
  (int, int)? _range;
  String _query = '';

  bool _sending = false;
  StartResult? _started;

  @override
  void dispose() {
    for (final c in [_media, _text, _from, _to]) {
      c.dispose();
    }
    super.dispose();
  }

  String? get _messageProblem => _isTemplate
      ? (_template == null ? 'Pick a template to continue' : null)
      : (_text.text.trim().isEmpty ? 'Type a message to continue' : null);
  String? get _audienceProblem => _selected.isEmpty ? 'Select at least one contact' : null;
  String? get _sendProblem =>
      _messageProblem ?? _audienceProblem ?? (_isTemplate ? mediaProblem(_template, _media.text) : null);

  List<BulkContact> get _chosen => [
    for (final c in _contacts ?? const <BulkContact>[])
      if (_selected.contains(c.phone)) c,
  ];

  String get _batchLabel => _batch == null || _batch == _allContacts ? 'Manual Selection' : _batch!;

  Future<void> _pickBatch(String? batch) async {
    setState(() {
      _batch = batch;
      _contacts = null;
      _contactsError = null;
      _loadingContacts = batch != null;
      _selected.clear();
      _range = null;
      _from.clear();
      _to.clear();
    });
    if (batch == null) return;
    try {
      final list = await fetchBulkContacts(ref.read(apiClientProvider), batch == _allContacts ? null : batch);
      if (!mounted || _batch != batch) return;
      setState(() {
        _contacts = list;
        // A batch preselects everyone in it; "all contacts" is manual picking.
        if (batch != _allContacts) _selected.addAll(list.map((c) => c.phone));
      });
    } catch (e) {
      if (mounted && _batch == batch) setState(() => _contactsError = e);
    } finally {
      if (mounted && _batch == batch) setState(() => _loadingContacts = false);
    }
  }

  void _applyRange((int, int)? r) {
    final all = _contacts ?? const <BulkContact>[];
    setState(() {
      _range = r;
      _selected
        ..clear()
        ..addAll((r == null ? all : sliceRange(all, r.$1, r.$2)).map((c) => c.phone));
      _from.text = r == null ? '' : '${r.$1}';
      _to.text = r == null ? '' : '${r.$2}';
    });
  }

  Future<void> _send() async {
    setState(() => _sending = true);
    try {
      final res = await startBroadcast(
        ref.read(apiClientProvider),
        contacts: _chosen,
        batchName: _batchLabel,
        template: _isTemplate ? _template : null,
        message: _isTemplate ? '' : _text.text.trim(),
        mediaUrl: _media.text,
      );
      HapticFeedback.mediumImpact();
      if (mounted) setState(() => _started = res);
    } catch (e) {
      if (mounted) showSnack(context, '$e', tone: Tone.danger);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _reset() => setState(() {
    _started = null;
    _step = 0;
    _template = null;
    _media.clear();
    _text.clear();
    _batch = null;
    _contacts = null;
    _selected.clear();
    _range = null;
  });

  @override
  Widget build(BuildContext context) {
    if (_started != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Broadcast progress')),
        body: _Width(
          child: BulkProgressView(
            broadcastId: _started!.broadcastId,
            total: _started!.total,
            optedOut: _started!.optedOut,
            onNew: _reset,
          ),
        ),
      );
    }
    final problem = switch (_step) {
      0 => _messageProblem,
      1 => _audienceProblem,
      _ => _sendProblem,
    };
    return PopScope(
      canPop: _step == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) setState(() => _step--);
      },
      child: Scaffold(
        appBar: AppBar(title: const Text('Bulk send')),
        body: Column(
          children: [
            _StepHeader(
              step: _step,
              onTap: (i) {
                if (i < _step ||
                    (i == 1 && _messageProblem == null) ||
                    (i == 2 && _messageProblem == null && _audienceProblem == null)) {
                  setState(() => _step = i);
                }
              },
            ),
            const Divider(),
            Expanded(
              child: switch (_step) {
                0 => _messageStep(),
                1 => _audienceStep(),
                _ => _reviewStep(),
              },
            ),
          ],
        ),
        bottomNavigationBar: _BottomBar(
          problem: problem,
          onBack: _step == 0 ? null : () => setState(() => _step--),
          primaryLabel: _step < 2 ? 'Next' : 'Send to ${number(_selected.length)} contacts',
          busy: _sending,
          onPrimary: problem != null || _sending ? null : (_step < 2 ? () => setState(() => _step++) : _send),
        ),
      ),
    );
  }

  // ── Step 1: Message ────────────────────────────────────────────────────────

  Widget _messageStep() {
    final c = context.colors;
    final templates = ref.watch(bulkTemplatesProvider);
    return _Width(
      child: ListView(
        padding: const EdgeInsets.all(Space.s4),
        children: [
          SegmentedButton<bool>(
            segments: const [
              ButtonSegment(value: true, label: Text('Template'), icon: Icon(LucideIcons.fileText)),
              ButtonSegment(value: false, label: Text('Text'), icon: Icon(LucideIcons.messageSquare)),
            ],
            selected: {_isTemplate},
            onSelectionChanged: (s) => setState(() => _isTemplate = s.first),
          ),
          const SizedBox(height: Space.s4),
          if (!_isTemplate) ...[
            TextField(
              controller: _text,
              minLines: 4,
              maxLines: 10,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(labelText: 'Message', alignLabelWithHint: true),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: Space.s2),
            Text(
              'Free text is only delivered to contacts who messaged you in the last 24 hours. Use a template otherwise.',
              style: AppText.caption.copyWith(color: c.textSecondary),
            ),
          ] else
            templates.when(
              skipLoadingOnRefresh: true,
              loading: () => const LinearProgressIndicator(),
              error: (e, _) => AlertBanner(
                tone: Tone.danger,
                title: "Couldn't load templates",
                message: '$e',
                actionLabel: 'Try again',
                onAction: () => ref.invalidate(bulkTemplatesProvider),
              ),
              data: (list) {
                if (list.isEmpty) {
                  return AlertBanner(
                    tone: Tone.warning,
                    title: 'No approved templates',
                    message: 'Create one on the Templates page, or sync from Meta there.',
                    actionLabel: 'Reload',
                    onAction: () => ref.invalidate(bulkTemplatesProvider),
                  );
                }
                final sel = list.where((t) => t.name == _template?.name).firstOrNull;
                final problem = mediaProblem(sel, _media.text);
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    DropdownButtonFormField<String>(
                      initialValue: sel?.name,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Template'),
                      hint: const Text('Select a template'),
                      items: [
                        for (final t in list)
                          DropdownMenuItem(
                            value: t.name,
                            child: Row(
                              children: [
                                Icon(_headerIcon(t.headerType), size: 16, color: c.textSecondary),
                                const SizedBox(width: Space.s2),
                                Expanded(child: Text(t.name, overflow: TextOverflow.ellipsis)),
                              ],
                            ),
                          ),
                      ],
                      onChanged: (name) => setState(() {
                        _template = list.firstWhere((t) => t.name == name);
                        _media.text = _template!.headerContent;
                      }),
                    ),
                    if (sel != null) ...[
                      if (sel.needsMedia) ...[
                        const SizedBox(height: Space.s3),
                        TextField(
                          controller: _media,
                          keyboardType: TextInputType.url,
                          decoration: InputDecoration(
                            labelText: 'Header ${sel.headerType} URL (required)',
                            helperText: 'Public https link. Meta rejects every send without it.',
                            errorText: problem,
                            errorMaxLines: 3,
                          ),
                          onChanged: (_) => setState(() {}),
                        ),
                      ],
                      const SizedBox(height: Space.s4),
                      Text('Preview', style: AppText.overline.copyWith(color: c.textTertiary)),
                      const SizedBox(height: Space.s2),
                      _TemplatePreview(sel, _media.text),
                    ],
                  ],
                );
              },
            ),
        ],
      ),
    );
  }

  // ── Step 2: Audience ──────────────────────────────────────────────────────

  Widget _audienceStep() {
    final c = context.colors;
    final batches = ref.watch(bulkBatchesProvider);
    final all = _contacts ?? const <BulkContact>[];
    final q = _query.trim().toLowerCase();
    final shown = q.isEmpty ? all : all.where((x) => x.name.toLowerCase().contains(q) || x.phone.contains(q)).toList();
    final chunks = rangeChunks(all.length);
    final rangeKey = _range == null ? 'all' : '${_range!.$1}-${_range!.$2}';

    final controls = <Widget>[
      batches.when(
        skipLoadingOnRefresh: true,
        loading: () => const LinearProgressIndicator(),
        error: (e, _) => AlertBanner(
          tone: Tone.danger,
          title: "Couldn't load batches",
          message: '$e',
          actionLabel: 'Try again',
          onAction: () => ref.invalidate(bulkBatchesProvider),
        ),
        data: (list) => DropdownButtonFormField<String>(
          initialValue: _batch,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Send to batch'),
          hint: const Text('Select a batch'),
          items: [
            for (final b in list)
              DropdownMenuItem(
                value: b.name,
                child: Text('${b.name} (${number(b.count)} contacts)', overflow: TextOverflow.ellipsis),
              ),
            const DropdownMenuItem(value: _allContacts, child: Text('All contacts (choose manually)')),
          ],
          onChanged: _pickBatch,
        ),
      ),
      if (all.isNotEmpty) ...[
        const SizedBox(height: Space.s3),
        DropdownButtonFormField<String>(
          key: ValueKey('range-$rangeKey-${all.length}'),
          initialValue: rangeKey,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Send range'),
          items: [
            DropdownMenuItem(value: 'all', child: Text('All (${number(all.length)} contacts)')),
            for (final (f, t) in chunks)
              DropdownMenuItem(value: '$f-$t', child: Text('$f – $t (${t - f + 1} contacts)')),
            if (_range != null && !chunks.contains(_range))
              DropdownMenuItem(value: rangeKey, child: Text('Custom ${_range!.$1} – ${_range!.$2}')),
          ],
          onChanged: (v) {
            if (v == null) return;
            final parts = v.split('-').map(int.tryParse).toList();
            _applyRange(v == 'all' ? null : (parts[0]!, parts[1]!));
          },
        ),
        const SizedBox(height: Space.s3),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _from,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'From', hintText: '1'),
              ),
            ),
            const SizedBox(width: Space.s2),
            Expanded(
              child: TextField(
                controller: _to,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(labelText: 'To', hintText: '${all.length}'),
              ),
            ),
            const SizedBox(width: Space.s2),
            OutlinedButton(
              onPressed: () {
                FocusScope.of(context).unfocus();
                final r = clampRange(all.length, int.tryParse(_from.text), int.tryParse(_to.text));
                _applyRange(r == (1, all.length) ? null : r);
              },
              child: const Text('Apply'),
            ),
          ],
        ),
        const SizedBox(height: Space.s3),
        TextField(
          decoration: const InputDecoration(
            labelText: 'Search contacts',
            prefixIcon: Icon(LucideIcons.search, size: 18),
          ),
          onChanged: (v) => setState(() => _query = v),
        ),
        const SizedBox(height: Space.s2),
        Row(
          children: [
            Expanded(
              child: Text('${number(_selected.length)} selected', style: AppText.label.copyWith(color: c.textPrimary)),
            ),
            TextButton(
              onPressed: () => setState(() => _selected.addAll(shown.map((x) => x.phone))),
              child: const Text('Select all'),
            ),
            TextButton(
              onPressed: () => setState(() => _selected.removeAll(shown.map((x) => x.phone))),
              child: const Text('None'),
            ),
          ],
        ),
      ],
    ];

    Widget? state;
    if (_batch == null) {
      state = const EmptyState(
        icon: LucideIcons.users,
        title: 'Choose who receives this',
        message: 'Pick a contact batch above, or all contacts to select people manually.',
      );
    } else if (_loadingContacts) {
      state = const LoadingList(count: 5, itemHeight: 56);
    } else if (_contactsError != null) {
      state = ErrorView(message: '$_contactsError', onRetry: () => _pickBatch(_batch));
    } else if (all.isEmpty) {
      state = const EmptyState(icon: LucideIcons.userX, title: 'No contacts in this batch');
    } else if (shown.isEmpty) {
      state = EmptyState(icon: LucideIcons.search, title: 'No contacts match "$_query"');
    }

    final pad = _hPad(context);
    return CustomScrollView(
      slivers: [
        SliverPadding(
          padding: EdgeInsets.fromLTRB(pad, Space.s4, pad, Space.s2),
          sliver: SliverList.list(children: controls),
        ),
        if (state != null)
          SliverToBoxAdapter(child: SizedBox(height: 320, child: state))
        else
          SliverPadding(
            padding: EdgeInsets.fromLTRB(pad - Space.s4, 0, pad - Space.s4, Space.s4),
            sliver: SliverList.builder(
              itemCount: shown.length,
              itemBuilder: (_, i) {
                final x = shown[i];
                return CheckboxListTile(
                  value: _selected.contains(x.phone),
                  onChanged: (v) => setState(() => v == true ? _selected.add(x.phone) : _selected.remove(x.phone)),
                  controlAffinity: ListTileControlAffinity.leading,
                  title: Text(x.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                  subtitle: Text(
                    [
                      displayPhone(x.phone),
                      if (_batch == _allContacts && x.dataName.isNotEmpty) x.dataName,
                    ].join(' · '),
                  ),
                );
              },
            ),
          ),
      ],
    );
  }

  // ── Step 3: Review ────────────────────────────────────────────────────────

  Widget _reviewStep() {
    final c = context.colors;
    final media = _isTemplate ? mediaProblem(_template, _media.text) : null;
    Widget row(String label, String value) => Padding(
      padding: const EdgeInsets.symmetric(vertical: Space.s2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(label, style: AppText.body.copyWith(color: c.textSecondary)),
          ),
          Expanded(
            child: Text(value, style: AppText.label.copyWith(color: c.textPrimary)),
          ),
        ],
      ),
    );
    return _Width(
      child: ListView(
        padding: const EdgeInsets.all(Space.s4),
        children: [
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Summary', style: AppText.h3.copyWith(color: c.textPrimary)),
                const SizedBox(height: Space.s2),
                row('Message', _isTemplate ? 'Template' : 'Custom text'),
                if (_isTemplate && _template != null) row('Template', _template!.name),
                if (!_isTemplate) row('Text', _text.text.trim()),
                row('Batch', _batchLabel),
                row('Range', _range == null ? 'All' : '${_range!.$1} – ${_range!.$2}'),
                row('Audience', '${number(_selected.length)} contacts'),
              ],
            ),
          ),
          const SizedBox(height: Space.s3),
          const AlertBanner(
            tone: Tone.info,
            title: 'Opted-out contacts are skipped',
            message: "Anyone who replied STOP won't be messaged. You'll see how many were skipped once it starts.",
          ),
          if (media != null) ...[
            const SizedBox(height: Space.s3),
            AlertBanner(
              tone: Tone.danger,
              title: 'Template media missing',
              message: media,
              actionLabel: 'Fix in step 1',
              onAction: () => setState(() => _step = 0),
            ),
          ],
          if (_isTemplate && _template != null) ...[
            const SizedBox(height: Space.s4),
            _TemplatePreview(_template!, _media.text),
          ],
        ],
      ),
    );
  }
}

IconData _headerIcon(String type) => switch (type) {
  'image' => LucideIcons.image,
  'video' => LucideIcons.video,
  'document' => LucideIcons.file,
  _ => LucideIcons.fileText,
};

double _hPad(BuildContext context) => math.max(Space.s4, (MediaQuery.sizeOf(context).width - 720) / 2);

/// Caps content width on tablets.
class _Width extends StatelessWidget {
  const _Width({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Center(
    child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 720), child: child),
  );
}

class _StepHeader extends StatelessWidget {
  const _StepHeader({required this.step, required this.onTap});
  final int step;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    const labels = ['Message', 'Audience', 'Review'];
    return Container(
      color: c.surface,
      padding: const EdgeInsets.symmetric(horizontal: Space.s2),
      child: Row(
        children: [
          for (var i = 0; i < 3; i++)
            Expanded(
              child: Semantics(
                selected: i == step,
                button: true,
                label: 'Step ${i + 1} of 3, ${labels[i]}${i < step ? ', done' : ''}',
                excludeSemantics: true,
                child: InkWell(
                  onTap: () => onTap(i),
                  child: SizedBox(
                    height: 56,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 24,
                          height: 24,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: i <= step ? c.brand : c.surfaceHover,
                          ),
                          child: i < step
                              ? Icon(LucideIcons.check, size: 14, color: c.onBrand)
                              : Text(
                                  '${i + 1}',
                                  style: AppText.caption.copyWith(color: i == step ? c.onBrand : c.textSecondary),
                                ),
                        ),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(
                            labels[i],
                            overflow: TextOverflow.ellipsis,
                            style: AppText.label.copyWith(color: i == step ? c.textPrimary : c.textSecondary),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _BottomBar extends StatelessWidget {
  const _BottomBar({
    required this.problem,
    required this.onBack,
    required this.primaryLabel,
    required this.onPrimary,
    required this.busy,
  });
  final String? problem;
  final VoidCallback? onBack, onPrimary;
  final String primaryLabel;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Material(
      color: c.surface,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Space.s4, Space.s2, Space.s4, Space.s3),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (problem != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: Space.s2),
                  child: Row(
                    children: [
                      Icon(LucideIcons.info, size: 14, color: c.textSecondary),
                      const SizedBox(width: Space.s1),
                      Expanded(
                        child: Text(problem!, style: AppText.caption.copyWith(color: c.textSecondary)),
                      ),
                    ],
                  ),
                ),
              Row(
                children: [
                  if (onBack != null) ...[
                    OutlinedButton.icon(
                      onPressed: onBack,
                      icon: const Icon(LucideIcons.arrowLeft, size: 16),
                      label: const Text('Back'),
                    ),
                    const SizedBox(width: Space.s3),
                  ],
                  Expanded(
                    child: FilledButton(
                      onPressed: onPrimary,
                      child: busy
                          ? SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2, color: c.onBrand),
                            )
                          : Text(primaryLabel, overflow: TextOverflow.ellipsis),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Compact WhatsApp-style preview of a template message.
class _TemplatePreview extends StatelessWidget {
  const _TemplatePreview(this.t, this.mediaUrl);
  final WaTemplate t;
  final String mediaUrl;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final url = mediaUrl.trim();
    final placeholder = Container(
      height: 120,
      color: c.surfaceHover,
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(_headerIcon(t.headerType), color: c.textTertiary),
          Text(
            url.isEmpty
                ? 'No ${t.headerType} attached'
                : '${t.headerType[0].toUpperCase()}${t.headerType.substring(1)} header',
            style: AppText.caption.copyWith(color: c.textTertiary),
          ),
        ],
      ),
    );
    return Container(
      padding: const EdgeInsets.all(Space.s3),
      decoration: BoxDecoration(color: c.chatBg, borderRadius: BorderRadius.circular(Radii.lg)),
      alignment: Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 300),
        child: Container(
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(color: c.bubbleIn, borderRadius: BorderRadius.circular(Radii.md)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (t.needsMedia)
                t.headerType == 'image' && mediaProblem(t, url) == null
                    ? Image.network(
                        url,
                        height: 140,
                        fit: BoxFit.cover,
                        semanticLabel: 'Template header image',
                        errorBuilder: (_, _, _) => placeholder,
                      )
                    : placeholder,
              Padding(
                padding: const EdgeInsets.all(Space.s3),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (t.headerType == 'text' && t.headerContent.isNotEmpty)
                      Text(t.headerContent, style: AppText.label.copyWith(color: c.textPrimary)),
                    Text(
                      t.content.isEmpty ? '(no body text)' : t.content,
                      style: AppText.body.copyWith(color: c.textPrimary),
                      maxLines: 12,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (t.footerContent.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: Space.s1),
                        child: Text(t.footerContent, style: AppText.caption.copyWith(color: c.textTertiary)),
                      ),
                  ],
                ),
              ),
              for (final b in t.buttons) ...[
                const Divider(),
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: Space.s2),
                  child: Text(
                    b,
                    textAlign: TextAlign.center,
                    style: AppText.label.copyWith(color: c.brandText),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
