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

  // Same setup path as the web workspace page; connect steps ship with B5.
  static const _steps = [
    ('Account approved', 'A person checked your sign-up.', true),
    ('Private workspace created', 'Your data is visible only to your workspace.', true),
    ('Connect WhatsApp', 'Link your WhatsApp Business number to send broadcasts and reply to customers.', false),
    ('Connect Meta Ads', 'Bring in your Facebook and Instagram campaigns, leads and cost per lead.', false),
    ('Import contacts', 'Upload a CSV or Excel file of customers to build your first list.', false),
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
                  const SizedBox(height: Space.s2),
                  _Checklist(_steps),
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

class _Checklist extends StatelessWidget {
  const _Checklist(this.steps);
  final List<(String, String, bool)> steps;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final done = steps.where((x) => x.$3).length;
    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.all(Space.s4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(child: Text('Set up your workspace', style: AppText.h2.copyWith(color: c.textPrimary))),
                    Text('$done of ${steps.length} done', style: AppText.caption.copyWith(color: c.textSecondary, fontFamily: monoFamily)),
                  ],
                ),
                const SizedBox(height: Space.s3),
                ClipRRect(
                  borderRadius: BorderRadius.circular(Radii.full),
                  child: SizedBox(
                    height: 6,
                    child: Stack(
                      children: [
                        Container(color: c.surfaceHover),
                        FractionallySizedBox(
                          widthFactor: done / steps.length,
                          child: const DecoratedBox(decoration: BoxDecoration(gradient: brandGradient)),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          for (final (title, body, ok) in steps) ...[
            Divider(height: 1, color: c.surfaceHover),
            Semantics(
              label: '$title, ${ok ? 'done' : 'coming soon'}',
              child: ExcludeSemantics(
                child: Padding(
                  padding: const EdgeInsets.all(Space.s4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 24,
                        height: 24,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: ok ? c.successFg : null,
                          border: ok ? null : Border.all(color: c.surfaceHover, width: 1.5),
                        ),
                        child: Icon(ok ? LucideIcons.check : LucideIcons.clock, size: 14, color: ok ? c.surface : c.textSecondary),
                      ),
                      const SizedBox(width: Space.s3),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(title, style: AppText.label.copyWith(color: ok ? c.textSecondary : c.textPrimary)),
                            const SizedBox(height: 2),
                            Text(body, style: AppText.caption.copyWith(color: c.textSecondary)),
                          ],
                        ),
                      ),
                      const SizedBox(width: Space.s2),
                      Text(
                        ok ? 'Done' : 'Coming soon',
                        style: AppText.caption.copyWith(color: ok ? c.successFg : c.textSecondary),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ],
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
