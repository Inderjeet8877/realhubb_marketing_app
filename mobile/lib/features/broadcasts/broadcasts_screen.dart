import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/format.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import '../send/bulk/bulk_send_screen.dart';
import 'broadcast_actions.dart';
import 'broadcast_data.dart';
import 'report_screen.dart';

/// Broadcast reports (web: components/whatsapp/BulkReports.tsx).
class BroadcastsScreen extends ConsumerStatefulWidget {
  const BroadcastsScreen({super.key});

  @override
  ConsumerState<BroadcastsScreen> createState() => _BroadcastsScreenState();
}

class _BroadcastsScreenState extends ConsumerState<BroadcastsScreen> {
  Timer? _poll;
  DateTime _lastNudge = DateTime.now();
  String? _expanded;

  @override
  void initState() {
    super.initState();
    _poll = Timer.periodic(const Duration(seconds: 5), (_) => _tick());
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  /// Live refresh while anything is sending, plus the web's 10-minute silent
  /// auto-resume safety net (harmless on a healthy job).
  void _tick() {
    final running = (ref.read(broadcastsProvider).value ?? const []).where((b) => b.isProcessing).toList();
    if (running.isEmpty) return;
    ref.invalidate(broadcastsProvider);
    if (running.any((b) => b.id == _expanded)) ref.invalidate(broadcastContactsProvider(_expanded!));
    if (DateTime.now().difference(_lastNudge) >= const Duration(minutes: 10)) {
      _lastNudge = DateTime.now();
      final api = ref.read(broadcastsApiProvider);
      for (final b in running) {
        api.resume(b.id).ignore();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(broadcastsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Broadcasts'),
        actions: [
          IconButton(
            tooltip: 'Generate report',
            icon: const Icon(LucideIcons.fileDown),
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ReportScreen())),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _newBroadcast,
        icon: const Icon(LucideIcons.send),
        label: const Text('Bulk send'),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(broadcastsProvider.future),
        child: AsyncBody(
          value: value,
          onRetry: () => ref.invalidate(broadcastsProvider),
          loading: const LoadingList(itemHeight: 180, count: 4),
          data: (list) => list.isEmpty
              ? ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: [
                    EmptyState(
                      icon: LucideIcons.chartColumn,
                      title: 'No broadcasts yet',
                      message: 'Send a bulk message to see delivery and read reports here.',
                      actionLabel: 'Start a bulk send',
                      onAction: _newBroadcast,
                    ),
                  ],
                )
              : ListView.separated(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(Space.s4, Space.s4, Space.s4, 96),
                  itemCount: list.length + 1,
                  separatorBuilder: (_, _) => const SizedBox(height: Space.s3),
                  itemBuilder: (_, i) => _Constrained(
                    child: i == 0
                        ? Text(
                            '${list.length} broadcast${list.length == 1 ? '' : 's'}',
                            style: AppText.body.copyWith(color: context.colors.textSecondary),
                          )
                        : BroadcastCard(
                            broadcast: list[i - 1],
                            expanded: _expanded == list[i - 1].id,
                            onToggle: () =>
                                setState(() => _expanded = _expanded == list[i - 1].id ? null : list[i - 1].id),
                          ),
                  ),
                ),
        ),
      ),
    );
  }

  Future<void> _newBroadcast() async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const BulkSendScreen()));
    if (mounted) ref.invalidate(broadcastsProvider);
  }
}

class _Constrained extends StatelessWidget {
  const _Constrained({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Center(
    child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 840), child: child),
  );
}

/// Status pill; "Sending" gets a spinner (DESIGN_PLAN §5.4).
class BroadcastStatusBadge extends StatelessWidget {
  const BroadcastStatusBadge(this.status, {super.key});
  final String status;

  @override
  Widget build(BuildContext context) {
    final (label, tone) = broadcastStatus(status);
    if (status != 'processing') {
      final icon = switch (status) {
        'completed' => LucideIcons.circleCheck,
        'cancelled' => LucideIcons.octagonX,
        'failed' => LucideIcons.circleX,
        _ => null,
      };
      return StatusBadge(label, tone: tone, icon: icon);
    }
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: tone.bg(c), borderRadius: BorderRadius.circular(Radii.full)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox.square(dimension: 11, child: CircularProgressIndicator(strokeWidth: 1.6, color: tone.fg(c))),
          const SizedBox(width: 5),
          Text(label, style: AppText.caption.copyWith(color: tone.fg(c))),
        ],
      ),
    );
  }
}

