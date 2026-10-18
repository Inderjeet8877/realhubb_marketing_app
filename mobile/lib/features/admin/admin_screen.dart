import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import 'admin_accounts.dart';
import 'admin_data.dart';

/// Platform-admin hub (More → Admin): counters, then each admin page.
class AdminHubScreen extends ConsumerWidget {
  const AdminHubScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    void push(Widget page) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));
    final pages = [
      (LucideIcons.userPlus, 'Account requests', 'Approve or reject sign-ups', () => push(const RequestsScreen())),
      (LucideIcons.users, 'Users', 'Search, suspend, reactivate', () => push(const UsersScreen())),
      (LucideIcons.inbox, 'Enquiries', 'Landing-page enquiries and invites', () => push(const AdminEnquiriesScreen())),
      (LucideIcons.logIn, 'Login activity', 'Every sign-in attempt', () => push(const LoginActivityScreen())),
      (LucideIcons.scrollText, 'Audit log', 'Admin and account actions', () => push(const AuditScreen())),
    ];
    return Scaffold(
      appBar: AppBar(title: const Text('Admin')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(adminOverviewProvider.future),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(Space.s4),
          children: [
            const SectionHeader('Overview'),
            ref
                .watch(adminOverviewProvider)
                .when(
                  skipLoadingOnRefresh: true,
                  loading: () => const SizedBox(height: 220, child: LoadingList(count: 3, itemHeight: 60)),
                  error: (e, _) => AlertBanner(
                    tone: Tone.danger,
                    title: "Couldn't load the overview",
                    message: '$e',
                    actionLabel: 'Try again',
                    onAction: () => ref.invalidate(adminOverviewProvider),
                  ),
                  data: (o) {
                    String n(String k) => number(o[k] as num?);
                    return StatGrid(
                      children: [
                        StatCard(
                          label: 'Pending requests',
                          value: n('pendingRequests'),
                          icon: LucideIcons.hourglass,
                          tone: Tone.warning,
                          onTap: () => push(const RequestsScreen()),
                        ),
                        StatCard(
                          label: 'New enquiries',
                          value: n('newEnquiries'),
                          icon: LucideIcons.inbox,
                          tone: Tone.info,
                          onTap: () => push(const AdminEnquiriesScreen()),
                        ),
                        StatCard(
                          label: 'Failed (24h)',
                          value: n('failedLogins24h'),
                          icon: LucideIcons.shieldAlert,
                          tone: Tone.danger,
                          onTap: () => push(const LoginActivityScreen(initialResult: 'failed')),
                        ),
                        StatCard(
                          label: 'Sign-ins (24h)',
                          value: n('logins24h'),
                          icon: LucideIcons.logIn,
                          tone: Tone.success,
                          onTap: () => push(const LoginActivityScreen(initialResult: 'ok')),
                        ),
                        StatCard(label: 'Active workspaces', value: n('activeWorkspaces'), icon: LucideIcons.building2),
                        StatCard(
                          label: 'Active users',
                          value: n('activeUsers'),
                          icon: LucideIcons.users,
                          onTap: () => push(const UsersScreen()),
                        ),
                      ],
                    );
                  },
                ),
            const SizedBox(height: Space.s6),
            const SectionHeader('Manage'),
            AppCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  for (final (i, (icon, title, subtitle, onTap)) in pages.indexed) ...[
                    if (i > 0) const Divider(indent: 64),
                    ListTile(
                      minTileHeight: 64,
                      leading: Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(color: c.brandSubtle, borderRadius: BorderRadius.circular(Radii.md)),
                        child: Icon(icon, size: 20, color: c.brandText),
                      ),
                      title: Text(title, style: AppText.label.copyWith(color: c.textPrimary)),
                      subtitle: Text(subtitle, style: AppText.caption.copyWith(color: c.textSecondary)),
                      trailing: Icon(LucideIcons.chevronRight, size: 18, color: c.textTertiary),
                      onTap: onTap,
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Sign-in attempts, newest first; filters + "Load more" paging via `before`.
class LoginActivityScreen extends ConsumerStatefulWidget {
  const LoginActivityScreen({super.key, this.initialResult});
  final String? initialResult;

  @override
  ConsumerState<LoginActivityScreen> createState() => _LoginActivityScreenState();
}

class _LoginActivityScreenState extends ConsumerState<LoginActivityScreen> {
  static const _pageSize = 50;
  late String? _result = widget.initialResult;
  final _email = TextEditingController();
  Timer? _debounce;
  final _rows = <Json>[];
  bool _loading = true, _more = false, _hasMore = false;
  String? _error;
  int _gen = 0; // drops responses from a superseded filter

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _email.dispose();
    super.dispose();
  }

  Future<void> _load({bool more = false}) async {
    final gen = more ? _gen : ++_gen;
    setState(() {
      if (more) {
        _more = true;
      } else {
        _loading = _rows.isEmpty;
        _error = null;
      }
    });
    try {
      final d = await ref
          .read(apiClientProvider)
          .get(
            '/api/admin/login-activity',
            query: {
              'limit': _pageSize,
              'result': ?_result,
              if (_email.text.trim().isNotEmpty) 'email': _email.text.trim(),
              if (more && _rows.isNotEmpty) 'before': _rows.last['createdAt'],
            },
          );
      if (!mounted || gen != _gen) return;
      final page = [for (final e in (d['attempts'] as List? ?? const [])) Json.from(e)];
      setState(() {
        if (!more) _rows.clear();
        _rows.addAll(page);
        _hasMore = page.length == _pageSize;
      });
    } catch (e) {
      if (!mounted || gen != _gen) return;
      if (more) {
        showSnack(context, '$e', tone: Tone.danger);
      } else {
        setState(() => _error = '$e');
      }
    } finally {
      if (mounted && gen == _gen) {
        setState(() {
          _loading = false;
          _more = false;
        });
      }
    }
  }

  void _setResult(String? r) {
    setState(() {
      _result = r;
      _rows.clear();
    });
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Login activity')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.s4, Space.s3, Space.s4, Space.s2),
            child: TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              onChanged: (_) {
                _debounce?.cancel();
                _debounce = Timer(const Duration(milliseconds: 400), _load);
              },
              decoration: const InputDecoration(
                labelText: 'Search by email',
                prefixIcon: Icon(LucideIcons.search, size: 18),
              ),
            ),
          ),
          FilterChips<String?>(
            options: const [(null, 'All'), ('failed', 'Failed'), ('ok', 'OK')],
            selected: _result,
            onSelected: _setResult,
          ),
          const SizedBox(height: Space.s2),
          Expanded(child: _body()),
        ],
      ),
    );
  }

  Widget _body() {
    if (_loading) return const LoadingList(itemHeight: 84);
    if (_error != null) return ErrorView(message: _error!, onRetry: _load);
    return RefreshIndicator(
      onRefresh: _load,
      child: _rows.isEmpty
          ? ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: const [
                EmptyState(
                  icon: LucideIcons.logIn,
                  title: 'No sign-in attempts',
                  message: 'Nothing matches these filters.',
                ),
              ],
            )
          : ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(Space.s4),
              itemCount: _rows.length + (_hasMore ? 1 : 0),
              separatorBuilder: (_, _) => const SizedBox(height: Space.s3),
              itemBuilder: (_, i) => i == _rows.length
                  ? OutlinedButton(
                      onPressed: _more ? null : () => _load(more: true),
                      child: Text(_more ? 'Loading…' : 'Load more'),
                    )
                  : _AttemptCard(_rows[i]),
            ),
    );
  }
}

