import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/brand_mark.dart';
import '../../widgets/ui.dart';
import 'auth_controller.dart';
import 'login_hero.dart';

/// Animated login: brand-blue hero (drifting bubbles + self-building logo)
/// over a sheet that slides up with a staggered form. Honours the system
/// "remove animations" setting by showing the final state immediately.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

enum _Phase { idle, busy, done }

class _LoginScreenState extends ConsumerState<LoginScreen> with TickerProviderStateMixin {
  late final _intro = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800));
  late final _drift = AnimationController(vsync: this, duration: const Duration(seconds: 24));
  late final _shake = AnimationController(vsync: this, duration: const Duration(milliseconds: 420));
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;
  _Phase _phase = _Phase.idle;
  String? _error;
  bool _reduceMotion = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reduceMotion = MediaQuery.disableAnimationsOf(context);
    if (_reduceMotion) {
      _intro.value = 1;
      _drift.stop();
    } else {
      if (!_intro.isAnimating && _intro.value == 0) _intro.forward();
      if (!_drift.isAnimating) _drift.repeat();
    }
  }

  @override
  void dispose() {
    _intro.dispose();
    _drift.dispose();
    _shake.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action, {bool needsFields = false}) async {
    if (needsFields && (_email.text.trim().isEmpty || _password.text.isEmpty)) {
      return _fail('Enter your email and password.');
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _phase = _Phase.busy;
      _error = null;
    });
    try {
      await action();
      if (mounted) setState(() => _phase = _Phase.done);
    } catch (e) {
      _fail(e is StateError ? e.message : '$e');
    }
  }

  void _fail(String message) {
    if (!mounted) return;
    setState(() {
      _phase = _Phase.idle;
      _error = message;
    });
    HapticFeedback.mediumImpact();
    if (!_reduceMotion) _shake.forward(from: 0);
  }

  /// Fade + rise for the slice [start, start+0.25] of the intro.
  Widget _reveal(double start, Widget child, {double rise = 18}) {
    final a = CurvedAnimation(
      parent: _intro,
      curve: Interval(start, math.min(1, start + 0.25), curve: Curves.easeOutCubic),
    );
    return AnimatedBuilder(
      animation: a,
      builder: (_, child) => Opacity(
        opacity: a.value,
        child: Transform.translate(offset: Offset(0, (1 - a.value) * rise), child: child),
      ),
      child: child,
    );
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final size = MediaQuery.sizeOf(context);
    final keyboard = MediaQuery.viewInsetsOf(context).bottom > 0;
    final wide = size.width >= 720;

    final hero = AnimatedBuilder(
      animation: Listenable.merge([_intro, _drift]),
      builder: (_, _) => Stack(
        fit: StackFit.expand,
        children: [
          HeroBackdrop(t: _drift.value, dark: dark),
          SafeArea(
            bottom: false,
            child: Center(
              child: _HeroBrand(intro: _intro.value, compact: keyboard && !wide),
            ),
          ),
        ],
      ),
    );

    final form = AnimatedBuilder(
      animation: _shake,
      builder: (_, child) => Transform.translate(
        offset: Offset(math.sin(_shake.value * math.pi * 5) * 10 * (1 - _shake.value), 0),
        child: child,
      ),
      child: _form(context),
    );

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: wide && !dark ? SystemUiOverlayStyle.dark : SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: context.colors.surface,
        body: wide
            ? Row(
                children: [
                  Expanded(child: hero),
                  Expanded(
                    child: Center(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.all(Space.s8),
                        child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 420), child: form),
                      ),
                    ),
                  ),
                ],
              )
            : Column(
                children: [
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 280),
                    curve: Curves.easeOutCubic,
                    height: keyboard ? 150 + MediaQuery.paddingOf(context).top : size.height * 0.42,
                    child: hero,
                  ),
                  Expanded(child: _sheet(context, form)),
                ],
              ),
      ),
    );
  }

  /// White sheet that slides up over the hero's bottom edge.
  Widget _sheet(BuildContext context, Widget form) {
    final c = context.colors;
    final slide = CurvedAnimation(
      parent: _intro,
      curve: const Interval(0.3, 0.75, curve: Curves.easeOutCubic),
    );
    return AnimatedBuilder(
      animation: slide,
      builder: (_, child) => Transform.translate(offset: Offset(0, (1 - slide.value) * 120), child: child),
      child: Transform.translate(
        offset: const Offset(0, -28),
        child: Container(
          decoration: BoxDecoration(
            color: c.surface,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
            // On dark the sheet and hero are both navy — a hairline keeps the edge readable.
            border: Theme.of(context).brightness == Brightness.dark ? Border.all(color: c.borderStrong) : null,
            boxShadow: [
              BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 24, offset: const Offset(0, -6)),
            ],
          ),
          child: SafeArea(
            top: false,
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(Space.s6, Space.s6, Space.s6, Space.s8),
              child: form,
            ),
          ),
        ),
      ),
    );
  }

  Widget _form(BuildContext context) {
    final c = context.colors;
    final auth = ref.read(authProvider.notifier);
    final busy = _phase != _Phase.idle;
    void signIn() => _run(() => auth.signInWithEmail(_email.text.trim(), _password.text), needsFields: true);
    var i = 0;
    double next() => 0.5 + (i++) * 0.06;

    return AutofillGroup(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _reveal(next(), Text('Welcome back', style: AppText.h1.copyWith(color: c.textPrimary))),
          const SizedBox(height: Space.s1),
          _reveal(next(), Text('Sign in to your workspace', style: AppText.bodyL.copyWith(color: c.textSecondary))),
          const SizedBox(height: Space.s5),
          AnimatedSize(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 220),
              transitionBuilder: (child, a) => FadeTransition(
                opacity: a,
                child: SlideTransition(
                  position: Tween(begin: const Offset(0, -0.3), end: Offset.zero).animate(a),
                  child: child,
                ),
              ),
              child: _error == null
                  ? const SizedBox(width: double.infinity)
                  : Padding(
                      key: ValueKey(_error),
                      padding: const EdgeInsets.only(bottom: Space.s4),
                      child: Semantics(
                        liveRegion: true,
                        child: AlertBanner(tone: Tone.danger, title: _error!),
                      ),
                    ),
            ),
          ),
          _reveal(
            next(),
            _GlowField(
              child: TextField(
                controller: _email,
                enabled: !busy,
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email],
                textInputAction: TextInputAction.next,
                onChanged: (_) => _error == null ? null : setState(() => _error = null),
                decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(LucideIcons.mail, size: 20)),
              ),
            ),
          ),
          const SizedBox(height: Space.s3),
          _reveal(
            next(),
            _GlowField(
              child: TextField(
                controller: _password,
                enabled: !busy,
                obscureText: _obscure,
                autofillHints: const [AutofillHints.password],
                onSubmitted: (_) => signIn(),
                onChanged: (_) => _error == null ? null : setState(() => _error = null),
                decoration: InputDecoration(
                  labelText: 'Password',
                  prefixIcon: const Icon(LucideIcons.lock, size: 20),
                  suffixIcon: IconButton(
                    tooltip: _obscure ? 'Show password' : 'Hide password',
                    onPressed: () => setState(() => _obscure = !_obscure),
                    icon: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 200),
                      transitionBuilder: (child, a) => RotationTransition(
                        turns: Tween(begin: 0.75, end: 1.0).animate(a),
                        child: ScaleTransition(scale: a, child: child),
                      ),
                      child: Icon(_obscure ? LucideIcons.eye : LucideIcons.eyeOff, key: ValueKey(_obscure), size: 20),
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: Space.s5),
          _reveal(next(), _SignInButton(phase: _phase, onPressed: busy ? null : signIn)),
          const SizedBox(height: Space.s4),
          _reveal(
            next(),
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
          ),
          const SizedBox(height: Space.s4),
          _reveal(
            next(),
            OutlinedButton.icon(
              onPressed: busy ? null : () => _run(auth.signInWithGoogle),
              icon: const _GoogleG(),
              label: const Text('Continue with Google'),
            ),
          ),
          const SizedBox(height: Space.s6),
          _reveal(
            next(),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(LucideIcons.shieldCheck, size: 14, color: c.textTertiary),
                const SizedBox(width: Space.s1),
                Flexible(
                  child: Text(
                    'Access is restricted to authorised users',
                    textAlign: TextAlign.center,
                    style: AppText.caption.copyWith(color: c.textTertiary),
                  ),
                ),
              ],
            ),
          ),
          if (kDebugMode && !AuthController.firebaseConfigured)
            _reveal(
              next(),
              Padding(
                padding: const EdgeInsets.only(top: Space.s3),
                child: TextButton(
                  onPressed: auth.enterDevPreview,
                  child: const Text('Continue in dev preview (debug only)'),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Logo builds itself, then wordmark and tagline rise in.
class _HeroBrand extends StatelessWidget {
  const _HeroBrand({required this.intro, required this.compact});
  final double intro;
  final bool compact;

  double _seg(double a, double b) => Curves.easeOutCubic.transform(((intro - a) / (b - a)).clamp(0.0, 1.0));

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final word = _seg(0.4, 0.65), tag = _seg(0.5, 0.75);
    final mark = BrandMark(
      size: compact ? 48 : 76,
      inverted: Theme.of(context).brightness == Brightness.light, // white tile on blue; blue tile on dark
      progress: (intro / 0.6).clamp(0.0, 1.0),
    );
    final wordmark = Text(
      'broadzen',
      style: TextStyle(
        fontFamily: 'Sora',
        fontWeight: FontWeight.w700,
        fontSize: compact ? 26 : 36,
        letterSpacing: compact ? -0.8 : -1.1,
        color: c.onBrand,
      ),
    );
    Widget rise(double v, Widget w) => Opacity(
      opacity: v,
      child: Transform.translate(offset: Offset(0, (1 - v) * 14), child: w),
    );

    if (compact) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          mark,
          const SizedBox(width: Space.s3),
          rise(word, wordmark),
        ],
      );
    }
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        mark,
        const SizedBox(height: Space.s4),
        rise(word, wordmark),
        const SizedBox(height: Space.s1),
        rise(
          tag,
          Text(
            'WhatsApp + Meta Ads, made simple',
            style: AppText.bodyL.copyWith(color: c.onBrand.withValues(alpha: 0.85)),
          ),
        ),
      ],
    );
  }
}

