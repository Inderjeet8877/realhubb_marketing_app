import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/brand_mark.dart';

/// The hero is the logo navy in both themes — it is the brand surface.
const heroNavy = Color(0xFF0F1A38);
const _heroMint = Color(0xFF2DD4BF);
const _cyan = Color(0xFF00F5E9), _green = Color(0xFF00C471);
const tagline = 'Broadcast smarter. Grow faster.';

/// Length of the login intro (logo, then sheet + form), in ms.
const introMs = 2800;

/// Ambient aurora: large soft cyan/green blobs drifting on slow loops, plus a
/// few faint dots rising like signals. [t] loops 0→1; constant when animations are off.
class HeroBackdrop extends StatelessWidget {
  const HeroBackdrop({super.key, required this.t});
  final double t;

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: heroNavy,
    child: CustomPaint(painter: _AuroraPainter(t), size: Size.infinite),
  );
}

class _Blob {
  const _Blob(this.color, this.x, this.y, this.radius, this.kx, this.ky, this.phase);
  final Color color;
  final double x, y, radius, phase; // centre/radius as fractions of the hero
  final int kx, ky; // whole loops per cycle, so the drift wraps seamlessly
}

class _Dot {
  const _Dot(this.x, this.r, this.speed, this.phase, this.mint);
  final double x, r, phase;
  final int speed;
  final bool mint;
}

// Fixed scene so it is identical every launch (no randomness).
const _blobs = [
  _Blob(_cyan, 0.15, 0.2, 0.75, 1, 2, 0.0),
  _Blob(_green, 0.9, 0.85, 0.8, 2, 1, 0.35),
  _Blob(_cyan, 0.75, 0.05, 0.45, 1, 1, 0.7),
];
const _dots = [
  _Dot(0.08, 1.6, 1, 0.05, false),
  _Dot(0.22, 2.2, 2, 0.6, true),
  _Dot(0.36, 1.2, 1, 0.35, false),
  _Dot(0.52, 1.8, 2, 0.15, true),
  _Dot(0.64, 1.3, 1, 0.8, false),
  _Dot(0.78, 2.0, 1, 0.5, true),
  _Dot(0.9, 1.4, 2, 0.9, false),
];

class _AuroraPainter extends CustomPainter {
  _AuroraPainter(this.t);
  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    final a = t * 2 * math.pi, side = math.max(size.width, size.height);
    for (final b in _blobs) {
      final p = b.phase * 2 * math.pi;
      final c = Offset(
        size.width * (b.x + 0.12 * math.sin(a * b.kx + p)),
        size.height * (b.y + 0.08 * math.cos(a * b.ky + p)),
      );
      final r = side * b.radius;
      final shader = RadialGradient(colors: [b.color.withValues(alpha: 0.2), b.color.withValues(alpha: 0)])
          .createShader(Rect.fromCircle(center: c, radius: r));
      canvas.drawCircle(c, r, Paint()..shader = shader);
    }
    for (final d in _dots) {
      final p = (t * d.speed * 3 + d.phase) % 1.0;
      final x = size.width * d.x + math.sin((p + d.phase) * 2 * math.pi) * 8;
      final y = size.height * (1.05 - p * 1.1);
      final alpha = math.sin(p * math.pi) * 0.35;
      canvas.drawCircle(
        Offset(x, y),
        d.r,
        Paint()..color = (d.mint ? _heroMint : Colors.white).withValues(alpha: alpha),
      );
    }
  }

  @override
  bool shouldRepaint(_AuroraPainter old) => old.t != t;
}

/// The logo intro at [ms] into the timeline (≥ [introMs] = final state):
///   0–700  symbol springs in (scale 0.6→1, easeOutBack) with a cyan glow that blooms, then settles by 1400
///   600–1400  wordmark letters pop in left→right
///   1350–2150 tagline types in; caret blinks until 2500.
/// [sweep] = (position 0→1, peak opacity) of the light band over the symbol, null when none is running.
class HeroBrand extends StatelessWidget {
  const HeroBrand({super.key, required this.ms, required this.compact, this.sweep});
  final double ms;
  final bool compact;
  final (double, double)? sweep;

  double _seg(int a, int b, [Curve curve = Curves.linear]) => curve.transform(((ms - a) / (b - a)).clamp(0.0, 1.0));

