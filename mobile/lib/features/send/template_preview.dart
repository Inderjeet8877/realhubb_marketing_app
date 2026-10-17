import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/format.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import 'data.dart';

/// Compact phone-style preview of a template as the customer sees it
/// (port of WhatsAppTemplatePreview.tsx, `compact`).
class TemplatePreview extends StatelessWidget {
  const TemplatePreview({super.key, required this.template, required this.businessName, this.mediaUrl = ''});
  final WaTemplate template;
  final String businessName, mediaUrl;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = template;
    final media = mediaUrl.trim();
    Widget mediaBox(IconData icon, String label) => Container(
      height: 120,
      color: c.surfaceHover,
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: c.textTertiary),
          Text(label, style: AppText.caption.copyWith(color: c.textTertiary)),
        ],
      ),
    );

    return Semantics(
      label: 'Preview of template ${t.name}',
      child: Container(
        constraints: const BoxConstraints(maxWidth: 280),
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(Radii.xl),
          border: Border.all(color: c.borderStrong, width: 4),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              color: c.surface,
              padding: const EdgeInsets.symmetric(horizontal: Space.s3, vertical: Space.s2),
              child: Row(
                children: [
                  InitialsAvatar(initials(businessName.isEmpty ? 'Business' : businessName), size: 28),
                  const SizedBox(width: Space.s2),
                  Expanded(
                    child: Text(
                      businessName.isEmpty ? 'Your business' : businessName,
                      style: AppText.label.copyWith(color: c.textPrimary),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
            Container(
              color: c.chatBg,
              constraints: const BoxConstraints(maxHeight: 340),
              padding: const EdgeInsets.all(Space.s2),
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Container(
                      clipBehavior: Clip.antiAlias,
                      decoration: BoxDecoration(
                        color: c.bubbleOut,
                        borderRadius: const BorderRadius.only(
                          topLeft: Radius.circular(12),
                          topRight: Radius.circular(4),
                          bottomLeft: Radius.circular(12),
                          bottomRight: Radius.circular(12),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (t.headerType == 'image')
                            media.isEmpty
                                ? mediaBox(LucideIcons.image, 'Image needed')
                                : Image.network(
                                    media,
                                    height: 140,
                                    fit: BoxFit.cover,
                                    semanticLabel: 'Header image',
                                    errorBuilder: (_, _, _) => mediaBox(LucideIcons.image, "Image didn't load"),
                                  ),
                          if (t.headerType == 'video')
                            mediaBox(LucideIcons.video, media.isEmpty ? 'Video needed' : 'Video'),
                          if (t.headerType == 'document')
                            mediaBox(LucideIcons.fileText, media.isEmpty ? 'Document needed' : 'Document'),
                          if (t.headerType == 'text' && t.headerContent.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.fromLTRB(Space.s2, Space.s2, Space.s2, 0),
                              child: Text(t.headerContent, style: AppText.label.copyWith(color: c.textPrimary)),
                            ),
                          Padding(
                            padding: const EdgeInsets.fromLTRB(Space.s2, Space.s2, Space.s2, Space.s1),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  t.content.isEmpty ? 'Your message will appear here' : t.content,
                                  style: AppText.body.copyWith(color: c.textPrimary),
                                ),
                                if (t.footerContent.isNotEmpty)
                                  Padding(
                                    padding: const EdgeInsets.only(top: Space.s1),
                                    child: Text(
                                      t.footerContent,
                                      style: AppText.caption.copyWith(color: c.textSecondary),
                                    ),
                                  ),
                                Align(
                                  alignment: Alignment.centerRight,
                                  child: Text(
                                    DateFormat.Hm().format(DateTime.now()),
                                    style: AppText.caption.copyWith(color: c.textSecondary),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    for (final b in t.buttons)
                      Container(
                        margin: const EdgeInsets.only(top: 2),
                        padding: const EdgeInsets.symmetric(vertical: Space.s2),
                        decoration: BoxDecoration(color: c.bubbleIn, borderRadius: BorderRadius.circular(8)),
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
                              color: c.brandText,
                            ),
                            const SizedBox(width: Space.s1),
                            Flexible(
                              child: Text(
                                b.text.isEmpty ? 'Button' : b.text,
                                style: AppText.label.copyWith(color: c.brandText),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