class BroadcastCard extends ConsumerStatefulWidget {
  const BroadcastCard({super.key, required this.broadcast, required this.expanded, required this.onToggle});
  final Broadcast broadcast;
  final bool expanded;
  final VoidCallback onToggle;

  @override
  ConsumerState<BroadcastCard> createState() => _BroadcastCardState();
}

class _BroadcastCardState extends ConsumerState<BroadcastCard> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    await action();
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final b = widget.broadcast;
    final c = context.colors;
    final tone = broadcastStatus(b.status).$2;
    final meta = [
      b.templateName == null ? 'Custom text' : 'Template: ${b.templateName}',
      if (b.createdAt != null) dateTime(b.createdAt),
      if (b.duration != null) 'Took ${formatDuration(b.duration)}',
    ].join(' · ');

    return AppCard(
      padding: EdgeInsets.zero,
      child: Container(
        decoration: BoxDecoration(
          border: Border(left: BorderSide(color: b.status == 'completed' ? c.border : tone.fg(c), width: 4)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.all(Space.s4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          b.batchName,
                          style: AppText.h3.copyWith(color: c.textPrimary),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: Space.s2),
                      BroadcastStatusBadge(b.status),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(meta, style: AppText.caption.copyWith(color: c.textSecondary)),
                  if (b.status == 'cancelled' && b.cancelReason != null) ...[
                    const SizedBox(height: Space.s1),
                    Text('Cancelled: ${b.cancelReason}', style: AppText.caption.copyWith(color: c.warningFg)),
                  ],
                  const SizedBox(height: Space.s3),
                  _StatTiles(b),
                  if (b.isProcessing) ...[
                    const SizedBox(height: Space.s3),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(Radii.full),
                      child: LinearProgressIndicator(value: b.progress, minHeight: 6),
                    ),
                    const SizedBox(height: Space.s1),
                    Text(
                      '${number(b.processed)} / ${number(b.total)} processed',
                      style: AppText.caption.copyWith(color: c.textSecondary),
                    ),
                  ],
                  const SizedBox(height: Space.s2),
                  Wrap(
                    spacing: Space.s2,
                    runSpacing: Space.s2,
                    children: [
                      if (b.isProcessing) ...[
                        OutlinedButton.icon(
                          onPressed: _busy ? null : () => _run(() => resumeBroadcast(context, ref, b.id)),
                          icon: const Icon(LucideIcons.play, size: 16),
                          label: const Text('Resume'),
                        ),
                        OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(
                            foregroundColor: c.dangerFg,
                            side: BorderSide(color: c.dangerFg),
                          ),
                          onPressed: _busy
                              ? null
                              : () => _run(() async {
                                  if (await cancelBroadcast(context, ref, b.id)) ref.invalidate(broadcastsProvider);
                                }),
                          icon: const Icon(LucideIcons.octagonX, size: 16),
                          label: const Text('Cancel'),
                        ),
                      ],
                      TextButton.icon(
                        onPressed: widget.onToggle,
                        icon: Icon(widget.expanded ? LucideIcons.chevronUp : LucideIcons.chevronDown, size: 16),
                        label: Text(widget.expanded ? 'Hide details' : 'Details'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            if (widget.expanded) ...[const Divider(), _Recipients(b)],
          ],
        ),
      ),
    );
  }
}