  @override
  Widget build(BuildContext context) {
    final symbolH = compact ? 44.0 : 84.0;
    final glow = ms < 700 ? _seg(100, 700, Curves.easeOut) : 1 - 0.5 * _seg(700, 1400, Curves.easeInOut);
    final glowSize = symbolH * 2.6;

    Widget symbol = BrandSymbol(size: symbolH);
    if (sweep case (final pos, final peak)) {
      symbol = ShaderMask(
        blendMode: BlendMode.srcATop,
        shaderCallback: (rect) {
          final p = -0.3 + 1.6 * pos;
          final white = Colors.white.withValues(alpha: peak);
          return LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [white.withValues(alpha: 0), white, white.withValues(alpha: 0)],
            stops: [(p - 0.18).clamp(0.0, 1.0), p.clamp(0.0, 1.0), (p + 0.18).clamp(0.0, 1.0)],
          ).createShader(rect);
        },
        child: symbol,
      );
    }
    symbol = Stack(
      alignment: Alignment.center,
      clipBehavior: Clip.none,
      children: [
        Positioned.fill(
          child: OverflowBox(
            maxWidth: glowSize,
            maxHeight: glowSize,
            child: DecoratedBox(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    _cyan.withValues(alpha: 0.4 * glow),
                    _cyan.withValues(alpha: 0),
                  ],
                ),
              ),
              child: SizedBox.square(dimension: glowSize),
            ),
          ),
        ),
        Opacity(
          opacity: _seg(0, 300),
          child: Transform.scale(scale: 0.6 + 0.4 * _seg(0, 700, Curves.easeOutBack), child: symbol),
        ),
      ],
    );
    final word = _LetterReveal(t: _seg(600, 1400), height: compact ? 26 : 34);

    return Semantics(
      container: true,
      label: 'Broadzen. $tagline',
      child: ExcludeSemantics(
        child: compact
            ? Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  symbol,
                  const SizedBox(width: Space.s3),
                  word,
                ],
              )
            : Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  symbol,
                  const SizedBox(height: Space.s5),
                  word,
                  const SizedBox(height: Space.s3),
                  _typedTagline(),
                ],
              ),
      ),
    );
  }

  Widget _typedTagline() {
    final style = AppText.label.copyWith(color: _heroMint, fontSize: 15, letterSpacing: 0.2);
    final typed = (_seg(1350, 2150) * tagline.length).round();
    if (ms >= 2500) return Text(tagline, style: style);
    final caretOn = typed < tagline.length || (ms ~/ 250).isEven;
    // Untyped characters stay laid out (transparent) so the centred line never shifts;
    // the caret is zero-width for the same reason.
    return Text.rich(
      TextSpan(
        children: [
          TextSpan(text: tagline.substring(0, typed)),
          WidgetSpan(
            alignment: PlaceholderAlignment.middle,
            child: SizedBox(
              width: 0,
              height: 16,
              child: OverflowBox(
                maxWidth: 2,
                child: Opacity(
                  opacity: caretOn ? 1 : 0,
                  child: const DecoratedBox(
                    decoration: BoxDecoration(gradient: brandGradient),
                    child: SizedBox(width: 2, height: 16),
                  ),
                ),
              ),
            ),
          ),
          TextSpan(
            text: tagline.substring(typed),
            style: const TextStyle(color: Colors.transparent),
          ),
        ],
      ),
      style: style,
    );
  }
}

/// Right edge of each letter (B r o a d z e n) in wordmark_dark.png, as a fraction of its width.
const _letterEdges = [0.0, 0.132, 0.216, 0.345, 0.481, 0.619, 0.747, 0.875, 1.0];
const _wordAspect = 1003 / 173;

/// Each letter of the wordmark is its own clipped slice that pops up from the
/// baseline with an overshoot, staggered left→right ([t] 0→1).
class _LetterReveal extends StatelessWidget {
  const _LetterReveal({required this.t, required this.height});
  final double t, height;

  @override
  Widget build(BuildContext context) {
    final word = BrandWordmark(height: height, onDark: true);
    if (t >= 1) return word;
    return SizedBox(
      width: height * _wordAspect,
      height: height,
      child: Stack(
        children: [
          for (var i = 0; i < 8; i++)
            if (t * 9 > i)
              Positioned.fill(
                child: Builder(
                  builder: (_) {
                    final v = ((t * 9 - i) / 2).clamp(0.0, 1.0);
                    final s = Curves.easeOutBack.transform(v);
                    return Opacity(
                      opacity: (v * 3).clamp(0.0, 1.0),
                      child: Transform.translate(
                        offset: Offset(0, (1 - s) * height * 0.4),
                        child: Transform.scale(
                          scale: 0.5 + 0.5 * s,
                          alignment: Alignment(_letterEdges[i] + _letterEdges[i + 1] - 1, 1),
                          child: ClipRect(clipper: _Slice(i), child: word),
                        ),
                      ),
                    );
                  },
                ),
              ),
        ],
      ),
    );
  }
}

class _Slice extends CustomClipper<Rect> {
  const _Slice(this.i);
  final int i;

  @override
  Rect getClip(Size size) =>
      Rect.fromLTRB(size.width * _letterEdges[i], 0, size.width * _letterEdges[i + 1], size.height);

  @override
  bool shouldReclip(_Slice old) => old.i != i;
}
