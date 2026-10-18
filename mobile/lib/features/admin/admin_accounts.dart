import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import 'admin_data.dart';

/// Sign-up requests by status; approve, or reject with a reason.
class RequestsScreen extends ConsumerWidget {
  const RequestsScreen({super.key});

  static const _tabs = [
    ('pending', 'Pending'),
    ('approved', 'Approved'),
    ('rejected', 'Rejected'),
    ('suspended', 'Suspended'),
    ('all', 'All'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) => DefaultTabController(
    length: _tabs.length,
    child: Scaffold(
      appBar: AppBar(
        title: const Text('Account requests'),
        bottom: TabBar(
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: [for (final (_, label) in _tabs) Tab(text: label)],
        ),
      ),
      body: TabBarView(
        children: [
          for (final (status, label) in _tabs)
            AdminList(
              value: ref.watch(adminRequestsProvider(status)),
              onRefresh: () => ref.refresh(adminRequestsProvider(status).future),
              onRetry: () => ref.invalidate(adminRequestsProvider(status)),
              empty: EmptyState(
                icon: LucideIcons.userPlus,
                title: status == 'pending' ? 'No pending requests' : 'Nothing here',
                message: status == 'pending' ? 'New sign-ups will show up here for approval.' : 'No $label requests.',
              ),
              item: (r) => _RequestCard(r),
            ),
        ],
      ),
    ),
  );
}

class _RequestCard extends ConsumerWidget {
  const _RequestCard(this.r);
  final Json r;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = str(r, 'status'), id = str(r, 'id'), name = str(r, 'name');
    final api = ref.read(apiClientProvider);
    Future<void> approve() => runAdminAction(
      context,
      ref,
      () => api.post('/api/admin/requests/$id/approve', body: const {}),
      '$name approved',
      invalidate: [adminRequestsProvider, adminUsersProvider],
    );
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PersonHeader(name: name, email: str(r, 'email'), status: status),
          const SizedBox(height: Space.s2),
          InfoLine(LucideIcons.building2, str(sub(r, 'workspace'), 'name')),
          InfoLine(
            LucideIcons.clock,
            'Requested ${when(r, 'createdAt')} · ${str(r, 'method') == 'google' ? 'Google' : 'Email + password'}',
          ),
          if (str(r, 'rejectReason').isNotEmpty)
            InfoLine(LucideIcons.messageSquare, 'Reason: ${str(r, 'rejectReason')}'),
          if (status == 'pending' || status == 'rejected') ...[
            const SizedBox(height: Space.s3),
            Row(
              children: [
                if (status == 'pending') ...[
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _reject(context, ref, id, name),
                      icon: const Icon(LucideIcons.x, size: 18),
                      label: const Text('Reject'),
                    ),
                  ),
                  const SizedBox(width: Space.s3),
                ],
                Expanded(
                  child: FilledButton.icon(
                    onPressed: approve,
                    icon: const Icon(LucideIcons.check, size: 18),
                    label: const Text('Approve'),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _reject(BuildContext context, WidgetRef ref, String id, String name) async {
    final reason = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _RejectSheet(name: name),
    );
    if (reason == null || !context.mounted) return;
    await runAdminAction(
      context,
      ref,
      () => ref.read(apiClientProvider).post('/api/admin/requests/$id/reject', body: {'reason': reason}),
      '$name rejected',
      invalidate: [adminRequestsProvider, adminUsersProvider],
    );
  }
}

class _RejectSheet extends StatefulWidget {
  const _RejectSheet({required this.name});
  final String name;

  @override
  State<_RejectSheet> createState() => _RejectSheetState();
}

class _RejectSheetState extends State<_RejectSheet> {
  final _reason = TextEditingController();

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: EdgeInsets.fromLTRB(Space.s4, 0, Space.s4, MediaQuery.viewInsetsOf(context).bottom + Space.s4),
      child: SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Reject ${widget.name}?', style: AppText.h2.copyWith(color: c.textPrimary)),
            const SizedBox(height: Space.s1),
            Text(
              'They will not be able to sign in. The reason is kept in the admin panel.',
              style: AppText.body.copyWith(color: c.textSecondary),
            ),
            const SizedBox(height: Space.s4),
            TextField(
              controller: _reason,
              autofocus: true,
              maxLength: 500,
              maxLines: 3,
              decoration: const InputDecoration(labelText: 'Reason (optional)'),
            ),
            const SizedBox(height: Space.s3),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: c.dangerSolid, foregroundColor: Colors.white),
              onPressed: () => Navigator.pop(context, _reason.text.trim()),
              child: const Text('Reject request'),
            ),
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          ],
        ),
      ),
    );
  }
}

