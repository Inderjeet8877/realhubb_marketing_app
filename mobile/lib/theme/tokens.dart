import 'package:flutter/material.dart';

/// Semantic colour tokens — same names as the Figma "Color · Light" /
/// "Color · Dark" collections (design/figma/DESIGN_PLAN.md §3.2, §3.2b).
/// Screens use these, never raw hex.
@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.canvas,
    required this.surface,
    required this.surfaceSubtle,
    required this.surfaceRaised,
    required this.surfaceHover,
    required this.border,
    required this.borderStrong,
    required this.textPrimary,
    required this.textSecondary,
    required this.textTertiary,
    required this.onBrand,
    required this.brand,
    required this.brandHover,
    required this.brandText,
    required this.brandSubtle,
    required this.mint,
    required this.mintSubtle,
    required this.successFg,
    required this.successIcon,
    required this.successBg,
    required this.successSolid,
    required this.dangerFg,
    required this.dangerBg,
    required this.dangerSolid,
    required this.warningFg,
    required this.warningBg,
    required this.warningSolid,
    required this.infoFg,
    required this.infoBg,
    required this.focus,
    required this.chatBg,
    required this.bubbleOut,
    required this.bubbleIn,
    required this.whatsapp,
    required this.meta,
  });

  final Color canvas, surface, surfaceSubtle, surfaceRaised, surfaceHover;
  final Color border, borderStrong;
  final Color textPrimary, textSecondary, textTertiary, onBrand;
  final Color brand, brandHover, brandText, brandSubtle, mint, mintSubtle;
  final Color successFg, successIcon, successBg, successSolid;
  final Color dangerFg, dangerBg, dangerSolid;
  final Color warningFg, warningBg, warningSolid;
  final Color infoFg, infoBg, focus;
  final Color chatBg, bubbleOut, bubbleIn, whatsapp, meta;

  static const light = AppColors(
    canvas: Color(0xFFF3F6F9),
    surface: Color(0xFFFFFFFF),
    surfaceSubtle: Color(0xFFF8FAFC),
    surfaceRaised: Color(0xFFFFFFFF),
    surfaceHover: Color(0xFFEEF2F6),
    border: Color(0xFFE2E8F0),
    borderStrong: Color(0xFFCBD5E1),
    textPrimary: Color(0xFF0F1A38), // logo navy
    textSecondary: Color(0xFF475569),
    textTertiary: Color(0xFF64748B),
    onBrand: Color(0xFFFFFFFF),
    brand: Color(0xFF0F1A38),
    brandHover: Color(0xFF1B2A55),
    brandText: Color(0xFF0F766E), // teal-700
    brandSubtle: Color(0xFFE6FAF6),
    mint: Color(0xFF00D9B5),
    mintSubtle: Color(0xFFE6FAF6),
    successFg: Color(0xFF047857),
    successIcon: Color(0xFF059669),
    successBg: Color(0xFFECFDF5),
    successSolid: Color(0xFF047857),
    dangerFg: Color(0xFFDC2626),
    dangerBg: Color(0xFFFEF2F2),
    dangerSolid: Color(0xFFDC2626),
    warningFg: Color(0xFFB45309),
    warningBg: Color(0xFFFFFBEB),
    warningSolid: Color(0xFFF59E0B),
    infoFg: Color(0xFF1D4ED8),
    infoBg: Color(0xFFEFF6FF),
    focus: Color(0xFF0D9488),
    chatBg: Color(0xFFEFEAE2),
    bubbleOut: Color(0xFFD9FDD3),
    bubbleIn: Color(0xFFFFFFFF),
    whatsapp: Color(0xFF25D366),
    meta: Color(0xFF0866FF),
  );

  static const dark = AppColors(
    canvas: Color(0xFF0A1122),
    surface: Color(0xFF0F1A38), // logo navy
    surfaceSubtle: Color(0xFF13214A),
    surfaceRaised: Color(0xFF1A2A55),
    surfaceHover: Color(0xFF1A2A55),
    border: Color(0xFF1E2D57),
    borderStrong: Color(0xFF2D4170),
    textPrimary: Color(0xFFF1F5F9),
    textSecondary: Color(0xFFCBD5E1),
    textTertiary: Color(0xFF94A3B8),
    onBrand: Color(0xFF0F1A38), // navy text on the mint button
    brand: Color(0xFF2DD4BF),
    brandHover: Color(0xFF5EEAD4),
    brandText: Color(0xFF2DD4BF),
    brandSubtle: Color(0x262DD4BF), // brand @ 15%
    mint: Color(0xFF00D9B5),
    mintSubtle: Color(0x2600D9B5),
    successFg: Color(0xFF34D399),
    successIcon: Color(0xFF34D399),
    successBg: Color(0x2610B981),
    // Light enough for navy onBrand text (emerald-700 would be ~3:1).
    successSolid: Color(0xFF34D399),
    dangerFg: Color(0xFFF87171),
    dangerBg: Color(0x26EF4444),
    dangerSolid: Color(0xFFDC2626),
    warningFg: Color(0xFFFBBF24),
    warningBg: Color(0x26F59E0B),
    warningSolid: Color(0xFFF59E0B),
    infoFg: Color(0xFF60A5FA),
    infoBg: Color(0x263B82F6),
    focus: Color(0xFF2DD4BF),
    chatBg: Color(0xFF0B141A),
    bubbleOut: Color(0xFF005C4B),
    bubbleIn: Color(0xFF202C33),
    whatsapp: Color(0xFF25D366),
    meta: Color(0xFF0866FF),
  );

  // Only two fixed palettes; no partial overrides or animated blending needed.
  @override
  AppColors copyWith() => this;

  @override
  AppColors lerp(AppColors? other, double t) => t < 0.5 || other == null ? this : other;
}

/// Spacing (4px base) and radius tokens — Figma "Spacing" / "Radius".
abstract final class Space {
  static const s1 = 4.0,
      s2 = 8.0,
      s3 = 12.0,
      s4 = 16.0,
      s5 = 20.0,
      s6 = 24.0,
      s8 = 32.0,
      s10 = 40.0,
      s12 = 48.0,
      s16 = 64.0;
}

abstract final class Radii {
  static const sm = 6.0, md = 10.0, lg = 14.0, xl = 20.0, full = 999.0;
}

/// Logo gradient (cyan → green). Accent only — highlights, never text backgrounds.
const brandGradient = LinearGradient(
  colors: [Color(0xFF00F5E9), Color(0xFF00C471)],
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
);

extension AppColorsX on BuildContext {
  AppColors get colors => Theme.of(this).extension<AppColors>()!;
}

/// Motion: one curve family and three durations, shared with the web
/// (tailwind.config.ts `out`, `fast`/`base`/`slow`).
abstract final class Motion {
  static const fast = Duration(milliseconds: 120);
  static const base = Duration(milliseconds: 200);
  static const slow = Duration(milliseconds: 320);
  static const out = Cubic(0.23, 1, 0.32, 1);
  static const inOut = Cubic(0.65, 0, 0.35, 1);

  /// [d], or zero when the OS asks for reduced motion.
  static Duration of(BuildContext context, Duration d) =>
      MediaQuery.disableAnimationsOf(context) ? Duration.zero : d;
}

/// Numbers, phone numbers and timestamps.
const monoFamily = 'JetBrainsMono';
