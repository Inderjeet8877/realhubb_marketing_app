import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api_client.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import 'template_editor.dart';
import 'template_logic.dart';
import 'template_preview.dart';

/// GET /api/whatsapp/templates — Meta is the source of truth; returns {templates: [...]}.
final templatesProvider = FutureProvider<List<Template>>((ref) async {
  final data = await ref.read(apiClientProvider).get('/api/whatsapp/templates');
  return [for (final t in (data['templates'] as List? ?? const [])) Template.fromJson(t as Map)];
});

/// GET /api/whatsapp/account-info — the sending number (web hard-codes account 1).
final templateAccountProvider = FutureProvider<({String name, String label})>((ref) async {
  final d = await ref.read(apiClientProvider).get('/api/whatsapp/account-info', query: {'account_id': '1'});
  final name = '${d['verifiedName'] ?? ''}';
  return (name: name, label: '$name (${d['displayPhoneNumber'] ?? ''})'.trim());
});

class TemplatesScreen extends ConsumerStatefulWidget {
  const TemplatesScreen({super.key});

  @override
  ConsumerState<TemplatesScreen> createState() => _TemplatesScreenState();
}

class _TemplatesScreenState extends ConsumerState<TemplatesScreen> {
  bool _syncing = false;

  Future<void> _reload() => ref.refresh(templatesProvider.future).then((_) {}, onError: (_) {});

  /// "Refresh status": upsert Meta's live status into the app's records, then re-read.
  Future<void> _sync() async {
    setState(() => _syncing = true);
    try {
      await ref.read(apiClientProvider).get('/api/whatsapp/templates', query: {'syncFromMeta': 'true'});
      await _reload();
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, tone: Tone.danger);
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  Future<void> _openEditor([Template? t]) async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => TemplateEditorScreen(existing: t, others: ref.read(templatesProvider).value ?? const []),
      ),
    );
    if (saved == true) _reload();
  }

  Future<void> _delete(Template t) async {
    final ok = await confirm(
      context,
      title: 'Delete template?',
      message: 'This removes "${t.name}" from Broadzen. It does not delete the template on Meta.',
      confirmLabel: 'Delete',
      danger: true,
    );
    if (!ok || !mounted) return;
    try {
      await ref
          .read(apiClientProvider)
          .delete(
            '/api/whatsapp/templates',
            body: {
              'ids': [t.id],
            },
          );
      if (mounted) showSnack(context, 'Template deleted', tone: Tone.success);
      _reload();
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, tone: Tone.danger);
    }
  }

  void _preview(Template t) {
    final s = templateStatus(t.status);
    final c = context.colors;
    showDialog<void>(
      context: context,
      builder: (ctx) => Dialog(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Space.s5),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(t.name, style: AppText.h3.copyWith(color: c.textPrimary)),
                        Text('${t.language} • ${t.category}', style: AppText.caption.copyWith(color: c.textSecondary)),
                        const SizedBox(height: Space.s1),
                        StatusBadge(s.label, tone: s.tone, icon: s.icon),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Close preview',
                    icon: const Icon(LucideIcons.x),
                    onPressed: () => Navigator.pop(ctx),
                  ),
                ],
              ),
              const SizedBox(height: Space.s4),
              Consumer(
                builder: (_, ref, _) =>
                    TemplatePreview.of(t, businessName: ref.watch(templateAccountProvider).value?.name),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(templatesProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Templates'),
        actions: [
          _syncing
              ? const Padding(
                  padding: EdgeInsets.all(Space.s4),
                  child: SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2)),
                )
              : IconButton(
                  tooltip: 'Refresh status from Meta',
                  icon: const Icon(LucideIcons.refreshCw),
                  onPressed: _sync,
                ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openEditor,
        icon: const Icon(LucideIcons.plus),
        label: const Text('Create'),
      ),
      body: value.when(
        skipLoadingOnRefresh: true,
        loading: () => const LoadingList(itemHeight: 200),
        error: (e, _) => _list(const [], error: '$e'),
        data: (list) => _list(list),
      ),
    );
  }

  Widget _list(List<Template> list, {String? error}) {
    final notices = [
      if (error != null)
        AlertBanner(
          tone: Tone.danger,
          title: "Couldn't load templates from Meta",
          message: error,
          actionLabel: 'Try again',
          onAction: _reload,
        ),
      if (list.any((t) => t.status == 'pending'))
        const AlertBanner(
          tone: Tone.info,
          title: 'Some templates are still pending Meta review',
          message: 'Tap Refresh status in the top bar to check for updates.',
        ),
      if (list.any((t) => t.status == 'paused' || t.status == 'disabled'))
        const AlertBanner(
          tone: Tone.warning,
          title: 'Paused or disabled by Meta',
          message:
              'One or more templates were paused or disabled due to quality issues. See the details on each '
              'affected template before sending with it again.',
        ),
    ];
    return RefreshIndicator(
      onRefresh: _reload,
      child: LayoutBuilder(
        builder: (context, box) {
          final cols = box.maxWidth >= 1000
              ? 3
              : box.maxWidth >= 600
              ? 2
              : 1;
          final w = (box.maxWidth - Space.s4 * 2 - Space.s3 * (cols - 1)) / cols;
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(Space.s4, Space.s4, Space.s4, 96),
            children: [
              for (final n in notices)
                Padding(
                  padding: const EdgeInsets.only(bottom: Space.s3),
                  child: n,
                ),
              if (list.isEmpty && error == null)
                EmptyState(
                  icon: LucideIcons.fileText,
                  title: 'No templates yet',
                  message: 'Create your first template to start sending messages.',
                  actionLabel: 'Create template',
                  onAction: _openEditor,
                )
              else
                Wrap(
                  spacing: Space.s3,
                  runSpacing: Space.s3,
                  children: [
                    for (final t in list)
                      SizedBox(
                        width: w,
                        child: _TemplateCard(
                          t,
                          onPreview: () => _preview(t),
                          onEdit: () => _openEditor(t),
                          onDelete: () => _delete(t),
                        ),
                      ),
                  ],
                ),
            ],
          );
        },
      ),
    );
  }
}