/// All users with search + status filter; suspend / reactivate (never platform admins).
class UsersScreen extends ConsumerStatefulWidget {
  const UsersScreen({super.key});

  @override
  ConsumerState<UsersScreen> createState() => _UsersScreenState();
}

class _UsersScreenState extends ConsumerState<UsersScreen> {
  final _search = TextEditingController();
  Timer? _debounce;
  String _q = '';
  String? _status;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final filter = (q: _q, status: _status);
    return Scaffold(
      appBar: AppBar(title: const Text('Users')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.s4, Space.s3, Space.s4, Space.s2),
            child: TextField(
              controller: _search,
              onChanged: (v) {
                _debounce?.cancel();
                _debounce = Timer(const Duration(milliseconds: 400), () => setState(() => _q = v.trim()));
              },
              decoration: const InputDecoration(
                labelText: 'Search name, email or workspace',
                prefixIcon: Icon(LucideIcons.search, size: 18),
              ),
            ),
          ),
          FilterChips<String?>(
            options: const [
              (null, 'All'),
              ('approved', 'Approved'),
              ('pending', 'Pending'),
              ('suspended', 'Suspended'),
              ('rejected', 'Rejected'),
            ],
            selected: _status,
            onSelected: (s) => setState(() => _status = s),
          ),
          const SizedBox(height: Space.s2),
          Expanded(
            child: AdminList(
              value: ref.watch(adminUsersProvider(filter)),
              onRefresh: () => ref.refresh(adminUsersProvider(filter).future),
              onRetry: () => ref.invalidate(adminUsersProvider(filter)),
              empty: const EmptyState(
                icon: LucideIcons.users,
                title: 'No users found',
                message: 'Try another search or filter.',
              ),
              item: (u) => _UserCard(u),
            ),
          ),
        ],
      ),
    );
  }
}

class _UserCard extends ConsumerWidget {
  const _UserCard(this.u);
  final Json u;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = str(u, 'status'), id = str(u, 'id'), name = str(u, 'name');
    final admin = u['isPlatformAdmin'] == true;
    final ws = sub(u, 'workspace');
    final lastLogin = parseDate(u['lastLoginAt']);
    Future<void> act(String action, String done) => runAdminAction(
      context,
      ref,
      () => ref.read(apiClientProvider).post('/api/admin/users/$id/$action', body: const {}),
      done,
      invalidate: [adminUsersProvider, adminRequestsProvider],
    );
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PersonHeader(
            name: name,
            email: str(u, 'email'),
            status: status,
            extra: admin
                ? const Padding(
                    padding: EdgeInsets.only(top: Space.s1),
                    child: StatusBadge('Platform admin', tone: Tone.brand, icon: LucideIcons.shieldCheck),
                  )
                : null,
          ),
          const SizedBox(height: Space.s2),
          InfoLine(LucideIcons.building2, '${str(ws, 'name')} · ${str(u, 'role')}'),
          InfoLine(LucideIcons.logIn, lastLogin == null ? 'Never signed in' : 'Last sign-in ${timeAgo(lastLogin)}'),
          const SizedBox(height: Space.s3),
          if (status == 'approved')
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(foregroundColor: context.colors.dangerFg),
              onPressed: admin
                  ? null
                  : () async {
                      final ok = await confirm(
                        context,
                        title: 'Suspend $name?',
                        message: 'They are signed out everywhere and cannot sign in until reactivated.',
                        confirmLabel: 'Suspend',
                        danger: true,
                      );
                      if (ok && context.mounted) await act('suspend', '$name suspended');
                    },
              icon: const Icon(LucideIcons.ban, size: 18),
              label: Text(admin ? 'Platform admins cannot be suspended' : 'Suspend'),
            )
          else if (status == 'suspended' || status == 'rejected')
            FilledButton.icon(
              onPressed: admin ? null : () => act('reactivate', '$name reactivated'),
              icon: const Icon(LucideIcons.rotateCcw, size: 18),
              label: const Text('Reactivate'),
            ),
        ],
      ),
    );
  }
}

