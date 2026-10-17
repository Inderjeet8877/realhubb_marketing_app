import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'theme/app_theme.dart';
import 'theme/tokens.dart';
import 'widgets/brand_mark.dart';

void main() {
  runApp(const ProviderScope(child: BroadzenApp()));
}

class BroadzenApp extends StatelessWidget {
  const BroadzenApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Broadzen',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      themeMode: ThemeMode.system,
      home: const SplashScreen(),
    );
  }
}

/// M0 placeholder start screen. Replaced by the auth gate in M1.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final dark = Theme.of(context).brightness == Brightness.dark;
    // Blue/dark backdrop in both modes → always light status-bar icons.
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: dark ? c.canvas : c.brand,
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              BrandLockup(height: 48, onBrand: !dark),
              const SizedBox(height: Space.s4),
              Text(
                'Marketing automation, made simple',
                style: AppText.bodyL.copyWith(
                  color: c.onBrand.withValues(alpha: 0.85),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
