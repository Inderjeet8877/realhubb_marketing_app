import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../theme/tokens.dart';

/// Ambient background for the login hero: translucent chat bubbles and signal
/// bars drifting slowly upward and swaying — "conversations turning into
/// growth". [t] loops 0→1; pass a constant when animations are disabled.
class HeroBackdrop extends StatelessWidget {
  const HeroBackdrop({super.key, required this.t, required this.dark});
  final double t;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: dark ? [const Color(0xFF13203D), c.canvas] : [c.brand, c.brandHover],
        ),
      ),
      child: CustomPaint(painter: _DriftPainter(t), size: Size.infinite),
    );
  }
}

class _Floater {
  const _Floater(this.x, this.size, this.speed, this.phase, this.bars);
  final double x, size, speed, phase; // x as fraction of width
  final bool bars; // signal bars instead of a bubble
}

// Fixed layout so the scene is identical every launch (no randomness).
const _floaters = [
  _Floater(0.08, 34, 1.0, 0.00, false),
  _Floater(0.86, 46, 0.7, 0.18, false),
  _Floater(0.30, 22, 1.3, 0.42, true),
  _Floater(0.68, 28, 1.1, 0.63, false),
  _Floater(0.50, 18, 1.5, 0.85, true),
  _Floater(0.18, 52, 0.6, 0.30, false),
  _Floater(0.93, 20, 1.2, 0.52, true),
  _Floater(0.42, 40, 0.8, 0.74, false),
];

class _DriftPainter extends CustomPainter {
  _DriftPainter(this.t);
  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    for (final f in _floaters) {
      // Upward loop with gentle horizontal sway; fades in/out at the edges.
      final p = (t * f.speed + f.phase) % 1.0;
      final y = size.height * (1.1 - p * 1.3);
      final x = size.width * f.x + math.sin((p + f.phase) * math.pi * 2) * 14;
      final alpha = (math.sin(p * math.pi) * 0.16).clamp(0.0, 0.16);
      final paint = Paint()..color = Colors.white.withValues(alpha: alpha);
      final s = f.size;
      if (f.bars) {
        for (var i = 0; i < 3; i++) {
          final h = s * (0.45 + i * 0.28);
          canvas.drawRRect(
            RRect.fromLTRBR(x + i * s * 0.42, y - h, x + i * s * 0.42 + s * 0.3, y, Radius.circular(s * 0.08)),
            paint,
          );
        }
      } else {
        canvas.drawRRect(RRect.fromLTRBR(x, y, x + s * 1.4, y + s, Radius.circular(s * 0.3)), paint);
        canvas.drawPath(
          Path()
            ..moveTo(x + s * 0.25, y + s * 0.85)
            ..lineTo(x + s * 0.15, y + s * 1.3)
            ..lineTo(x + s * 0.65, y + s * 0.9)
            ..close(),
          paint,
        );
      }
    }
  }

  @override
  bool shouldRepaint(_DriftPainter old) => old.t != t;
}