/// Landing-page enquiries: status + notes, and "Create account" (one-time temp password).
class AdminEnquiriesScreen extends ConsumerStatefulWidget {
  const AdminEnquiriesScreen({super.key});

  @override
  ConsumerState<AdminEnquiriesScreen> createState() => _AdminEnquiriesScreenState();
}

const _enquiryStatuses = ['new', 'contacted', 'invited', 'closed'];

class _AdminEnquiriesScreenState extends ConsumerState<AdminEnquiriesScreen> {
  String? _status;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Enquiries')),
    body: Column(
      children: [
        const SizedBox(height: Space.s3),
        FilterChips<String?>(
          options: [(null, 'All'), for (final s in _enquiryStatuses) (s, statusInfo(s).$1)],
          selected: _status,
          onSelected: (s) => setState(() => _status = s),
        ),
        const SizedBox(height: Space.s2),
        Expanded(
          child: AdminList(
            value: ref.watch(adminEnquiriesProvider(_status)),
            onRefresh: () => ref.refresh(adminEnquiriesProvider(_status).future),
            onRetry: () => ref.invalidate(adminEnquiriesProvider(_status)),
            empty: const EmptyState(
              icon: LucideIcons.inbox,
              title: 'No enquiries',
              message: 'Landing-page "Get started" submissions show up here.',
            ),
            item: (e) => AppCard(
              onTap: () => showModalBottomSheet(
                context: context,
                isScrollControlled: true,
                showDragHandle: true,
                builder: (_) => _EnquirySheet(e),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  PersonHeader(name: str(e, 'name'), email: str(e, 'email'), status: str(e, 'status')),
                  const SizedBox(height: Space.s2),
                  if (str(e, 'company').isNotEmpty) InfoLine(LucideIcons.building2, str(e, 'company')),
                  InfoLine(LucideIcons.phone, displayPhone(str(e, 'phone'))),
                  InfoLine(LucideIcons.clock, when(e, 'createdAt')),
                  if (str(e, 'message').isNotEmpty) InfoLine(LucideIcons.messageSquare, str(e, 'message')),
                  if (str(e, 'notes').isNotEmpty) InfoLine(LucideIcons.stickyNote, 'Notes: ${str(e, 'notes')}'),
                ],
              ),
            ),
          ),
        ),
      ],
    ),
  );
}

class _EnquirySheet extends ConsumerStatefulWidget {
  const _EnquirySheet(this.e);
  final Json e;

  @override
  ConsumerState<_EnquirySheet> createState() => _EnquirySheetState();
}

class _EnquirySheetState extends ConsumerState<_EnquirySheet> {
  late String _status = str(widget.e, 'status');
  late final _notes = TextEditingController(text: str(widget.e, 'notes'));
  bool _busy = false;

