import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../theme/app_theme.dart';
import '../theme/tokens.dart';

/// Shared design-system widgets (DESIGN_PLAN §5). Features compose these;
/// feature-specific widgets live in their own feature folder.

/// One status map for every badge (DESIGN_PLAN §5.4).
enum Tone { neutral, info, success, warning, danger, brand }

extension ToneColors on Tone {
  Color fg(AppColors c) => switch (this) {
    Tone.neutral => c.textSecondary,
    Tone.info => c.infoFg,
    Tone.success => c.successFg,
    Tone.warning => c.warningFg,
    Tone.danger => c.dangerFg,
    Tone.brand => c.brandText,
  };
  Color bg(AppColors c) => switch (this) {
    Tone.neutral => c.surfaceHover,
    Tone.info => c.infoBg,
    Tone.success => c.successBg,
    Tone.warning => c.warningBg,
    Tone.danger => c.dangerBg,
    Tone.brand => c.brandSubtle,
  };
}

/// Pill with text (+ optional icon) — never colour alone.
class StatusBadge extends StatelessWidget {
  const StatusBadge(this.label, {super.key, this.tone = Tone.neutral, this.icon});
  final String label;
  final Tone tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: tone.bg(c), borderRadius: BorderRadius.circular(Radii.full)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 13, color: tone.fg(c)), const SizedBox(width: 4)],
          Text(label, style: AppText.caption.copyWith(color: tone.fg(c))),
        ],
      ),
    );
  }
}

/// Surface card with border (e0). Tappable when [onTap] is set.
class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.child, this.padding = const EdgeInsets.all(Space.s4), this.onTap});
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(padding: padding, child: child),
      ),
    );
  }
}

/// KPI tile: label, big value (Sora, tabular), optional sub-line and icon.
class StatCard extends StatelessWidget {
  const StatCard({
    super.key,
    required this.label,
    required this.value,
    this.icon,
    this.tone = Tone.brand,
    this.sub,
    this.subTone,
    this.onTap,
  });
  final String label, value;
  final IconData? icon;
  final Tone tone;
  final String? sub;
  final Tone? subTone;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AppCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  style: AppText.caption.copyWith(color: c.textSecondary),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (icon != null)
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(color: tone.bg(c), borderRadius: BorderRadius.circular(Radii.md)),
                  child: Icon(icon, size: 16, color: tone.fg(c)),
                ),
            ],
          ),
          const SizedBox(height: Space.s2),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value, style: AppText.kpi.copyWith(color: c.textPrimary)),
          ),
          if (sub != null) ...[
            const SizedBox(height: 2),
            Text(
              sub!,
              style: AppText.caption.copyWith(color: (subTone ?? Tone.neutral).fg(c)),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
    );
  }
}

/// Responsive grid for stat cards: 2 columns on phones, more on wider screens.
class StatGrid extends StatelessWidget {
  const StatGrid({super.key, required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, box) {
        final cols = box.maxWidth >= 900
            ? 4
            : box.maxWidth >= 600
            ? 3
            : 2;
        final w = (box.maxWidth - Space.s3 * (cols - 1)) / cols;
        return Wrap(
          spacing: Space.s3,
          runSpacing: Space.s3,
          children: [for (final ch in children) SizedBox(width: w, child: ch)],
        );
      },
    );
  }
}

class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key, this.subtitle, this.trailing});
  final String title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(bottom: Space.s3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: AppText.h2.copyWith(color: c.textPrimary)),
                if (subtitle != null) Text(subtitle!, style: AppText.body.copyWith(color: c.textSecondary)),
              ],
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

/// Icon, title, hint and one action — every empty state has a way forward.
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.message, this.actionLabel, this.onAction});
  final IconData icon;
  final String title;
  final String? message, actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(Space.s8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(color: c.brandSubtle, shape: BoxShape.circle),
              child: Icon(icon, color: c.brandText, size: 28),
            ),
            const SizedBox(height: Space.s4),
            Text(
              title,
              style: AppText.h3.copyWith(color: c.textPrimary),
              textAlign: TextAlign.center,
            ),
            if (message != null) ...[
              const SizedBox(height: Space.s1),
              Text(
                message!,
                style: AppText.body.copyWith(color: c.textSecondary),
                textAlign: TextAlign.center,
              ),
            ],
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: Space.s4),
              FilledButton(onPressed: onAction, child: Text(actionLabel!)),
            ],
          ],
        ),
      ),
    );
  }
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, this.onRetry});
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => EmptyState(
    icon: LucideIcons.triangleAlert,
    title: "Couldn't load this",
    message: message,
    actionLabel: onRetry == null ? null : 'Try again',
    onAction: onRetry,
  );
}

