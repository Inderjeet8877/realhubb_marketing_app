import 'package:flutter/material.dart';

import 'tokens.dart';

/// Type scale from the Figma text styles (DESIGN_PLAN §3.4).
/// Sora = brand (display, H1, KPI); Inter = UI. Sora lacks ₹, so it falls back to Inter.
abstract final class AppText {
  static const _sora = 'Sora';
  static const _inter = 'Inter';
  static const _soraFallback = [_inter];
  static const _tabular = [FontFeature.tabularFigures()];

  static const display = TextStyle(
    fontFamily: _sora,
    fontFamilyFallback: _soraFallback,
    fontSize: 32,
    height: 40 / 32,
    fontWeight: FontWeight.w700,
  );
  static const h1 = TextStyle(
    fontFamily: _sora,
    fontFamilyFallback: _soraFallback,
    fontSize: 24,
    height: 32 / 24,
    fontWeight: FontWeight.w600,
  );
  static const h2 = TextStyle(fontFamily: _inter, fontSize: 18, height: 28 / 18, fontWeight: FontWeight.w600);
  static const h3 = TextStyle(fontFamily: _inter, fontSize: 16, height: 24 / 16, fontWeight: FontWeight.w600);
  /// Numbers in mono, shared with the web (JetBrains Mono).
  static const kpi = TextStyle(
    fontFamily: monoFamily,
    fontSize: 24,
    height: 32 / 24,
    fontWeight: FontWeight.w500,
    fontFeatures: _tabular,
  );
  static const bodyL = TextStyle(fontFamily: _inter, fontSize: 16, height: 24 / 16, fontWeight: FontWeight.w400);
  static const body = TextStyle(fontFamily: _inter, fontSize: 14, height: 20 / 14, fontWeight: FontWeight.w400);
  static const label = TextStyle(fontFamily: _inter, fontSize: 14, height: 20 / 14, fontWeight: FontWeight.w500);
  static const caption = TextStyle(fontFamily: _inter, fontSize: 12, height: 16 / 12, fontWeight: FontWeight.w500);
  static const overline = TextStyle(
    fontFamily: _inter,
    fontSize: 12,
    height: 16 / 12,
    fontWeight: FontWeight.w600,
    letterSpacing: 0.48,
  );
}

ThemeData buildTheme(Brightness brightness) {
  final c = brightness == Brightness.light ? AppColors.light : AppColors.dark;
  final scheme = ColorScheme(
    brightness: brightness,
    primary: c.brand,
    onPrimary: c.onBrand,
    primaryContainer: c.brandSubtle,
    onPrimaryContainer: c.brandText,
    secondary: c.mint,
    onSecondary: const Color(0xFF064E3B),
    // M3 uses secondaryContainer for selected segments/chips; the design wants
    // the brand-subtle tint there, not the saturated mint.
    secondaryContainer: c.brandSubtle,
    onSecondaryContainer: c.brandText,
    error: c.dangerFg,
    onError: c.onBrand,
    surface: c.surface,
    onSurface: c.textPrimary,
    onSurfaceVariant: c.textSecondary,
    surfaceContainerLowest: c.canvas,
    surfaceContainerLow: c.surfaceSubtle,
    surfaceContainer: c.surface,
    surfaceContainerHigh: c.surfaceRaised,
    surfaceContainerHighest: c.surfaceHover,
    outline: c.borderStrong,
    outlineVariant: c.border,
  );
  TextStyle t(TextStyle s, [Color? color]) => s.copyWith(color: color ?? c.textPrimary);
  final buttonShape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md));
  const buttonSize = Size(64, 48); // 48dp minimum tap target (Android)

  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: c.canvas,
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {TargetPlatform.android: FadeForwardsPageTransitionsBuilder()},
    ),
    fontFamily: 'Inter',
    extensions: [c],
    textTheme: TextTheme(
      displaySmall: t(AppText.display),
      headlineSmall: t(AppText.h1),
      titleLarge: t(AppText.h2),
      titleMedium: t(AppText.h3),
      bodyLarge: t(AppText.bodyL),
      bodyMedium: t(AppText.body, c.textSecondary),
      labelLarge: t(AppText.label),
      labelMedium: t(AppText.caption, c.textSecondary),
      labelSmall: t(AppText.overline, c.textTertiary),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: c.surface,
      foregroundColor: c.textPrimary,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      titleTextStyle: t(AppText.h2),
      shape: Border(bottom: BorderSide(color: c.border)),
    ),
    cardTheme: CardThemeData(
      color: c.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Radii.lg),
        side: BorderSide(color: c.border),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: buttonSize,
        shape: buttonShape,
        textStyle: AppText.label,
        backgroundColor: c.brand,
        foregroundColor: c.onBrand,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: buttonSize,
        shape: buttonShape,
        textStyle: AppText.label,
        foregroundColor: c.textPrimary,
        side: BorderSide(color: c.borderStrong),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        minimumSize: buttonSize,
        shape: buttonShape,
        textStyle: AppText.label,
        foregroundColor: c.brandText,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: Space.s4, vertical: 14),
      labelStyle: t(AppText.label, c.textSecondary),
      hintStyle: t(AppText.bodyL, c.textTertiary),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Radii.md),
        borderSide: BorderSide(color: c.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Radii.md),
        borderSide: BorderSide(color: c.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Radii.md),
        borderSide: BorderSide(color: c.focus, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Radii.md),
        borderSide: BorderSide(color: c.dangerFg),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: c.surface,
      surfaceTintColor: Colors.transparent,
      indicatorColor: c.brandSubtle,
      height: 64,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => t(AppText.caption, s.contains(WidgetState.selected) ? c.brandText : c.textSecondary),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (s) => IconThemeData(size: 22, color: s.contains(WidgetState.selected) ? c.brandText : c.textSecondary),
      ),
    ),
    navigationRailTheme: NavigationRailThemeData(
      backgroundColor: c.surface,
      indicatorColor: c.brandSubtle,
      selectedIconTheme: IconThemeData(color: c.brandText),
      unselectedIconTheme: IconThemeData(color: c.textSecondary),
      selectedLabelTextStyle: t(AppText.caption, c.brandText),
      unselectedLabelTextStyle: t(AppText.caption, c.textSecondary),
    ),
    dividerTheme: DividerThemeData(color: c.border, thickness: 1, space: 1),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: c.surfaceRaised,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(Radii.xl))),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: c.surfaceRaised,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.xl)),
    ),
    snackBarTheme: SnackBarThemeData(behavior: SnackBarBehavior.floating, shape: buttonShape),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: c.brand, linearTrackColor: c.border),
  );
}
