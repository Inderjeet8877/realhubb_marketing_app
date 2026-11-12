import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

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
                  _Checklist(setupSteps(me), workspace: me?.workspaceName ?? ''),
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

const _support = 'realhubbmktg@gmail.com';

/// One setup step. [how] is shown under "How to finish" while the step is open.
typedef SetupStep = ({String title, String body, bool done, String status, List<String> how, String? ask});

/// Same setup path as the web workspace page. WhatsApp is connected by our team
/// from the admin panel; Meta Ads and contacts ship with the rest of B5.
List<SetupStep> setupSteps(Me? me) {
  final wa = me?.whatsappPhone;
  final name = me?.whatsappName;
  return [
    (title: 'Account approved', body: 'A person checked your sign-up.', done: true, status: '', how: const [], ask: null),
    (title: 'Private workspace created', body: 'Your data is visible only to your workspace.', done: true, status: '', how: const [], ask: null),
    (
      title: 'Connect WhatsApp',
      body: wa != null
          ? 'Connected: $wa${name != null ? ' ($name)' : ''}.'
          : 'Link your WhatsApp Business number to send broadcasts and reply to customers.',
      done: wa != null,
      status: 'Our team connects this',
      how: const [
        'A Meta Business account for your company (business.facebook.com).',
        'A phone number that is not in use on the WhatsApp or WhatsApp Business app. A number in use there has to be removed from the app first.',
        'Email us. We send you the steps to give our team access, then connect the number and this step turns Done.',
      ],
      ask: 'Connect WhatsApp',
    ),
    (
      title: 'Connect Meta Ads',
      body: 'Bring in your Facebook and Instagram campaigns, leads and cost per lead.',
      done: false,
      status: 'Coming soon',
      how: const [
        'Have admin access to your ad account and to the Facebook Page that runs your lead ads.',
        'Self-serve connection is being built. Email us if you want it set up as soon as it is ready.',
      ],
      ask: 'Connect Meta Ads',
    ),
    (
      title: 'Import contacts',
      body: 'Upload a CSV or Excel file of customers to build your first list.',
      done: false,
      status: 'Coming soon',
      how: const [
        'Import is being built. It needs a connected WhatsApp number, so connect that first.',
        'Get a CSV or Excel file ready with a name and a mobile number in each row. Numbers are checked and duplicates merged on import.',
      ],
      ask: null,
    ),
  ];
}

class _Checklist extends StatelessWidget {
  const _Checklist(this.steps, {required this.workspace});
  final List<SetupStep> steps;
  final String workspace;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final done = steps.where((x) => x.done).length;
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
                          alignment: Alignment.centerLeft,
                          widthFactor: done / steps.length,
                          heightFactor: 1,
                          child: const DecoratedBox(decoration: BoxDecoration(gradient: brandGradient)),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          for (final x in steps) ...[
            Divider(height: 1, color: c.surfaceHover),
            _StepRow(x, workspace: workspace),
          ],
        ],
      ),
    );
  }
}

class _StepRow extends StatelessWidget {
  const _StepRow(this.step, {required this.workspace});
  final SetupStep step;
  final String workspace;

  Future<void> _email(BuildContext context) async {
    final uri = Uri(scheme: 'mailto', path: _support, query: 'subject=${Uri.encodeComponent('${step.ask}: $workspace')}');
    if (!await launchUrl(uri) && context.mounted) showSnack(context, 'No email app found. Write to $_support', tone: Tone.danger);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final ok = step.done;
    final head = Row(
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
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: Text(step.title, style: AppText.label.copyWith(color: ok ? c.textSecondary : c.textPrimary))),
                  const SizedBox(width: Space.s2),
                  Text(ok ? 'Done' : step.status, style: AppText.caption.copyWith(color: ok ? c.successFg : c.textSecondary)),
                ],
              ),
              const SizedBox(height: 2),
              Text(step.body, style: AppText.caption.copyWith(color: c.textSecondary)),
            ],
          ),
        ),
      ],
    );
    if (ok || step.how.isEmpty) {
      return Semantics(
        label: '${step.title}, ${ok ? 'done' : step.status}',
        child: ExcludeSemantics(child: Padding(padding: const EdgeInsets.all(Space.s4), child: head)),
      );
    }
    const indent = 24.0 + Space.s3;
    return Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        tilePadding: const EdgeInsets.fromLTRB(Space.s4, Space.s2, Space.s4, Space.s1),
        childrenPadding: const EdgeInsets.fromLTRB(Space.s4 + indent, 0, Space.s4, Space.s4),
        expandedCrossAxisAlignment: CrossAxisAlignment.start,
        showTrailingIcon: false,
        title: head,
        subtitle: Padding(
          padding: const EdgeInsets.only(left: indent, top: Space.s2),
          child: Row(
            children: [
              Text('How to finish', style: AppText.label.copyWith(color: c.brandText)),
              const SizedBox(width: 2),
              Icon(LucideIcons.chevronDown, size: 16, color: c.brandText),
            ],
          ),
        ),
        children: [
          for (final (i, h) in step.how.indexed)
            Padding(
              padding: const EdgeInsets.only(bottom: Space.s2),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(width: 20, child: Text('${i + 1}.', style: AppText.caption.copyWith(color: c.textSecondary, fontFamily: monoFamily))),
                  Expanded(child: Text(h, style: AppText.caption.copyWith(color: c.textSecondary))),
                ],
              ),
            ),
          if (step.ask != null) ...[
            const SizedBox(height: Space.s2),
            OutlinedButton.icon(
              onPressed: () => _email(context),
              icon: const Icon(LucideIcons.mail, size: 16),
              label: const Text('Email us to start'),
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