  String get _id => str(widget.e, 'id');

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    final ok = await runAdminAction(
      context,
      ref,
      () => ref
          .read(apiClientProvider)
          .patch('/api/admin/enquiries/$_id', body: {'status': _status, 'notes': _notes.text}),
      'Enquiry saved',
      invalidate: [adminEnquiriesProvider],
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) Navigator.pop(context);
  }

  Future<void> _invite() async {
    final name = str(widget.e, 'name');
    final go = await confirm(
      context,
      title: 'Create an account for $name?',
      message: 'This creates an active workspace and a temporary password, shown once, for you to share.',
      confirmLabel: 'Create account',
    );
    if (!go || !mounted) return;
    setState(() => _busy = true);
    try {
      final r = await ref.read(apiClientProvider).post('/api/admin/enquiries/$_id/invite', body: const {});
      ref
        ..invalidate(adminEnquiriesProvider)
        ..invalidate(adminUsersProvider)
        ..invalidate(adminOverviewProvider);
      if (!mounted) return;
      final nav = Navigator.of(context);
      nav.pop();
      await showDialog<void>(
        context: nav.context,
        barrierDismissible: false,
        builder: (_) => _TempPasswordDialog(email: '${r['email']}', password: '${r['tempPassword']}'),
      );
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showSnack(context, '$e', tone: Tone.danger);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final e = widget.e;
    return Padding(
      padding: EdgeInsets.fromLTRB(Space.s4, 0, Space.s4, MediaQuery.viewInsetsOf(context).bottom + Space.s4),
      child: SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              PersonHeader(name: str(e, 'name'), email: str(e, 'email'), status: str(e, 'status')),
              if (str(e, 'message').isNotEmpty) ...[
                const SizedBox(height: Space.s3),
                Text(str(e, 'message'), style: AppText.body.copyWith(color: c.textSecondary)),
              ],
              const SizedBox(height: Space.s4),
              DropdownButtonFormField<String>(
                initialValue: _status,
                decoration: const InputDecoration(labelText: 'Status'),
                items: [for (final s in _enquiryStatuses) DropdownMenuItem(value: s, child: Text(statusInfo(s).$1))],
                onChanged: _busy ? null : (v) => setState(() => _status = v ?? _status),
              ),
              const SizedBox(height: Space.s3),
              TextField(
                controller: _notes,
                enabled: !_busy,
                maxLength: 2000,
                maxLines: 4,
                minLines: 2,
                decoration: const InputDecoration(labelText: 'Internal notes'),
              ),
              const SizedBox(height: Space.s2),
              FilledButton(onPressed: _busy ? null : _save, child: const Text('Save')),
              if (str(e, 'status') != 'invited') ...[
                const SizedBox(height: Space.s2),
                OutlinedButton.icon(
                  onPressed: _busy ? null : _invite,
                  icon: const Icon(LucideIcons.userPlus, size: 18),
                  label: const Text('Create account'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _TempPasswordDialog extends StatelessWidget {
  const _TempPasswordDialog({required this.email, required this.password});
  final String email, password;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AlertDialog(
      title: const Text('Account created'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const AlertBanner(
            tone: Tone.warning,
            title: 'Shown only once',
            message: 'Copy it now and share it securely. Ask them to change it after signing in.',
          ),
          const SizedBox(height: Space.s4),
          Text('Email', style: AppText.caption.copyWith(color: c.textTertiary)),
          SelectableText(email, style: AppText.label.copyWith(color: c.textPrimary)),
          const SizedBox(height: Space.s3),
          Text('Temporary password', style: AppText.caption.copyWith(color: c.textTertiary)),
          SelectableText(
            password,
            style: AppText.h3.copyWith(color: c.textPrimary, fontFamily: 'monospace'),
          ),
        ],
      ),
      actions: [
        TextButton.icon(
          onPressed: () async {
            await Clipboard.setData(ClipboardData(text: 'Email: $email\nTemporary password: $password'));
            if (context.mounted) showSnack(context, 'Copied');
          },
          icon: const Icon(LucideIcons.copy, size: 18),
          label: const Text('Copy'),
        ),
        FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Done')),
      ],
    );
  }
}
