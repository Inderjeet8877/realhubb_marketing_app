import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/format.dart';
import '../../../theme/app_theme.dart';
import '../../../theme/tokens.dart';
import '../../../widgets/ui.dart';
import '../../broadcasts/broadcast_actions.dart';
import '../../broadcasts/broadcast_data.dart';
import '../../broadcasts/broadcasts_screen.dart';

/// Live progress of a started broadcast. Sending runs on the server; this only
/// polls the job doc every 5 s (web used a Firestore listener).
class BulkProgressView extends ConsumerStatefulWidget {
  const BulkProgressView({
    super.key,
    required this.broadcastId,
    required this.total,
    required this.optedOut,
    required this.onNew,
  });
  final String broadcastId;
  final int total, optedOut;
  final VoidCallback onNew;

  @override
  ConsumerState<BulkProgressView> createState() => _BulkProgressViewState();
}

class _BulkProgressViewState extends ConsumerState<BulkProgressView> {
  Timer? _timer;
  Broadcast? _b;
  bool _inFlight = false, _busy = false;
  DateTime _lastNudge = DateTime.now();

  @override
  void initState() {
    super.initState();
    _poll();
    _timer = Timer.periodic(const Duration(seconds: 5), (_) => _poll());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _poll() async {
    if (_inFlight) return;
    _inFlight = true;
    try {
      final api = ref.read(broadcastsApiProvider);
      // ponytail: newest 10 only — a just-started job is at the top; a per-id status route would be exact.
      final list = await api.list(limit: 10);
      final b = list.where((x) => x.id == widget.broadcastId).firstOrNull;
      if (!mounted || b == null) return;
      setState(() => _b = b);
      if (!b.isProcessing) {
        _timer?.cancel();
      } else if (DateTime.now().difference(_lastNudge) >= const Duration(minutes: 10)) {
        _lastNudge = DateTime.now();
        api.resume(b.id).ignore(); // web's silent 10-min auto-resume
      }
    } catch (_) {
      // transient — keep the last known state and try again next tick
    } finally {
      _inFlight = false;
    }
  }

  Future<void> _act(Future<void> Function() f) async {
    setState(() => _busy = true);
    await f();
    if (mounted) setState(() => _busy = false);
    _poll();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final b = _b;
    final total = b?.total ?? widget.total;
    final processed = b?.processed ?? 0;
    final p = broadcastProgress(processed, total);
    final status = b?.status ?? 'processing';

    return ListView(
      padding: const EdgeInsets.all(Space.s4),
      children: [
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text('Broadcast', style: AppText.h2.copyWith(color: c.textPrimary)),
                  ),
                  BroadcastStatusBadge(status),
                ],
              ),
              const SizedBox(height: Space.s4),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '${number(processed)} / ${number(total)} processed',
                      style: AppText.label.copyWith(color: c.textPrimary),
                    ),
                  ),
                  Text(percent(p * 100, decimals: 0), style: AppText.label.copyWith(color: c.textSecondary)),
                ],
              ),
              const SizedBox(height: Space.s2),
              Semantics(
                label: 'Progress ${percent(p * 100, decimals: 0)}',
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(Radii.full),
                  child: LinearProgressIndicator(value: p, minHeight: 10),
                ),
              ),
              if (widget.optedOut > 0) ...[
                const SizedBox(height: Space.s2),
                Text(
                  '${number(widget.optedOut)} contact${widget.optedOut == 1 ? '' : 's'} skipped — already opted out.',
                  style: AppText.caption.copyWith(color: c.textSecondary),
                ),
              ],
              if (status == 'processing') ...[
                const SizedBox(height: Space.s3),
                const AlertBanner(
                  tone: Tone.info,
                  title: 'Safe to leave this screen',
                  message: 'The broadcast keeps sending on the server. Follow it any time in Broadcasts.',
                ),
                const SizedBox(height: Space.s3),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _busy ? null : () => _act(() => resumeBroadcast(context, ref, widget.broadcastId)),
                        icon: const Icon(LucideIcons.play, size: 16),
                        label: const Text('Resume'),
                      ),
                    ),
                    const SizedBox(width: Space.s3),
                    Expanded(
                      child: OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: c.dangerFg,
                          side: BorderSide(color: c.dangerFg),
                        ),
                        onPressed: _busy ? null : () => _act(() => cancelBroadcast(context, ref, widget.broadcastId)),
                        icon: const Icon(LucideIcons.octagonX, size: 16),
                        label: const Text('Cancel'),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
        if (b != null && !b.isProcessing) ...[
          const SizedBox(height: Space.s4),
          switch (b.status) {
            'completed' => AlertBanner(
              tone: Tone.success,
              title: 'Send complete',
              message: [
                '${number(b.sent)} sent · ${number(b.failed)} failed',
                if (b.duration != null) 'Took ${formatDuration(b.duration)}',
              ].join('\n'),
            ),
            'cancelled' => AlertBanner(
              tone: Tone.warning,
              title: 'Broadcast cancelled',
              message: [
                '${number(b.sent)} sent · ${number(b.failed)} failed before it was stopped',
                if (b.cancelReason != null) 'Reason: ${b.cancelReason}',
              ].join('\n'),
            ),
            _ => AlertBanner(
              tone: Tone.danger,
              title: 'Broadcast failed',
              message: '${number(b.sent)} sent before it stopped. Open Broadcasts for per-contact details.',
            ),
          },
          const SizedBox(height: Space.s4),
          FilledButton.icon(
            onPressed: widget.onNew,
            icon: const Icon(LucideIcons.send, size: 18),
            label: const Text('New broadcast'),
          ),
        ],
        const SizedBox(height: Space.s2),
        OutlinedButton.icon(
          onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const BroadcastsScreen())),
          icon: const Icon(LucideIcons.chartColumn, size: 18),
          label: const Text('View broadcasts'),
        ),
      ],
    );
  }
}
