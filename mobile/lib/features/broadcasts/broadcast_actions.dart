import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import 'broadcast_data.dart';

/// Replaces the web's window.prompt. Returns null when dismissed (don't cancel);
/// an empty reason is allowed (the server stores "No reason provided").
Future<String?> askCancelReason(BuildContext context) {
  final c = context.colors;
  final ctrl = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text('Cancel this broadcast?', style: AppText.h3.copyWith(color: c.textPrimary)),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Messages already sent stay sent. The reason is saved on the report.',
            style: AppText.body.copyWith(color: c.textSecondary),
          ),
          const SizedBox(height: Space.s4),
          TextField(
            controller: ctrl,
            autofocus: true,
            maxLines: 3,
            minLines: 1,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(labelText: 'Reason', hintText: 'e.g. Wrong template selected'),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Keep sending')),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: c.dangerSolid),
          onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
          child: const Text('Cancel broadcast'),
        ),
      ],
    ),
  ); // ctrl not disposed: the closing animation still reads it; it holds no listeners.
}

/// Asks for a reason, then requests cancellation. Returns true if requested.
Future<bool> cancelBroadcast(BuildContext context, WidgetRef ref, String id) async {
  final reason = await askCancelReason(context);
  if (reason == null || !context.mounted) return false;
  try {
    await ref.read(broadcastsApiProvider).cancel(id, reason);
    if (context.mounted) showSnack(context, 'Cancelling — it stops after the current chunk.');
    return true;
  } catch (e) {
    if (context.mounted) showSnack(context, '$e', tone: Tone.danger);
    return false;
  }
}

/// Nudges a stalled worker chain; safe on a healthy job (server-side chunk claim).
Future<void> resumeBroadcast(BuildContext context, WidgetRef ref, String id) async {
  try {
    await ref.read(broadcastsApiProvider).resume(id);
    if (context.mounted) showSnack(context, 'Resume requested.', tone: Tone.success);
  } catch (e) {
    if (context.mounted) showSnack(context, '$e', tone: Tone.danger);
  }
}
