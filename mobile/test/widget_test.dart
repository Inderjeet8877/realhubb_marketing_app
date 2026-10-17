import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:broadzen/main.dart';
import 'package:broadzen/theme/tokens.dart';

double _luminance(Color c) => c.computeLuminance();
double contrast(Color a, Color b) {
  final l1 = _luminance(a), l2 = _luminance(b);
  return (l1 > l2 ? l1 + 0.05 : l2 + 0.05) / (l1 > l2 ? l2 + 0.05 : l1 + 0.05);
}

void main() {
  // Guards the design rule "all text tokens pass WCAG AA (4.5:1) on surface"
  // so a future colour tweak can't silently break readability.
  for (final (name, c) in [
    ('light', AppColors.light),
    ('dark', AppColors.dark),
  ]) {
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
        expect(
          contrast(e.value, c.surface),
          greaterThanOrEqualTo(4.5),
          reason: '${e.key} on surface',
        );
      }
      // tertiary is allowed on white only in light mode (documented in DESIGN_PLAN §3.2)
      expect(contrast(c.textSecondary, c.canvas), greaterThanOrEqualTo(4.5));
      expect(
        contrast(c.onBrand, c.brand),
        greaterThanOrEqualTo(4.5),
        reason: 'white on brand button',
      );
      expect(
        contrast(c.onBrand, c.successSolid),
        greaterThanOrEqualTo(4.5),
        reason: 'white on success button',
      );
    });
  }

  testWidgets('splash shows the wordmark', (tester) async {
    await tester.pumpWidget(const BroadzenApp());
    expect(find.text('broadzen'), findsOneWidget);
  });
}
