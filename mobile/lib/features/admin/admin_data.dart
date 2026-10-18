import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show ProviderOrFamily;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';

/// Admin API rows are used as plain JSON maps; each screen reads the few fields it shows.
typedef Json = Map<String, dynamic>;

List<Json> _rows(Object? d, String key) => [for (final e in ((d as Map)[key] as List? ?? const [])) Json.from(e)];

String str(Json j, String k) => j[k] == null ? '' : '${j[k]}';
Json sub(Json j, String k) => j[k] is Map ? Json.from(j[k] as Map) : const {};
String when(Json j, String k) => timeAgo(parseDate(j[k]));

final adminOverviewProvider = FutureProvider.autoDispose<Json>(
  (ref) async => Json.from(await ref.read(apiClientProvider).get('/api/admin/overview') as Map),
);

/// status: pending | approved | rejected | suspended | all
final adminRequestsProvider = FutureProvider.autoDispose.family<List<Json>, String>(
  (ref, status) async =>
      _rows(await ref.read(apiClientProvider).get('/api/admin/requests', query: {'status': status}), 'requests'),
);

final adminUsersProvider = FutureProvider.autoDispose.family<List<Json>, ({String q, String? status})>(
  (ref, f) async => _rows(
    await ref
        .read(apiClientProvider)
        .get('/api/admin/users', query: {if (f.q.isNotEmpty) 'q': f.q, 'status': ?f.status}),
    'users',
  ),
);

final adminEnquiriesProvider = FutureProvider.autoDispose.family<List<Json>, String?>(
  (ref, status) async =>
      _rows(await ref.read(apiClientProvider).get('/api/admin/enquiries', query: {'status': ?status}), 'enquiries'),
);

final adminAuditProvider = FutureProvider.autoDispose<List<Json>>(
  (ref) async => _rows(await ref.read(apiClientProvider).get('/api/admin/audit', query: {'limit': 200}), 'entries'),
);

/// One label + tone + icon for every account / enquiry / sign-in status (never colour alone).
(String, Tone, IconData) statusInfo(String s) => switch (s) {
  'pending' => ('Pending', Tone.warning, LucideIcons.hourglass),
  'approved' => ('Approved', Tone.success, LucideIcons.circleCheck),
  'active' => ('Active', Tone.success, LucideIcons.circleCheck),
  'rejected' => ('Rejected', Tone.danger, LucideIcons.circleX),
  'suspended' => ('Suspended', Tone.danger, LucideIcons.ban),
  'new' => ('New', Tone.info, LucideIcons.sparkle),
  'contacted' => ('Contacted', Tone.brand, LucideIcons.phone),
  'invited' => ('Invited', Tone.success, LucideIcons.mailCheck),
  'closed' => ('Closed', Tone.neutral, LucideIcons.archive),
  'ok' => ('Signed in', Tone.success, LucideIcons.logIn),
  'bad_password' => ('Wrong password', Tone.danger, LucideIcons.keyRound),
  'no_account' => ('No account', Tone.warning, LucideIcons.userX),
  'locked' => ('Locked out', Tone.danger, LucideIcons.lock),
  _ => (s, Tone.neutral, LucideIcons.circle),
};

class StatusPill extends StatelessWidget {
  const StatusPill(this.status, {super.key});
  final String status;

  @override
  Widget build(BuildContext context) {
    final (label, tone, icon) = statusInfo(status);
    return StatusBadge(label, tone: tone, icon: icon);
  }
}

/// Runs an admin action, shows a snack for the result, and refreshes [invalidate] on success.
Future<bool> runAdminAction(
  BuildContext context,
  WidgetRef ref,
  Future<void> Function() call,
  String done, {
  List<ProviderOrFamily> invalidate = const [],
}) async {
  try {
    await call();
    for (final p in [...invalidate, adminOverviewProvider]) {
      ref.invalidate(p);
    }
    if (context.mounted) showSnack(context, done, tone: Tone.success);
    return true;
  } catch (e) {
    if (context.mounted) showSnack(context, '$e', tone: Tone.danger);
    return false;
  }
}

/// Pull-to-refresh list with the standard loading / error / empty states.
class AdminList extends StatelessWidget {
  const AdminList({
    super.key,
    required this.value,
    required this.onRefresh,
    required this.onRetry,
    required this.empty,
    required this.item,
  });
  final AsyncValue<List<Json>> value;
  final Future<void> Function() onRefresh;
  final VoidCallback onRetry;
  final EmptyState empty;
  final Widget Function(Json row) item;

  @override
  Widget build(BuildContext context) => AsyncBody(
    value: value,
    onRetry: onRetry,
    loading: const LoadingList(itemHeight: 110),
    data: (rows) => RefreshIndicator(
      onRefresh: onRefresh,
      child: rows.isEmpty
          ? ListView(physics: const AlwaysScrollableScrollPhysics(), children: [empty])
          : ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(Space.s4),
              itemCount: rows.length,
              separatorBuilder: (_, _) => const SizedBox(height: Space.s3),
              itemBuilder: (_, i) => item(rows[i]),
            ),
    ),
  );
}

/// Name / email header with a status pill, used by every admin card.
class PersonHeader extends StatelessWidget {
  const PersonHeader({super.key, required this.name, required this.email, required this.status, this.extra});
  final String name, email, status;
  final Widget? extra;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InitialsAvatar(name.isEmpty ? '?' : initials(name)),
        const SizedBox(width: Space.s3),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                style: AppText.label.copyWith(color: c.textPrimary),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              Text(
                email,
                style: AppText.caption.copyWith(color: c.textSecondary),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              ?extra,
            ],
          ),
        ),
        const SizedBox(width: Space.s2),
        StatusPill(status),
      ],
    );
  }
}

/// "icon  text" detail line inside a card.
class InfoLine extends StatelessWidget {
  const InfoLine(this.icon, this.text, {super.key});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(top: Space.s1),
      child: Row(
        children: [
          Icon(icon, size: 14, color: c.textTertiary),
          const SizedBox(width: Space.s2),
          Expanded(
            child: Text(text, style: AppText.caption.copyWith(color: c.textSecondary)),
          ),
        ],
      ),
    );
  }
}

/// Horizontally scrolling single-select chips (filters).
class FilterChips<T> extends StatelessWidget {
  const FilterChips({super.key, required this.options, required this.selected, required this.onSelected});
  final List<(T, String)> options;
  final T selected;
  final ValueChanged<T> onSelected;

  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.centerLeft,
    child: SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: Space.s4),
      child: Row(
        children: [
          for (final (v, label) in options)
            Padding(
              padding: const EdgeInsets.only(right: Space.s2),
              child: ChoiceChip(
                label: Text(label),
                selected: v == selected,
                onSelected: (_) => onSelected(v),
                materialTapTargetSize: MaterialTapTargetSize.padded,
              ),
            ),
        ],
      ),
    ),
  );
}
