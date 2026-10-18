import 'package:flutter/material.dart';

/// Brand artwork from assets/brand (trimmed, transparent PNGs).
const symbolAsset = 'assets/brand/symbol.png';

/// The gradient "B" symbol. Width follows the artwork's 679:768 aspect.
class BrandSymbol extends StatelessWidget {
  const BrandSymbol({super.key, this.size = 48});
  final double size;

  @override
  Widget build(BuildContext context) =>
      Image.asset(symbolAsset, height: size, semanticLabel: 'Broadzen', filterQuality: FilterQuality.medium);
}

/// Picks the light/dark variant: [onDark] when given, else the theme brightness.
bool _darkBg(BuildContext context, bool? onDark) => onDark ?? Theme.of(context).brightness == Brightness.dark;

/// Symbol + "Broadzen" wordmark + tagline.
class BrandLockup extends StatelessWidget {
  const BrandLockup({super.key, this.height = 40, this.onDark});
  final double height;
  final bool? onDark;

  @override
  Widget build(BuildContext context) => Image.asset(
    'assets/brand/lockup_${_darkBg(context, onDark) ? 'dark' : 'light'}.png',
    height: height,
    semanticLabel: 'Broadzen',
    filterQuality: FilterQuality.medium,
  );
}

/// "Broadzen" text only (navy on light backgrounds, white on dark).
class BrandWordmark extends StatelessWidget {
  const BrandWordmark({super.key, this.height = 24, this.onDark});
  final double height;
  final bool? onDark;

  @override
  Widget build(BuildContext context) => Image.asset(
    'assets/brand/wordmark_${_darkBg(context, onDark) ? 'dark' : 'light'}.png',
    height: height,
    semanticLabel: 'Broadzen',
    filterQuality: FilterQuality.medium,
  );
}
