import 'package:broadzen/app/providers.dart';
import 'package:broadzen/main.dart';
import 'package:broadzen/theme/tokens.dart';
import 'package:broadzen/widgets/brand_mark.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

double contrast(Color a, Color b) {
  final l1 = a.computeLuminance(), l2 = b.computeLuminance();
  return (l1 > l2 ? l1 + 0.05 : l2 + 0.05) / (l1 > l2 ? l2 + 0.05 : l1 + 0.05);
}

Future<void> pumpApp(WidgetTester tester, Map<String, Object> prefs) async {
  SharedPreferences.setMockInitialValues(prefs);
  final p = await SharedPreferences.getInstance();
  await tester.pumpWidget(ProviderScope(overrides: [prefsProvider.overrideWithValue(p)], child: const BroadzenApp()));
  await tester.pump();
}

void main() {
  // Guards the design rule "all text tokens pass WCAG AA (4.5:1) on surface"
  // so a future colour tweak can't silently break readability.
  for (final (name, c) in [('light', AppColors.light), ('dark', AppColors.dark)]) {
    test('$name text tokens meet WCAG AA on surface and canvas', () {
      final texts = {
        'textPrimary': c.textPrimary,
        'textSecondary': c.textSecondary,
        'textTertiary': c.textTertiary,
        'brandText': c.brandText,
        'successFg': c.successFg,
        'dangerFg': c.dangerFg,
        'warningFg': c.warningFg,
        'infoFg': c.infoFg,
      };
      for (final e in texts.entries) {
        expect(contrast(e.value, c.surface), greaterThanOrEqualTo(4.5), reason: '${e.key} on surface');
      }
      expect(contrast(c.textSecondary, c.canvas), greaterThanOrEqualTo(4.5));
      expect(contrast(c.onBrand, c.brand), greaterThanOrEqualTo(4.5), reason: 'onBrand on brand button');
      // Active nav pill / selected chip: brandText on the (translucent in dark) brandSubtle tint.
      expect(contrast(c.brandText, Color.alphaBlend(c.brandSubtle, c.surface)), greaterThanOrEqualTo(4.5));
      expect(contrast(c.onBrand, c.successSolid), greaterThanOrEqualTo(4.5), reason: 'onBrand on success button');
    });
  }

  testWidgets('signed-out start shows the login screen', (tester) async {
    await pumpApp(tester, {});
    expect(find.byType(BrandSymbol), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget);
  });

  testWidgets('login with animations disabled: instant layout, empty submit shows error', (tester) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    await pumpApp(tester, {});
    expect(find.text('Welcome back'), findsOneWidget);
    await tester.tap(find.text('Sign in'));
    await tester.pump();
    expect(find.text('Enter your email and password.'), findsOneWidget);
  });

  testWidgets('login hero shows the full tagline when animations are disabled', (tester) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    await pumpApp(tester, {});
    expect(find.text('Broadcast smarter. Grow faster.'), findsOneWidget);
  });

  testWidgets('dev preview opens the shell with five tabs', (tester) async {
    await pumpApp(tester, {'dev_preview': true});
    for (final tab in ['Home', 'Inbox', 'Leads', 'Contacts', 'More']) {
      expect(find.text(tab), findsWidgets);
    }
    // Home starts real data loads; unmount and flush their zero-delay timers.
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });
}
