import 'dart:convert';

import 'package:csv/csv.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/format.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import 'broadcast_data.dart';

/// Full history for reports (web passes limit=5000 so older broadcasts are never dropped).
final _allBroadcastsProvider = FutureProvider.autoDispose((ref) => ref.watch(broadcastsApiProvider).list(limit: 5000));

/// Report builder. The web exports a PDF (jsPDF); the app has no PDF package,
/// so this exports the same sections as a CSV through the share sheet.
class ReportScreen extends ConsumerStatefulWidget {
  const ReportScreen({super.key});

  @override
  ConsumerState<ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends ConsumerState<ReportScreen> {
  ReportScope _scope = ReportScope.all;
  final Set<String> _keys = {};
  bool _engagement = true;
  bool _busy = false;
  String _search = '';
  (Tone, String)? _notice;

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(_allBroadcastsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Generate report'),
        actions: [
          IconButton(
            tooltip: 'Refresh broadcast history',
            icon: const Icon(LucideIcons.refreshCw),
            onPressed: () => ref.invalidate(_allBroadcastsProvider),
          ),
        ],
      ),
      body: AsyncBody(
        value: value,
        onRetry: () => ref.invalidate(_allBroadcastsProvider),
        data: (all) => all.isEmpty
            ? EmptyState(
                icon: LucideIcons.chartColumn,
                title: 'No broadcast history yet',
                message: 'Reports become available after your first bulk send.',
                actionLabel: 'Back',
                onAction: () => Navigator.pop(context),
              )
            : _builder(all),
      ),
    );
  }

  Widget _builder(List<Broadcast> all) {
    final c = context.colors;
    final counts = templateCounts(all);
    final q = _search.trim().toLowerCase();
    final shown = q.isEmpty ? counts : counts.where((t) => templateLabel(t.$1).toLowerCase().contains(q)).toList();
    final rows = rowsInScope(all, _scope, _keys);
    final contacts = rows.fold(0, (s, r) => s + r.total);
    final canGenerate = !_busy && (_scope == ReportScope.all || _keys.isNotEmpty);

    return ListView(
      padding: const EdgeInsets.all(Space.s4),
      children: [
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('1. Choose scope', style: AppText.overline.copyWith(color: c.textTertiary)),
                const SizedBox(height: Space.s2),
                SegmentedButton<ReportScope>(
                  segments: const [
                    ButtonSegment(value: ReportScope.all, label: Text('All'), icon: Icon(LucideIcons.layoutGrid)),
                    ButtonSegment(value: ReportScope.single, label: Text('Single'), icon: Icon(LucideIcons.fileText)),
                    ButtonSegment(value: ReportScope.multiple, label: Text('Multiple'), icon: Icon(LucideIcons.layers)),
                  ],
                  selected: {_scope},
                  onSelectionChanged: (s) => setState(() {
                    _scope = s.first;
                    _keys.clear();
                    _search = '';
                    _notice = null;
                  }),
                ),
                const SizedBox(height: Space.s1),
                Text(switch (_scope) {
                  ReportScope.all => "Everything you've ever sent.",
                  ReportScope.single => 'Deep-dive on one template.',
                  ReportScope.multiple => 'Compare a few templates side by side.',
                }, style: AppText.caption.copyWith(color: c.textSecondary)),
                if (_scope != ReportScope.all) ...[
                  const SizedBox(height: Space.s5),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          _scope == ReportScope.single ? '2. Pick a template' : '2. Pick templates',
                          style: AppText.overline.copyWith(color: c.textTertiary),
                        ),
                      ),
                      if (_scope == ReportScope.multiple && counts.length > 1) ...[
                        TextButton(
                          onPressed: () => setState(() => _keys.addAll(counts.map((t) => t.$1))),
                          child: const Text('Select all'),
                        ),
                        TextButton(onPressed: () => setState(_keys.clear), child: const Text('Clear')),
                      ],
                    ],
                  ),
                  if (counts.length > 6) ...[
                    TextField(
                      decoration: const InputDecoration(
                        labelText: 'Search templates',
                        prefixIcon: Icon(LucideIcons.search, size: 18),
                      ),
                      onChanged: (v) => setState(() => _search = v),
                    ),
                    const SizedBox(height: Space.s2),
                  ],
                  AppCard(
                    padding: EdgeInsets.zero,
                    child: shown.isEmpty
                        ? Padding(
                            padding: const EdgeInsets.all(Space.s4),
                            child: Text(
                              'No templates match "$_search".',
                              style: AppText.body.copyWith(color: c.textSecondary),
                            ),
                          )
                        : Column(
                            children: [
                              for (final (key, n) in shown)
                                CheckboxListTile(
                                  value: _keys.contains(key),
                                  onChanged: (_) => setState(() {
                                    _notice = null;
                                    final on = _keys.contains(key);
                                    if (_scope == ReportScope.single) _keys.clear();
                                    on ? _keys.remove(key) : _keys.add(key);
                                  }),
                                  controlAffinity: ListTileControlAffinity.leading,
                                  title: Text(templateLabel(key), maxLines: 1, overflow: TextOverflow.ellipsis),
                                  secondary: StatusBadge('$n broadcast${n == 1 ? '' : 's'}'),
                                ),
                            ],
                          ),
                  ),
                ],
                const SizedBox(height: Space.s5),
                if (rows.isNotEmpty) ...[
                  AlertBanner(
                    tone: Tone.info,
                    title: '${number(rows.length)} broadcast${rows.length == 1 ? '' : 's'} included',
                    message: 'Covering ${number(contacts)} contacts.',
                  ),
                  const SizedBox(height: Space.s3),
                ],
                AppCard(
                  padding: EdgeInsets.zero,
                  child: CheckboxListTile(
                    value: _engagement,
                    onChanged: (v) => setState(() => _engagement = v ?? false),
                    controlAffinity: ListTileControlAffinity.leading,
                    title: const Text('Include recipient engagement and replies'),
                    subtitle: const Text(
                      "Lists who replied, who didn't, and who opted out. Takes a few extra seconds to look up.",
                    ),
                  ),
                ),
                if (_notice != null) ...[
                  const SizedBox(height: Space.s3),
                  AlertBanner(tone: _notice!.$1, title: _notice!.$2),
                ],
                const SizedBox(height: Space.s4),
                FilledButton.icon(
                  onPressed: canGenerate ? () => _generate(all) : null,
                  icon: _busy
                      ? SizedBox.square(
                          dimension: 16,
                          child: CircularProgressIndicator(strokeWidth: 2, color: c.onBrand),
                        )
                      : const Icon(LucideIcons.fileDown, size: 18),
                  label: Text(_busy ? 'Generating…' : 'Export report (CSV)'),
                ),
                if (!canGenerate && !_busy)
                  Padding(
                    padding: const EdgeInsets.only(top: Space.s2),
                    child: Text(
                      'Pick a template above to continue.',
                      style: AppText.caption.copyWith(color: c.textSecondary),
                      textAlign: TextAlign.center,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _generate(List<Broadcast> all) async {
    final rows = rowsInScope(all, _scope, _keys);
    if (rows.isEmpty) {
      setState(() => _notice = (Tone.danger, 'No broadcasts match the selected template(s).'));
      return;
    }
    final scopeLabel = _scope == ReportScope.all
        ? 'Scope: All Templates'
        : 'Scope: ${_keys.map(templateLabel).join(', ')}';
    setState(() {
      _busy = true;
      _notice = null;
    });
    Engagement? eng;
    var engFailed = false;
    if (_engagement) {
      try {
        eng = await ref.read(broadcastsApiProvider).engagement(rows.map((r) => r.id).toList());
      } catch (_) {
        engFailed = true; // never block the stats the user already waited for
      }
    }
    try {
      final csvText = Csv(addBom: true).encode(buildReportRows(rows, scopeLabel, eng));
      final name = 'whatsapp-broadcast-report-${DateFormat('yyyy-MM-dd').format(DateTime.now())}.csv';
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile.fromData(utf8.encode(csvText), mimeType: 'text/csv', name: name)],
          fileNameOverrides: [name],
          subject: 'WhatsApp broadcast report',
        ),
      );
      final ready = 'Report ready — ${rows.length} broadcast${rows.length == 1 ? '' : 's'} included.';
      _setNotice(
        engFailed ? Tone.warning : Tone.success,
        engFailed ? "$ready Couldn't load reply data this time, so that section was left out." : ready,
      );
    } catch (e) {
      _setNotice(Tone.danger, 'Failed to generate report: $e');
    }
  }

  void _setNotice(Tone tone, String text) {
    if (mounted) {
      setState(() {
        _busy = false;
        _notice = (tone, text);
      });
    }
  }
}