/// Skeleton blocks shaped like a list of cards (no spinners for page loads).
class LoadingList extends StatefulWidget {
  const LoadingList({super.key, this.count = 6, this.itemHeight = 72});
  final int count;
  final double itemHeight;

  @override
  State<LoadingList> createState() => _LoadingListState();
}

class _LoadingListState extends State<LoadingList> with SingleTickerProviderStateMixin {
  late final _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    MediaQuery.disableAnimationsOf(context) ? _pulse.stop() : _pulse.repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    Widget bar(double w, double h) => Container(
      width: w,
      height: h,
      decoration: BoxDecoration(color: c.surfaceHover, borderRadius: BorderRadius.circular(Radii.sm)),
    );
    return Semantics(
      label: 'Loading',
      child: FadeTransition(
        opacity: Tween(begin: 0.55, end: 1.0).animate(CurvedAnimation(parent: _pulse, curve: Motion.inOut)),
        child: ListView.separated(
          padding: const EdgeInsets.all(Space.s4),
          physics: const NeverScrollableScrollPhysics(),
          itemCount: widget.count,
          separatorBuilder: (_, _) => const SizedBox(height: Space.s3),
          itemBuilder: (_, i) => Container(
            height: widget.itemHeight,
            padding: const EdgeInsets.symmetric(horizontal: Space.s4),
            decoration: BoxDecoration(
              border: Border.all(color: c.surfaceHover),
              borderRadius: BorderRadius.circular(Radii.lg),
            ),
            child: Row(
              children: [
                Container(width: 36, height: 36, decoration: BoxDecoration(color: c.surfaceHover, shape: BoxShape.circle)),
                const SizedBox(width: Space.s3),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [bar(i.isEven ? 140 : 110, 12), const SizedBox(height: Space.s2), bar(i.isEven ? 200 : 170, 10)],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Tinted banner: info / success / warning / danger, optional action.
class AlertBanner extends StatelessWidget {
  const AlertBanner({
    super.key,
    required this.tone,
    required this.title,
    this.message,
    this.actionLabel,
    this.onAction,
  });
  final Tone tone;
  final String title;
  final String? message, actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final icon = switch (tone) {
      Tone.success => LucideIcons.circleCheck,
      Tone.warning => LucideIcons.triangleAlert,
      Tone.danger => LucideIcons.circleX,
      _ => LucideIcons.info,
    };
    return Container(
      padding: const EdgeInsets.all(Space.s3),
      decoration: BoxDecoration(color: tone.bg(c), borderRadius: BorderRadius.circular(Radii.lg)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: tone.fg(c)),
          const SizedBox(width: Space.s3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: AppText.label.copyWith(color: tone.fg(c))),
                if (message != null) Text(message!, style: AppText.body.copyWith(color: c.textSecondary)),
                if (actionLabel != null && onAction != null)
                  TextButton(
                    onPressed: onAction,
                    style: TextButton.styleFrom(padding: EdgeInsets.zero),
                    child: Text(actionLabel!),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Renders an AsyncValue with the standard loading / error / data states.
class AsyncBody<T> extends StatelessWidget {
  const AsyncBody({super.key, required this.value, required this.data, this.onRetry, this.loading});
  final AsyncValue<T> value;
  final Widget Function(T data) data;
  final VoidCallback? onRetry;
  final Widget? loading;

  @override
  Widget build(BuildContext context) => value.when(
    skipLoadingOnRefresh: true,
    data: data,
    loading: () => loading ?? const LoadingList(),
    error: (e, _) => ErrorView(message: '$e', onRetry: onRetry),
  );
}

/// Circle avatar with initials.
class InitialsAvatar extends StatelessWidget {
  const InitialsAvatar(this.text, {super.key, this.size = 40, this.tone = Tone.brand});
  final String text;
  final double size;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: tone.bg(c), shape: BoxShape.circle),
      child: Text(
        text,
        style: AppText.label.copyWith(color: tone.fg(c), fontSize: size * 0.36),
      ),
    );
  }
}

void showSnack(BuildContext context, String message, {Tone tone = Tone.neutral}) {
  final c = context.colors;
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: tone == Tone.danger
            ? c.dangerSolid
            : tone == Tone.success
            ? c.successSolid
            : null,
      ),
    );
}

/// Confirm dialog (danger tone for destructive actions). Returns true on confirm.
Future<bool> confirm(
  BuildContext context, {
  required String title,
  required String message,
  String confirmLabel = 'Confirm',
  bool danger = false,
}) async {
  final c = context.colors;
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title, style: AppText.h3.copyWith(color: c.textPrimary)),
      content: Text(message, style: AppText.body.copyWith(color: c.textSecondary)),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
        FilledButton(
          style: danger ? FilledButton.styleFrom(backgroundColor: c.dangerSolid) : null,
          onPressed: () => Navigator.pop(ctx, true),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return ok ?? false;
}
