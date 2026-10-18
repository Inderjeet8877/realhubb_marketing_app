import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import 'auth_controller.dart';
import 'auth_pages.dart';
import 'login_hero.dart';

/// Same rules as the server's zod schema (src/app/api/auth/signup), so most
/// mistakes are caught before the request.
abstract final class SignUpRules {
  static const minPassword = 10;
  static final _email = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

  static String? name(String? v) => (v ?? '').trim().length < 2 ? 'Enter your name.' : null;
  static String? email(String? v) => _email.hasMatch((v ?? '').trim()) ? null : 'Enter a valid email.';
  static String? workspace(String? v) => (v ?? '').trim().length < 2 ? 'Enter your company or workspace name.' : null;
  static String? password(String? v) =>
      (v ?? '').length < minPassword ? 'Password must be at least $minPassword characters.' : null;
  static String? confirm(String password, String? v) => v == password ? null : "Passwords don't match.";

  /// 0 = too short, 1 weak, 2 fair, 3 strong. Length counts most; variety adds a little.
  static int strength(String p) {
    if (p.length < minPassword) return 0;
    final variety = [
      RegExp('[a-z]'),
      RegExp('[A-Z]'),
      RegExp('[0-9]'),
      RegExp(r'[^A-Za-z0-9]'),
    ].where((r) => r.hasMatch(p)).length;
    return p.length >= 14 && variety >= 3
        ? 3
        : variety >= 3 || p.length >= 14
        ? 2
        : 1;
  }
}

class SignUpScreen extends ConsumerStatefulWidget {
  const SignUpScreen({super.key});

  @override
  ConsumerState<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends ConsumerState<SignUpScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _workspace = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _obscure = true, _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_name, _email, _workspace, _password, _confirm]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() => _busy = true);
    try {
      await ref
          .read(authProvider.notifier)
          .signUp(
            name: _name.text.trim(),
            email: _email.text.trim(),
            workspace: _workspace.text.trim(),
            password: _password.text,
          );
      if (mounted) context.go('/pending');
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _back() => context.canPop() ? context.pop() : context.go('/login');

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: heroNavy,
        body: Column(
          children: [
            NavyBrandHeader(
              leading: IconButton(
                tooltip: 'Back to sign in',
                color: Colors.white,
                onPressed: _back,
                icon: const Icon(LucideIcons.arrowLeft),
              ),
            ),
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  color: c.surface,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
                  border: Theme.of(context).brightness == Brightness.dark ? Border.all(color: c.borderStrong) : null,
                ),
                child: SafeArea(
                  top: false,
                  child: Center(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(Space.s6, Space.s6, Space.s6, Space.s8),
                      child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 420), child: _fields(c)),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _fields(AppColors c) {
    InputDecoration deco(String label, IconData icon, {String? helper}) =>
        InputDecoration(labelText: label, helperText: helper, prefixIcon: Icon(icon, size: 20));
    return Form(
      key: _form,
      child: AutofillGroup(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Create your account', style: AppText.h1.copyWith(color: c.textPrimary)),
            const SizedBox(height: Space.s1),
            Text(
              'An admin approves every new workspace before you can sign in.',
              style: AppText.body.copyWith(color: c.textSecondary),
            ),
            const SizedBox(height: Space.s5),
            if (_error != null) ...[
              Semantics(
                liveRegion: true,
                child: AlertBanner(tone: Tone.danger, title: _error!),
              ),
              const SizedBox(height: Space.s4),
            ],
            TextFormField(
              controller: _name,
              enabled: !_busy,
              textCapitalization: TextCapitalization.words,
              autofillHints: const [AutofillHints.name],
              textInputAction: TextInputAction.next,
              validator: SignUpRules.name,
              decoration: deco('Your name', LucideIcons.user),
            ),
            const SizedBox(height: Space.s3),
            TextFormField(
              controller: _email,
              enabled: !_busy,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              textInputAction: TextInputAction.next,
              validator: SignUpRules.email,
              decoration: deco('Email', LucideIcons.mail),
            ),
            const SizedBox(height: Space.s3),
            TextFormField(
              controller: _workspace,
              enabled: !_busy,
              textCapitalization: TextCapitalization.words,
              autofillHints: const [AutofillHints.organizationName],
              textInputAction: TextInputAction.next,
              validator: SignUpRules.workspace,
              decoration: deco('Company / workspace name', LucideIcons.building2),
            ),
            const SizedBox(height: Space.s3),
            TextFormField(
              controller: _password,
              enabled: !_busy,
              obscureText: _obscure,
              autofillHints: const [AutofillHints.newPassword],
              textInputAction: TextInputAction.next,
              validator: SignUpRules.password,
              onChanged: (_) => setState(() {}),
              decoration: deco('Password', LucideIcons.lock).copyWith(
                suffixIcon: IconButton(
                  tooltip: _obscure ? 'Show password' : 'Hide password',
                  onPressed: () => setState(() => _obscure = !_obscure),
                  icon: Icon(_obscure ? LucideIcons.eye : LucideIcons.eyeOff, size: 20),
                ),
              ),
            ),
            const SizedBox(height: Space.s2),
            PasswordStrength(_password.text),
            const SizedBox(height: Space.s3),
            TextFormField(
              controller: _confirm,
              enabled: !_busy,
              obscureText: _obscure,
              textInputAction: TextInputAction.done,
              onFieldSubmitted: (_) => _submit(),
              validator: (v) => SignUpRules.confirm(_password.text, v),
              decoration: deco('Confirm password', LucideIcons.lockKeyhole),
            ),
            const SizedBox(height: Space.s5),
            SizedBox(
              height: 52,
              child: FilledButton(
                onPressed: _busy ? null : _submit,
                child: _busy
                    ? SizedBox.square(
                        dimension: 22,
                        child: CircularProgressIndicator(strokeWidth: 2.5, color: c.onBrand),
                      )
                    : const Text('Request account'),
              ),
            ),
            const SizedBox(height: Space.s3),
            TextButton(onPressed: _busy ? null : _back, child: const Text('Already have an account? Sign in')),
          ],
        ),
      ),
    );
  }
}

/// Bar + text label (never colour alone).
class PasswordStrength extends StatelessWidget {
  const PasswordStrength(this.password, {super.key});
  final String password;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final s = SignUpRules.strength(password);
    final (label, color) = switch (s) {
      0 => (
        password.isEmpty
            ? 'At least ${SignUpRules.minPassword} characters'
            : '${SignUpRules.minPassword - password.length} more characters needed',
        c.textTertiary,
      ),
      1 => ('Weak: add more characters or mix in numbers and symbols', c.dangerFg),
      2 => ('Fair: a longer passphrase is stronger', c.warningFg),
      _ => ('Strong password', c.successFg),
    };
    return Semantics(
      liveRegion: true,
      label: 'Password strength: $label',
      child: ExcludeSemantics(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(Radii.full),
              child: LinearProgressIndicator(value: s / 3, minHeight: 4, color: color, backgroundColor: c.surfaceHover),
            ),
            const SizedBox(height: Space.s1),
            Text(label, style: AppText.caption.copyWith(color: color)),
          ],
        ),
      ),
    );
  }
}