class _AttemptCard extends StatelessWidget {
  const _AttemptCard(this.a);
  final Json a;

  @override
  Widget build(BuildContext context) {
    final name = str(a, 'userName');
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PersonHeader(name: name.isEmpty ? str(a, 'email') : name, email: str(a, 'email'), status: str(a, 'result')),
          const SizedBox(height: Space.s1),
          InfoLine(
            LucideIcons.clock,
            '${dateTime(parseDate(a['createdAt']))} · ${str(a, 'method') == 'google' ? 'Google' : 'Password'}',
          ),
          if (str(a, 'ip').isNotEmpty) InfoLine(LucideIcons.globe, 'IP ${str(a, 'ip')}'),
          if (str(a, 'userAgent').isNotEmpty) InfoLine(LucideIcons.smartphone, str(a, 'userAgent')),
        ],
      ),
    );
  }
}

/// Admin and account actions, newest first.
class AuditScreen extends ConsumerWidget {
  const AuditScreen({super.key});

  static String _action(String a) => switch (a) {
    'signup.requested' => 'Requested an account',
    'user.approved' => 'Approved a request',
    'user.rejected' => 'Rejected a request',
    'user.suspended' => 'Suspended a user',
    'user.reactivated' => 'Reactivated a user',
    'enquiry.updated' => 'Updated an enquiry',
    'enquiry.invited' => 'Created an account from an enquiry',
    'password.changed' => 'Changed their password',
    _ => a,
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    return Scaffold(
      appBar: AppBar(title: const Text('Audit log')),
      body: AdminList(
        value: ref.watch(adminAuditProvider),
        onRefresh: () => ref.refresh(adminAuditProvider.future),
        onRetry: () => ref.invalidate(adminAuditProvider),
        empty: const EmptyState(icon: LucideIcons.scrollText, title: 'No actions recorded yet'),
        item: (e) => AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(_action(str(e, 'action')), style: AppText.label.copyWith(color: c.textPrimary)),
              Text(
                str(e, 'actorEmail').isEmpty ? 'System' : str(e, 'actorEmail'),
                style: AppText.caption.copyWith(color: c.textSecondary),
              ),
              if (str(e, 'target').isNotEmpty) InfoLine(LucideIcons.target, str(e, 'target')),
              if (str(e, 'workspaceName').isNotEmpty) InfoLine(LucideIcons.building2, str(e, 'workspaceName')),
              if (e['meta'] is Map && (e['meta'] as Map)['reason'] != null)
                InfoLine(LucideIcons.messageSquare, 'Reason: ${(e['meta'] as Map)['reason']}'),
              InfoLine(LucideIcons.clock, dateTime(parseDate(e['createdAt']))),
            ],
          ),
        ),
      ),
    );
  }
}
