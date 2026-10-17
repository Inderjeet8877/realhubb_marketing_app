import 'package:flutter/material.dart';

import '../theme/tokens.dart';

/// App icon Concept A "Signal bubble" (Figma page 00 Cover & Brand).
/// [inverted] = white tile, blue bubble (used on blue backgrounds).
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 48, this.inverted = false});

  final double size;
  final bool inverted;

  @override
  Widget build(BuildContext context) {
    return SizedBox.square(
      dimension: size,
      child: CustomPaint(painter: _SignalBubblePainter(inverted: inverted)),
    );
  }
}

class _SignalBubblePainter extends CustomPainter {
  _SignalBubblePainter({required this.inverted});

  final bool inverted;
  static const _blue = Color(0xFF2563EB),
      _white = Color(0xFFFFFFFF),
      _mint = Color(0xFF34D399);

  @override
  void paint(Canvas canvas, Size size) {
    // Drawn on the same 192-unit grid as the Figma master.
    canvas.scale(size.width / 192);
    final tile = Paint()..color = inverted ? _white : _blue;
    final bubble = Paint()..color = inverted ? _blue : _white;
    final bar = Paint()..color = inverted ? _white : _blue;

    canvas.drawRRect(
      RRect.fromLTRBR(0, 0, 192, 192, const Radius.circular(44)),
      tile,
    );
    canvas.drawRRect(
      RRect.fromLTRBR(40, 44, 152, 132, const Radius.circular(24)),
      bubble,
    );
    canvas.drawPath(
      Path()
        ..moveTo(60, 118)
        ..lineTo(50, 158)
        ..lineTo(96, 122)
        ..close(),
      bubble,
    );
    const r = Radius.circular(4);
    canvas.drawRRect(RRect.fromLTRBR(66, 96, 82, 116, r), bar);
    canvas.drawRRect(RRect.fromLTRBR(89, 82, 105, 116, r), bar);
    canvas.drawRRect(
      RRect.fromLTRBR(112, 66, 128, 116, r),
      Paint()..color = _mint,
    );
  }

  @override
  bool shouldRepaint(_SignalBubblePainter old) => old.inverted != inverted;
}

/// Horizontal lock-up: symbol + "realhubb" wordmark (Sora Bold, −3%).
class BrandLockup extends StatelessWidget {
  const BrandLockup({super.key, this.height = 40, this.onBrand = false});

  final double height;
  final bool onBrand;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        BrandMark(size: height, inverted: onBrand),
        SizedBox(width: height * 0.3),
        Text(
          'realhubb',
          style: TextStyle(
            fontFamily: 'Sora',
            fontWeight: FontWeight.w700,
            fontSize: height * 0.72,
            letterSpacing: -0.03 * height * 0.72,
            color: onBrand ? c.onBrand : c.textPrimary,
          ),
        ),
      ],
    );
  }
}
