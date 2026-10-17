import 'package:flutter/material.dart';

import '../theme/tokens.dart';

/// App icon Concept A "Signal bubble" (Figma page 00 Cover & Brand).
/// [inverted] = white tile, blue bubble (used on blue backgrounds).
/// [progress] 0→1 builds the mark: tile pops, bubble grows, bars rise in turn
/// (the mint bar last, with overshoot). 1 = static icon.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 48, this.inverted = false, this.progress = 1});

  final double size;
  final bool inverted;
  final double progress;

  @override
  Widget build(BuildContext context) {
    return SizedBox.square(
      dimension: size,
      child: CustomPaint(
        painter: _SignalBubblePainter(inverted: inverted, t: progress),
      ),
    );
  }
}

class _SignalBubblePainter extends CustomPainter {
  _SignalBubblePainter({required this.inverted, required this.t});

  final bool inverted;
  final double t;
  static const _blue = Color(0xFF2563EB), _white = Color(0xFFFFFFFF), _mint = Color(0xFF34D399);

  /// Eased 0→1 for the slice [a, b] of the overall progress.
  double _stage(double a, double b, Curve curve) => curve.transform(((t - a) / (b - a)).clamp(0.0, 1.0));

  void _scaled(Canvas canvas, double s, Offset origin, void Function() draw) {
    if (s <= 0) return;
    canvas
      ..save()
      ..translate(origin.dx, origin.dy)
      ..scale(s)
      ..translate(-origin.dx, -origin.dy);
    draw();
    canvas.restore();
  }

  @override
  void paint(Canvas canvas, Size size) {
    // Drawn on the same 192-unit grid as the Figma master.
    canvas.scale(size.width / 192);
    final tile = Paint()..color = inverted ? _white : _blue;
    final bubble = Paint()..color = inverted ? _blue : _white;
    final bar = Paint()..color = inverted ? _white : _blue;

    _scaled(canvas, _stage(0, 0.3, Curves.easeOutBack), const Offset(96, 96), () {
      canvas.drawRRect(RRect.fromLTRBR(0, 0, 192, 192, const Radius.circular(44)), tile);
    });
    _scaled(canvas, _stage(0.2, 0.5, Curves.easeOutBack), const Offset(96, 100), () {
      canvas.drawRRect(RRect.fromLTRBR(40, 44, 152, 132, const Radius.circular(24)), bubble);
      canvas.drawPath(
        Path()
          ..moveTo(60, 118)
          ..lineTo(50, 158)
          ..lineTo(96, 122)
          ..close(),
        bubble,
      );
    });
    // Bars grow up from their baseline (y = 116), one after another.
    const r = Radius.circular(4);
    void riseBar(double left, double top, double a, double b, Curve curve, Paint p) {
      final h = (116 - top) * _stage(a, b, curve);
      if (h > 0.5) canvas.drawRRect(RRect.fromLTRBR(left, 116 - h, left + 16, 116, r), p);
    }

    riseBar(66, 96, 0.45, 0.7, Curves.easeOutCubic, bar);
    riseBar(89, 82, 0.55, 0.8, Curves.easeOutCubic, bar);
    riseBar(112, 66, 0.65, 1.0, Curves.elasticOut, Paint()..color = _mint);
  }

  @override
  bool shouldRepaint(_SignalBubblePainter old) => old.inverted != inverted || old.t != t;
}

/// Horizontal lock-up: symbol + "broadzen" wordmark (Sora Bold, −3%).
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
          'broadzen',
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
