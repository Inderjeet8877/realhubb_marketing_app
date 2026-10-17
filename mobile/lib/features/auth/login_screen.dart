import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/brand_mark.dart';
import '../../widgets/ui.dart';
import 'auth_controller.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true, _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (e) {
      setState(() => _error = e is StateError ? e.message : '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final auth = ref.read(authProvider.notifier);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(Space.s6),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: AutofillGroup(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Center(child: BrandLockup(height: 44)),
                    const SizedBox(height: Space.s2),
                    Text(
                      'Sign in to your workspace',
                      textAlign: TextAlign.center,
                      style: AppText.bodyL.copyWith(color: c.textSecondary),
                    ),
                    const SizedBox(height: Space.s8),
                    if (_error != null) ...[
                      AlertBanner(tone: Tone.danger, title: _error!),
                      const SizedBox(height: Space.s4),
                    ],
                    TextField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(
                        labelText: 'Email',
                        prefixIcon: Icon(LucideIcons.mail, size: 20),
                      ),
                    ),
                    const SizedBox(height: Space.s3),
                    TextField(
                      controller: _password,
                      obscureText: _obscure,
                      autofillHints: const [AutofillHints.password],
                      onSubmitted: (_) => _run(() => auth.signInWithEmail(_email.text.trim(), _password.text)),
                      decoration: InputDecoration(
                        labelText: 'Password',
                        prefixIcon: const Icon(LucideIcons.lock, size: 20),
                        suffixIcon: IconButton(
                          tooltip: _obscure ? 'Show password' : 'Hide password',
                          icon: Icon(_obscure ? LucideIcons.eye : LucideIcons.eyeOff, size: 20),
                          onPressed: () => setState(() => _obscure = !_obscure),
                        ),
                      ),
                    ),
                    const SizedBox(height: Space.s5),
                    FilledButton(
                      onPressed: _busy
                          ? null
                          : () => _run(() => auth.signInWithEmail(_email.text.trim(), _password.text)),
                      child: _busy
                          ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Text('Sign in'),
                    ),
                    const SizedBox(height: Space.s4),
                    Row(
                      children: [
                        const Expanded(child: Divider()),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: Space.s3),
                          child: Text('or', style: AppText.caption.copyWith(color: c.textTertiary)),
                        ),
                        const Expanded(child: Divider()),
                      ],
                    ),
                    const SizedBox(height: Space.s4),
                    OutlinedButton.icon(
                      onPressed: _busy ? null : () => _run(auth.signInWithGoogle),
                      icon: const Icon(LucideIcons.logIn, size: 18),
                      label: const Text('Continue with Google'),
                    ),
                    const SizedBox(height: Space.s6),
                    Text(
                      'Access is restricted to authorised users.',
                      textAlign: TextAlign.center,
                      style: AppText.caption.copyWith(color: c.textTertiary),
                    ),
                    if (kDebugMode && !AuthController.firebaseConfigured) ...[
                      const SizedBox(height: Space.s4),
                      TextButton(
                        onPressed: auth.enterDevPreview,
                        child: const Text('Continue in dev preview (debug only)'),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