class _StatTiles extends StatelessWidget {
  const _StatTiles(this.b);
  final Broadcast b;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    // Funnel order; each tile shows the count and its share of the total.
    final tiles = [
      ('Total', b.total, c.textPrimary),
      ('Sent', b.sent, c.successFg),
      ('Delivered', b.delivered, c.infoFg),
      ('Read', b.read, c.brandText),
      ('Failed', b.failed, c.dangerFg),
    ];
    String share(int v) => b.total == 0 ? '' : '${(v * 100 / b.total).round()}%';
    return LayoutBuilder(
      builder: (context, box) {
        final cols = box.maxWidth < 400 ? 3 : 5;
        final w = (box.maxWidth - Space.s2 * (cols - 1)) / cols;
        return Wrap(
          spacing: Space.s2,
          runSpacing: Space.s2,
          children: [
            for (final (label, v, color) in tiles)
              Container(
                width: w,
                padding: const EdgeInsets.symmetric(vertical: Space.s2, horizontal: Space.s1),
                decoration: BoxDecoration(color: c.surfaceSubtle, borderRadius: BorderRadius.circular(Radii.md)),
                child: Column(
                  children: [
                    FittedBox(
                      child: Text(
                        number(v),
                        style: AppText.h3.copyWith(
                          color: color,
                          fontFamily: monoFamily,
                          fontWeight: FontWeight.w500,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ),
                    Text(label, style: AppText.caption.copyWith(color: c.textSecondary)),
                    if (label != 'Total' && b.total > 0)
                      Text(share(v), style: AppText.caption.copyWith(color: c.textTertiary, fontFamily: monoFamily)),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

/// Expanded per-contact list; failed rows open the failure dialog.
class _Recipients extends ConsumerWidget {
  const _Recipients(this.b);
  final Broadcast b;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final value = b.contacts.isNotEmpty ? AsyncData(b.contacts) : ref.watch(broadcastContactsProvider(b.id));
    return value.when(
      skipLoadingOnRefresh: true,
      loading: () => const Padding(padding: EdgeInsets.all(Space.s4), child: LinearProgressIndicator()),
      error: (e, _) => Padding(
        padding: const EdgeInsets.all(Space.s4),
        child: AlertBanner(
          tone: Tone.danger,
          title: "Couldn't load recipients",
          message: '$e',
          actionLabel: 'Try again',
          onAction: () => ref.invalidate(broadcastContactsProvider(b.id)),
        ),
      ),
      data: (list) {
        if (list.isEmpty) {
          return Padding(
            padding: const EdgeInsets.all(Space.s4),
            child: Text(
              b.isProcessing ? 'Results appear here as chunks finish sending.' : 'No recipient results recorded.',
              style: AppText.body.copyWith(color: c.textSecondary),
            ),
          );
        }
        final failed = list.where((x) => x.isFailed).length;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (failed > 0)
              Padding(
                padding: const EdgeInsets.fromLTRB(Space.s4, Space.s3, Space.s4, 0),
                child: Text(
                  '$failed failed — tap one for the reason',
                  style: AppText.caption.copyWith(color: c.dangerFg),
                ),
              ),
            SizedBox(
              height: math.min(list.length * 60.0, 360),
              child: ListView.builder(
                itemCount: list.length,
                itemExtent: 60,
                itemBuilder: (_, i) {
                  final r = list[i];
                  final (label, tone) = messageStatus(r.status);
                  return ListTile(
                    onTap: r.isFailed ? () => showFailureDialog(context, r) : null,
                    title: Text(
                      r.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.label.copyWith(color: c.textPrimary),
                    ),
                    subtitle: Text(displayPhone(r.phone), style: AppText.caption.copyWith(color: c.textSecondary)),
                    trailing: StatusBadge(
                      label,
                      tone: tone,
                      icon: switch (r.status) {
                        'read' => LucideIcons.checkCheck,
                        'delivered' => LucideIcons.checkCheck,
                        'sent' => LucideIcons.check,
                        _ => LucideIcons.circleX,
                      },
                    ),
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }
}

Future<void> showFailureDialog(BuildContext context, BroadcastContact r) {
  final c = context.colors;
  final reason = metaErrorReason(r.errorCode);
  Widget box(String title, Widget body, Color bg) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(Space.s3),
    decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(Radii.md)),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: AppText.caption.copyWith(color: c.textSecondary)),
        const SizedBox(height: Space.s1),
        body,
      ],
    ),
  );
  return showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(r.name, style: AppText.h3.copyWith(color: c.textPrimary)),
          Text(displayPhone(r.phone), style: AppText.caption.copyWith(color: c.textSecondary)),
        ],
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (reason != null) ...[
              box('Likely reason', Text(reason, style: AppText.body.copyWith(color: c.warningFg)), c.warningBg),
              const SizedBox(height: Space.s2),
            ],
            box(
              "Meta's exact response",
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    r.error ?? 'No error message was recorded for this send.',
                    style: AppText.body.copyWith(color: c.textPrimary),
                  ),
                  if (r.errorDetail != null)
                    Text(r.errorDetail!, style: AppText.caption.copyWith(color: c.textSecondary)),
                ],
              ),
              c.surfaceSubtle,
            ),
            if (r.errorCode != null || r.errorSubcode != null) ...[
              const SizedBox(height: Space.s2),
              Text(
                'Error code: ${r.errorCode ?? '—'}${r.errorSubcode != null ? ' (subcode ${r.errorSubcode})' : ''}'
                ' — for reference if you need Meta documentation or support.',
                style: AppText.caption.copyWith(color: c.textTertiary),
              ),
            ],
            if (reason == null) ...[
              const SizedBox(height: Space.s2),
              Text(
                "This error code isn't in our known list yet — the message above is Meta's own explanation.",
                style: AppText.caption.copyWith(color: c.textTertiary),
              ),
            ],
          ],
        ),
      ),
      actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Close'))],
    ),
  );
}
