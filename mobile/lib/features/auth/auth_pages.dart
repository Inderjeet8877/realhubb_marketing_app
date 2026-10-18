import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/brand_mark.dart';
import 'login_hero.dart';

/// Shown while the stored session is restored, so signed-in users never see login flash by.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) => const AnnotatedRegion<SystemUiOverlayStyle>(
    value: SystemUiOverlayStyle.light,
    child: Scaffold(
      backgroundColor: heroNavy,
      body: Center(child: BrandSymbol(size: 84)),
    ),
  );
}

/// Static navy hero (symbol + wordmark) used above the sign-up form and on the pending page.
class NavyBrandHeader extends StatelessWidget {
  const NavyBrandHeader({super.key, this.leading});
  final Widget? leading;

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: heroNavy,
    child: SafeArea(
      bottom: false,
      child: SizedBox(
        height: 140,
        child: Stack(
          children: [
            const Center(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  BrandSymbol(size: 44),
                  SizedBox(width: Space.s3),
                  BrandWordmark(height: 26, onDark: true),
                ],
              ),
            ),
            if (leading != null) Positioned(left: Space.s1, top: Space.s1, child: leading!),
          ],
        ),
      ),
    ),
  );
}

/// After sign-up (202) or a sign-in attempt on a pending account.
class PendingScreen extends StatelessWidget {
  const PendingScreen({super.key, this.message});
  final String? message;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: heroNavy,
        body: Column(
          children: [
            const NavyBrandHeader(),
            Expanded(
              child: Container(
                width: double.infinity,
                decoration: BoxDecoration(
                  color: c.surface,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
                ),
                child: SafeArea(
                  top: false,
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(Space.s6, Space.s10, Space.s6, Space.s8),
                    child: Column(
                      children: [
                        Container(
                          width: 72,
                          height: 72,
                          decoration: BoxDecoration(color: c.brandSubtle, shape: BoxShape.circle),
                          child: Icon(LucideIcons.hourglass, size: 32, color: c.brandText),
                        ),
                        const SizedBox(height: Space.s5),
                        Semantics(
                          header: true,
                          child: Text(
                            message == null ? 'Request received' : 'Awaiting approval',
                            style: AppText.h1.copyWith(color: c.textPrimary),
                            textAlign: TextAlign.center,
                          ),
                        ),
                        const SizedBox(height: Space.s2),
                        Text(
                          message ?? "An admin will review it. You'll be able to sign in once it's approved.",
                          style: AppText.bodyL.copyWith(color: c.textSecondary),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: Space.s8),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton.icon(
                            onPressed: () => context.go('/login'),
                            icon: const Icon(LucideIcons.arrowLeft, size: 18),
                            label: const Text('Back to sign in'),
                          ),
                        ),
                      ],
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
}
