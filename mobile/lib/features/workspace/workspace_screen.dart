import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/format.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/brand_mark.dart';
import '../../widgets/ui.dart';
import '../auth/auth_controller.dart';
import '../auth/login_hero.dart';
import '../auth/signup_screen.dart';

/// Home for approved (non-admin) users: their own empty workspace. It never
/// links into the legacy screens, which show the shared Realhubb data.
class WorkspaceScreen extends ConsumerWidget {
  const WorkspaceScreen({super.key});

  static const _soon = [
    (LucideIcons.messageCircle, 'Connect WhatsApp', 'Link your WhatsApp Business number to send and receive messages.'),
    (LucideIcons.megaphone, 'Connect Meta Ads', 'See campaign spend, leads and cost per lead.'),
    (LucideIcons.users, 'Import contacts', 'Upload a CSV of your customers to start broadcasting.'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final me = ref.watch(authProvider).me;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: c.canvas,
        body: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(child: _Header(me)),
            SliverPadding(
              padding: const EdgeInsets.all(Space.s4),
              sliver: SliverList.list(
                children: [
                  const SizedBox(height: Space.s4),
                  Center(
                    child: Container(
                      width: 64,
                      height: 64,
                      decoration: BoxDecoration(color: c.brandSubtle, shape: BoxShape.circle),
                      child: Icon(LucideIcons.sparkles, color: c.brandText, size: 28),
                    ),
                  ),
                  const SizedBox(height: Space.s4),
                  Text(
                    'Your workspace is ready',
                    textAlign: TextAlign.center,
                    style: AppText.h1.copyWith(color: c.textPrimary),
                  ),
                  const SizedBox(height: Space.s1),
                  Text(
                    "It's empty for now. These tools are on the way.",
                    textAlign: TextAlign.center,
                    style: AppText.body.copyWith(color: c.textSecondary),
                  ),
                  const SizedBox(height: Space.s6),
                  for (final (icon, title, sub) in _soon) ...[
                    _ComingSoonCard(icon: icon, title: title, subtitle: sub),
                    const SizedBox(height: Space.s3),
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

class _Header extends ConsumerWidget {
  const _Header(this.me);
  final Me? me;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final name = me?.name ?? '';
    return Container(
      color: heroNavy,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Space.s4, Space.s3, Space.s2, Space.s5),
          child: Row(
            children: [
              const BrandSymbol(size: 36),
              const SizedBox(width: Space.s3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      me?.workspaceName ?? 'Your workspace',
                      style: AppText.h2.copyWith(color: Colors.white),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      name,
                      style: AppText.caption.copyWith(color: Colors.white70),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              PopupMenuButton<String>(
                tooltip: 'Account menu',
                onSelected: (v) async {
                  if (v == 'password') return showChangePasswordDialog(context);
                  final ok = await confirm(
                    context,
                    title: 'Sign out?',
                    message: "You'll need to sign in again to use Broadzen.",
                    confirmLabel: 'Sign out',
                    danger: true,
                  );
                  if (ok) await ref.read(authProvider.notifier).signOut();
                },
                itemBuilder: (_) => [
                  PopupMenuItem(enabled: false, child: Text(me?.email ?? '', style: AppText.caption)),
                  const PopupMenuItem(
                    value: 'password',
                    child: ListTile(leading: Icon(LucideIcons.keyRound), title: Text('Change password')),
                  ),
                  const PopupMenuItem(
                    value: 'signout',
                    child: ListTile(leading: Icon(LucideIcons.logOut), title: Text('Sign out')),
                  ),
                ],
                child: Padding(
                  padding: const EdgeInsets.all(Space.s1),
                  child: InitialsAvatar(name.isEmpty ? '?' : initials(name), size: 40),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ComingSoonCard extends StatelessWidget {
  const _ComingSoonCard({required this.icon, required this.title, required this.subtitle});
  final IconData icon;
  final String title, subtitle;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Semantics(
      enabled: false,
      button: true,
      label: '$title, coming soon',
      child: ExcludeSemantics(
        child: Opacity(
          opacity: 0.7,
          child: AppCard(
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(color: c.surfaceHover, borderRadius: BorderRadius.circular(Radii.md)),
                  child: Icon(icon, size: 22, color: c.textSecondary),
                ),
                const SizedBox(width: Space.s3),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: AppText.label.copyWith(color: c.textPrimary)),
                      Text(subtitle, style: AppText.caption.copyWith(color: c.textSecondary)),
                    ],
                  ),
                ),
                const SizedBox(width: Space.s2),
                const StatusBadge('Coming soon', icon: LucideIcons.clock),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Current + new password. The server signs out every other device and returns a fresh session.
Future<void> showChangePasswordDialog(BuildContext context) =>
    showDialog(context: context, builder: (_) => const _ChangePasswordDialog());

class _ChangePasswordDialog extends ConsumerStatefulWidget {
  const _ChangePasswordDialog();

  @override
  ConsumerState<_ChangePasswordDialog> createState() => _ChangePasswordDialogState();
}

class _ChangePasswordDialogState extends ConsumerState<_ChangePasswordDialog> {
  final _form = GlobalKey<FormState>();
  final _current = TextEditingController();
  final _next = TextEditingController();
  bool _busy = false, _obscure = true;
  String? _error;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).changePassword(_current.text, _next.text);
      if (!mounted) return;
      final messenger = ScaffoldMessenger.of(context);
      Navigator.pop(context);
      messenger.showSnackBar(const SnackBar(content: Text('Password changed. Other devices were signed out.')));
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final toggle = IconButton(
      tooltip: _obscure ? 'Show passwords' : 'Hide passwords',
      onPressed: () => setState(() => _obscure = !_obscure),
      icon: Icon(_obscure ? LucideIcons.eye : LucideIcons.eyeOff, size: 20),
    );
    return AlertDialog(
      title: const Text('Change password'),
      content: Form(
        key: _form,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_error != null) ...[AlertBanner(tone: Tone.danger, title: _error!), const SizedBox(height: Space.s3)],
            TextFormField(
              controller: _current,
              obscureText: _obscure,
              enabled: !_busy,
              autofillHints: const [AutofillHints.password],
              decoration: InputDecoration(labelText: 'Current password', suffixIcon: toggle),
              validator: (v) => (v ?? '').isEmpty ? 'Enter your current password.' : null,
            ),
            const SizedBox(height: Space.s3),
            TextFormField(
              controller: _next,
              obscureText: _obscure,
              enabled: !_busy,
              autofillHints: const [AutofillHints.newPassword],
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(labelText: 'New password'),
              validator: SignUpRules.password,
            ),
            const SizedBox(height: Space.s2),
            PasswordStrength(_next.text),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: _busy ? null : () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(onPressed: _busy ? null : _save, child: Text(_busy ? 'Saving…' : 'Change password')),
      ],
    );
  }
}
