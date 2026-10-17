import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/format.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import 'template_logic.dart';

/// A template rendered the way it looks in WhatsApp on a customer's phone.
/// [compact] is the smaller frame for inline use beside a form or picker.
class TemplatePreview extends StatelessWidget {
  const TemplatePreview({
    super.key,
    this.businessName = 'Your business',
    this.headerType = 'none',
    this.headerContent = '',
    this.content = '',
    this.footerContent = '',
    this.buttons = const [],
    this.compact = false,
  });

  factory TemplatePreview.of(Template t, {String? businessName, bool compact = false}) => TemplatePreview(
    businessName: businessName ?? 'Your business',
    headerType: t.headerType,
    headerContent: t.headerContent,
    content: t.content,
    footerContent: t.footerContent,
    buttons: t.buttons,
    compact: compact,
  );

  final String businessName, headerType, headerContent, content, footerContent;
  final List<TemplateButton> buttons;
  final bool compact;

  // WhatsApp-mimic chrome: fixed dark tokens so it reads the same in both themes.
  static final _frame = AppColors.dark.canvas;
  static final _header = AppColors.dark.bubbleIn;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final onHeader = c.onBrand;
    final small = AppText.caption.copyWith(color: c.textSecondary);
    final name = businessName.trim().isEmpty ? 'Your business' : businessName.trim();

    Widget media(IconData icon, String label) => Container(
      height: 120,
      color: c.surfaceHover,
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 28, color: c.textTertiary),
          Text(label, style: small),
        ],
      ),
    );

    final header = switch (headerType) {
      'text' when headerContent.isNotEmpty => Padding(
        padding: const EdgeInsets.fromLTRB(8, 6, 8, 0),
        child: Text(headerContent, style: AppText.label.copyWith(color: c.textPrimary)),
      ),
      'image' when headerContent.isNotEmpty => Image.network(
        headerContent,
        height: 120,
        width: double.infinity,
        fit: BoxFit.cover,
        semanticLabel: 'Header image',
        errorBuilder: (_, _, _) => media(LucideIcons.image, 'Image not reachable'),
      ),
      'image' => media(LucideIcons.image, 'Header image'),
      'video' => media(LucideIcons.video, headerContent.isEmpty ? 'Header video' : 'Video attached'),
      'document' => Container(
        margin: const EdgeInsets.fromLTRB(8, 8, 8, 0),
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(color: c.bubbleIn, borderRadius: BorderRadius.circular(Radii.sm)),
        child: Row(
          children: [
            Icon(LucideIcons.fileText, size: 20, color: c.dangerFg),
            const SizedBox(width: Space.s2),
            Expanded(
              child: Text('Document attachment', style: small, overflow: TextOverflow.ellipsis),
            ),
          ],
        ),
      ),
      _ => null,
    };

    return Semantics(
      label: 'WhatsApp preview',
      child: Container(
        constraints: BoxConstraints(maxWidth: compact ? 260 : 300),
        decoration: BoxDecoration(
          color: _frame,
          borderRadius: BorderRadius.circular(28),
          border: Border.all(color: _frame, width: compact ? 5 : 6),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(height: compact ? 14 : 18),
            Container(
              color: _header,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              child: Row(
                children: [
                  Icon(LucideIcons.arrowLeft, size: 16, color: onHeader),
                  const SizedBox(width: Space.s2),
                  CircleAvatar(
                    radius: 13,
                    backgroundColor: onHeader.withValues(alpha: 0.2),
                    child: Text(name[0].toUpperCase(), style: AppText.caption.copyWith(color: onHeader)),
                  ),
                  const SizedBox(width: Space.s2),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          style: AppText.caption.copyWith(color: onHeader),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (!compact)
                          Text(
                            'Business account',
                            style: AppText.caption.copyWith(color: onHeader.withValues(alpha: 0.75)),
                          ),
                      ],
                    ),
                  ),
                  if (!compact) ...[
                    Icon(LucideIcons.video, size: 16, color: onHeader),
                    const SizedBox(width: Space.s3),
                    Icon(LucideIcons.phone, size: 16, color: onHeader),
                    const SizedBox(width: Space.s3),
                  ],
                  Icon(LucideIcons.ellipsisVertical, size: 16, color: onHeader),
                ],
              ),
            ),
            Container(
              height: compact ? 340 : 420,
              color: c.chatBg,
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(10),
                child: Align(
                  alignment: Alignment.topRight,
                  child: FractionallySizedBox(
                    widthFactor: 0.92,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Container(
                          clipBehavior: Clip.antiAlias,
                          decoration: BoxDecoration(
                            color: c.bubbleOut,
                            borderRadius: const BorderRadius.only(
                              topLeft: Radius.circular(8),
                              bottomLeft: Radius.circular(8),
                              bottomRight: Radius.circular(8),
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              ?header,
                              Padding(
                                padding: const EdgeInsets.fromLTRB(8, 6, 8, 4),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      content.isEmpty ? 'Your message will appear here...' : content,
                                      style: AppText.body.copyWith(
                                        color: content.isEmpty ? c.textTertiary : c.textPrimary,
                                      ),
                                    ),
                                    if (footerContent.isNotEmpty)
                                      Padding(
                                        padding: const EdgeInsets.only(top: 4),
                                        child: Text(footerContent, style: small),
                                      ),
                                    Align(
                                      alignment: Alignment.centerRight,
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Text(chatTime(DateTime.now()), style: small),
                                          const SizedBox(width: 4),
                                          Icon(
                                            LucideIcons.checkCheck,
                                            size: 14,
                                            color: c.infoFg,
                                            semanticLabel: 'Read',
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (buttons.isNotEmpty)
                          Container(
                            margin: const EdgeInsets.only(top: 4),
                            clipBehavior: Clip.antiAlias,
                            decoration: BoxDecoration(color: c.bubbleIn, borderRadius: BorderRadius.circular(8)),
                            child: Column(
                              children: [
                                for (final (i, b) in buttons.indexed) ...[
                                  if (i > 0) Divider(height: 1, color: c.border),
                                  Padding(
                                    padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
                                    child: Row(
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      children: [
                                        Icon(
                                          switch (b.type) {
                                            'URL' => LucideIcons.externalLink,
                                            'PHONE' => LucideIcons.phone,
                                            _ => LucideIcons.cornerUpLeft,
                                          },
                                          size: 14,
                                          color: c.infoFg,
                                        ),
                                        const SizedBox(width: 6),
                                        Flexible(
                                          child: Text(
                                            b.text.isEmpty ? 'Button' : b.text,
                                            style: AppText.label.copyWith(color: c.infoFg),
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