class _TemplateCard extends StatelessWidget {
  const _TemplateCard(this.t, {required this.onPreview, required this.onEdit, required this.onDelete});
  final Template t;
  final VoidCallback onPreview, onEdit, onDelete;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final s = templateStatus(t.status);
    final explanation = statusExplanation(t);
    Widget box(Color bg, Widget child) => Container(
      width: double.infinity,
      padding: const EdgeInsets.all(Space.s3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(Radii.md)),
      child: child,
    );

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(t.name, style: AppText.h3.copyWith(color: c.textPrimary)),
                    Text('${t.language} • ${t.category}', style: AppText.caption.copyWith(color: c.textSecondary)),
                  ],
                ),
              ),
              const SizedBox(width: Space.s2),
              StatusBadge(s.label, tone: s.tone, icon: s.icon),
            ],
          ),
          const SizedBox(height: Space.s3),
          box(
            c.surfaceSubtle,
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (t.headerType == 'text' && t.headerContent.isNotEmpty)
                  Text(t.headerContent, style: AppText.label.copyWith(color: c.textPrimary)),
                Text(
                  t.content,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.body.copyWith(color: c.textSecondary),
                ),
              ],
            ),
          ),
          if (t.isMediaHeader) ...[
            const SizedBox(height: Space.s2),
            t.headerContent.isNotEmpty
                ? Row(
                    children: [
                      Icon(LucideIcons.link, size: 16, color: c.infoFg),
                      const SizedBox(width: Space.s2),
                      Expanded(
                        child: Text(
                          t.headerContent,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppText.caption.copyWith(color: c.infoFg),
                        ),
                      ),
                      TextButton.icon(
                        onPressed: () async {
                          await Clipboard.setData(ClipboardData(text: t.headerContent));
                          if (context.mounted) showSnack(context, 'Media URL copied');
                        },
                        icon: const Icon(LucideIcons.copy, size: 16),
                        label: const Text('Copy URL'),
                      ),
                    ],
                  )
                : box(
                    c.dangerBg,
                    Text(
                      'No ${t.headerType} attached — edit this template to add one before sending.',
                      style: AppText.caption.copyWith(color: c.dangerFg),
                    ),
                  ),
          ],
          if (explanation != null) ...[
            const SizedBox(height: Space.s2),
            box(c.warningBg, Text(explanation, style: AppText.caption.copyWith(color: c.warningFg))),
          ],
          const SizedBox(height: Space.s2),
          SizedBox(
            width: double.infinity,
            child: Wrap(
              alignment: WrapAlignment.end,
              spacing: Space.s1,
              children: [
                TextButton.icon(
                  onPressed: onPreview,
                  icon: const Icon(LucideIcons.eye, size: 18),
                  label: const Text('Preview'),
                ),
                TextButton.icon(
                  onPressed: onEdit,
                  icon: const Icon(LucideIcons.squarePen, size: 18),
                  label: const Text('Edit'),
                ),
                TextButton.icon(
                  onPressed: onDelete,
                  style: TextButton.styleFrom(foregroundColor: c.dangerFg),
                  icon: const Icon(LucideIcons.trash2, size: 18),
                  label: const Text('Delete'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