/// Soft brand glow around a focused field.
class _GlowField extends StatefulWidget {
  const _GlowField({required this.child});
  final Widget child;

  @override
  State<_GlowField> createState() => _GlowFieldState();
}

class _GlowFieldState extends State<_GlowField> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Focus(
      onFocusChange: (f) => setState(() => _focused = f),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(Radii.md),
          boxShadow: [if (_focused) BoxShadow(color: c.brand.withValues(alpha: 0.22), blurRadius: 14, spreadRadius: 1)],
        ),
        child: widget.child,
      ),
    );
  }
}

/// Sign in → spinner → check. Width animates so the spinner state is a pill.
class _SignInButton extends StatelessWidget {
  const _SignInButton({required this.phase, required this.onPressed});
  final _Phase phase;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final done = phase == _Phase.done;
    return Center(
      child: LayoutBuilder(
        builder: (context, box) {
          return AnimatedContainer(
            duration: const Duration(milliseconds: 260),
            curve: Curves.easeOutCubic,
            width: phase == _Phase.idle ? box.maxWidth : 52,
            height: 52,
            child: FilledButton(
              onPressed: onPressed,
              style: FilledButton.styleFrom(
                padding: EdgeInsets.zero,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(phase == _Phase.idle ? Radii.md : 26),
                ),
                backgroundColor: done ? c.successSolid : c.brand,
                disabledBackgroundColor: done ? c.successSolid : c.brand,
                disabledForegroundColor: c.onBrand,
              ),
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 200),
                child: switch (phase) {
                  _Phase.idle => const Text('Sign in', key: ValueKey('t')),
                  _Phase.busy => SizedBox.square(
                    key: const ValueKey('b'),
                    dimension: 22,
                    child: CircularProgressIndicator(strokeWidth: 2.5, color: c.onBrand),
                  ),
                  _Phase.done => const Icon(LucideIcons.check, key: ValueKey('d')),
                },
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Google "G" in brand colours (Google sign-in branding guidelines).
class _GoogleG extends StatelessWidget {
  const _GoogleG();

  @override
  Widget build(BuildContext context) =>
      const SizedBox.square(dimension: 18, child: CustomPaint(painter: _GooglePainter()));
}

class _GooglePainter extends CustomPainter {
  const _GooglePainter();

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width, stroke = s * 0.2;
    final rect = Rect.fromCircle(center: Offset(s / 2, s / 2), radius: s / 2 - stroke / 2);
    Paint p(int color) => Paint()
      ..color = Color(color)
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke;
    const d = math.pi / 180;
    canvas
      ..drawArc(rect, -40 * d, -95 * d, false, p(0xFFEA4335)) // red, top
      ..drawArc(rect, -135 * d, -90 * d, false, p(0xFFFBBC05)) // yellow, left
      ..drawArc(rect, 135 * d, -90 * d, false, p(0xFF34A853)) // green, bottom
      ..drawArc(rect, 45 * d, -45 * d, false, p(0xFF4285F4)) // blue, right
      ..drawLine(Offset(s / 2, s / 2), Offset(s - stroke / 2, s / 2), p(0xFF4285F4));
  }

  @override
  bool shouldRepaint(_GooglePainter old) => false;
}
