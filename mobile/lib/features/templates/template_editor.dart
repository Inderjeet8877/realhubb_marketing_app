import 'dart:math';

import 'package:dio/dio.dart' show FormData, MultipartFile;
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api_client.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import 'template_logic.dart';
import 'template_preview.dart';
import 'templates_screen.dart' show templateAccountProvider;

/// Create / edit a template. Pops `true` when something was saved.
class TemplateEditorScreen extends ConsumerStatefulWidget {
  const TemplateEditorScreen({super.key, this.existing, this.others = const []});
  final Template? existing;

  /// Loaded templates, for the duplicate-name check.
  final List<Template> others;

  @override
  ConsumerState<TemplateEditorScreen> createState() => _TemplateEditorScreenState();
}

class _TemplateEditorScreenState extends ConsumerState<TemplateEditorScreen> {
  late final Template? e = widget.existing;
  late final _name = TextEditingController(text: e?.name ?? '');
  late final _header = TextEditingController(text: e?.headerContent ?? '');
  late final _content = TextEditingController(text: e?.content ?? '');
  late final _footer = TextEditingController(text: e?.footerContent ?? '');
  late String _language = e?.language ?? 'en_US';
  late String _category = e?.category ?? 'MARKETING';
  late String _headerType = e?.headerType ?? 'none';
  late final List<TemplateButton> _buttons = [
    for (final b in e?.buttons ?? const <TemplateButton>[]) TemplateButton(b.type, b.text, b.value),
  ];
  bool _saving = false, _uploading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    for (final c in [_name, _header, _content, _footer]) {
      c.addListener(() => setState(() {}));
    }
  }

  @override
  void dispose() {
    for (final c in [_name, _header, _content, _footer]) {
      c.dispose();
    }
    super.dispose();
  }

  Map<String, dynamic> get _payload => {
    'name': _name.text,
    'language': _language,
    'category': _category,
    'content': _content.text,
    'headerType': _headerType,
    'headerContent': _header.text,
    'footerContent': _footer.text,
    'buttons': [for (final b in _buttons) b.toJson()],
    'accountId': '1',
  };

  /// POST — always creates a NEW template on Meta (from create or edit mode).
  Future<void> _createOnMeta() async {
    final name = _name.text;
    if (e != null && name == e!.name) {
      showSnack(
        context,
        'Template name "$name" already exists on Meta. Change the name to create a new template, '
        'or use Save locally to update without creating.',
        tone: Tone.warning,
      );
      return;
    }
    if (widget.others.any((t) => t.name.toLowerCase() == name.toLowerCase() && t.id != e?.id)) {
      showSnack(
        context,
        'Template name "$name" already exists. Change the name to create a new one.',
        tone: Tone.warning,
      );
      return;
    }
    await _submit(() => ref.read(apiClientProvider).post('/api/whatsapp/templates', body: _payload));
  }

  /// PUT — updates only the app's stored record; nothing goes to Meta.
  Future<void> _saveLocal() =>
      _submit(() => ref.read(apiClientProvider).put('/api/whatsapp/templates', body: {'id': e!.id, ..._payload}));

  Future<void> _submit(Future<dynamic> Function() call) async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final data = await call();
      if (!mounted) return;
      if (data is Map && data['success'] == true) {
        showSnack(context, '${data['message'] ?? 'Template saved'}', tone: Tone.success);
        Navigator.pop(context, true);
        return;
      }
      // POST answers 200 with success:false and Meta's error in `message`.
      setState(() => _error = '${data is Map ? data['error'] ?? data['message'] ?? '' : ''}');
    } on ApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// POST /api/upload (multipart `file`) → {success, url}.
  Future<void> _upload() async {
    final file = await FilePicker.pickFile(
      type: switch (_headerType) {
        'image' => FileType.image,
        'video' => FileType.video,
        _ => FileType.any,
      },
    );
    if (file == null) return;
    setState(() => _uploading = true);
    try {
      final form = FormData.fromMap({'file': MultipartFile.fromBytes(await file.readAsBytes(), filename: file.name)});
      final data = await ref.read(apiClientProvider).post('/api/upload', body: form);
      if (data is Map && data['success'] == true) {
        _header.text = '${data['url']}';
      } else if (mounted) {
        showSnack(context, '${data is Map ? data['error'] ?? 'Upload failed' : 'Upload failed'}', tone: Tone.danger);
      }
    } on ApiException catch (err) {
      if (mounted) showSnack(context, err.message, tone: Tone.danger);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Widget _dropdown(String label, String value, Map<String, String> options, ValueChanged<String> set) {
    final opts = {...options, if (!options.containsKey(value)) value: value};
    return DropdownButtonFormField<String>(
      initialValue: value,
      decoration: InputDecoration(labelText: label),
      items: [for (final o in opts.entries) DropdownMenuItem(value: o.key, child: Text(o.value))],
      onChanged: (v) => setState(() => set(v!)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final wide = MediaQuery.sizeOf(context).width >= 600;
    final canSubmit = !_saving && _name.text.isNotEmpty && _content.text.isNotEmpty;
    final account = ref.watch(templateAccountProvider);
    final analysis = analyzeContent(_content.text);
    const gap = SizedBox(height: Space.s4);

    final form = ListView(
      padding: const EdgeInsets.all(Space.s4),
      children: [
        Container(
          padding: const EdgeInsets.all(Space.s3),
          decoration: BoxDecoration(color: c.mintSubtle, borderRadius: BorderRadius.circular(Radii.lg)),
          child: Row(
            children: [
              Icon(LucideIcons.phone, size: 18, color: c.successFg),
              const SizedBox(width: Space.s2),
              Expanded(
                child: Text(
                  'WhatsApp account: ${account.when(data: (a) => a.label, loading: () => 'Loading account...', error: (_, _) => 'Not available')}',
                  style: AppText.label.copyWith(color: c.successFg),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: Space.s3),
        const AlertBanner(
          tone: Tone.info,
          title: 'Before you submit — what keeps a template healthy',
          message:
              'Meta tracks how often recipients block your number or report it as spam. If that rate gets too high, '
              'Meta pauses the template, and can disable it after repeated pauses.\n'
              '• Keep the tone conversational — avoid heavy emoji use, ALL CAPS, and urgency phrasing ("limited units", "act now")\n'
              '• Include an opt-out line (e.g. "Reply STOP to unsubscribe") so people can leave instead of blocking you\n'
              '• Only send to people likely to want this message — broad blasts to an unsegmented list raise block rates fast',
        ),
        if (e != null) ...[
          const SizedBox(height: Space.s3),
          AlertBanner(
            tone: Tone.warning,
            title: 'Edit mode',
            message:
                'Pre-filled from "${e!.name}". Create on Meta submits a new template for review; '
                'Save locally only updates the stored record.',
          ),
        ],
        if (_error != null) ...[
          const SizedBox(height: Space.s3),
          AlertBanner(tone: Tone.danger, title: "Couldn't save the template", message: _error),
        ],
        gap,
        _Section(1, 'Basic info', [
          TextField(
            controller: _name,
            inputFormatters: [
              TextInputFormatter.withFunction((_, n) {
                final s = sanitizeName(n.text);
                return s == n.text
                    ? n
                    : TextEditingValue(
                        text: s,
                        selection: TextSelection.collapsed(offset: min(n.selection.end, s.length)),
                      );
              }),
            ],
            decoration: const InputDecoration(
              labelText: 'Template name *',
              hintText: 'my_template',
              helperText: 'Lowercase letters, numbers and underscores. Must start with a letter.',
            ),
          ),
          gap,
          _dropdown('Language', _language, languages, (v) => _language = v),
          gap,
          _dropdown('Category', _category, categories, (v) => _category = v),
        ]),
        gap,
        _Section(2, 'Header', [
          _dropdown('Header type', _headerType, headerTypes, (v) => _headerType = v),
          if (_headerType == 'text') ...[
            gap,
            TextField(
              controller: _header,
              maxLength: 60,
              decoration: const InputDecoration(labelText: 'Header text', hintText: 'Header text here'),
            ),
          ],
          if (mediaHeaderTypes.contains(_headerType)) ...[
            gap,
            TextField(
              controller: _header,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(
                labelText: 'Media URL',
                hintText: 'https://...',
                helperText: 'A public, direct file link. Paste one or upload a file.',
              ),
            ),
            const SizedBox(height: Space.s3),
            Row(
              children: [
                OutlinedButton.icon(
                  onPressed: _uploading ? null : _upload,
                  icon: _uploading
                      ? const SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(LucideIcons.cloudUpload, size: 18),
                  label: Text(_uploading ? 'Uploading...' : 'Upload file'),
                ),
                const SizedBox(width: Space.s3),
                if (_header.text.isNotEmpty)
                  const StatusBadge('Attached', tone: Tone.success, icon: LucideIcons.circleCheck),
              ],
            ),
          ],
        ]),
        gap,
        _Section(3, 'Body', [
          TextField(
            controller: _content,
            minLines: 4,
            maxLines: 12,
            decoration: InputDecoration(
              labelText: 'Message *',
              alignLabelWithHint: true,
              hintText: 'Enter your message. Use {{1}}, {{2}} for variables',
              helperText: 'Use {{1}}, {{2}} for dynamic placeholders',
              errorText: variableIssue(_content.text),
              errorMaxLines: 3,
            ),
          ),
          if (_content.text.trim().isNotEmpty) ...[
            const SizedBox(height: Space.s3),
            Container(
              padding: const EdgeInsets.all(Space.s3),
              decoration: BoxDecoration(color: c.brandSubtle, borderRadius: BorderRadius.circular(Radii.md)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text('Predicted content score', style: AppText.label.copyWith(color: c.brandText)),
                      ),
                      Text(
                        '${analysis.score}/100 — ${analysis.label}',
                        style: AppText.label.copyWith(color: c.brandText),
                      ),
                    ],
                  ),
                  const SizedBox(height: Space.s2),
                  LinearProgressIndicator(
                    value: analysis.score / 100,
                    minHeight: 6,
                    borderRadius: BorderRadius.circular(Radii.full),
                    semanticsLabel: 'Predicted content score',
                    semanticsValue: '${analysis.score} out of 100',
                  ),
                  const SizedBox(height: Space.s2),
                  Text(
                    "Our own estimate from this text alone, before submission — not Meta's official quality rating "
                    '(shown after approval, on each template card).',
                    style: AppText.caption.copyWith(color: c.textSecondary),
                  ),
                ],
              ),
            ),
          ],
          if (analysis.warnings.isNotEmpty) ...[
            const SizedBox(height: Space.s3),
            Container(
              padding: const EdgeInsets.all(Space.s3),
              decoration: BoxDecoration(color: c.warningBg, borderRadius: BorderRadius.circular(Radii.md)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    "Won't block submission, but worth considering — these patterns raise the odds recipients "
                    'block or report this template later:',
                    style: AppText.label.copyWith(color: c.warningFg),
                  ),
                  for (final w in analysis.warnings)
                    Padding(
                      padding: const EdgeInsets.only(top: Space.s1),
                      child: Text('•  $w', style: AppText.caption.copyWith(color: c.warningFg)),
                    ),
                ],
              ),
            ),
          ],
        ]),
        gap,
        _Section(4, 'Footer & buttons', [
          TextField(
            controller: _footer,
            maxLength: 60,
            decoration: const InputDecoration(labelText: 'Footer text (optional)'),
          ),
          const SizedBox(height: Space.s2),
          Wrap(
            spacing: Space.s2,
            runSpacing: Space.s2,
            children: [
              for (final (type, label, text) in const [
                ('URL', 'URL button', 'Click Here'),
                ('PHONE', 'Call button', 'Call Us'),
                ('QUICK_REPLY', 'Quick reply', 'Yes'),
              ])
                OutlinedButton.icon(
                  onPressed: () => setState(() => _buttons.add(TemplateButton(type, text))),
                  icon: const Icon(LucideIcons.plus, size: 18),
                  label: Text(label),
                ),
            ],
          ),
          for (final b in _buttons) ...[
            const SizedBox(height: Space.s3),
            Container(
              key: ObjectKey(b),
              padding: const EdgeInsets.fromLTRB(Space.s3, 0, 0, Space.s3),
              decoration: BoxDecoration(
                border: Border.all(color: c.border),
                borderRadius: BorderRadius.circular(Radii.md),
              ),
              child: Column(
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(switch (b.type) {
                          'URL' => 'URL button',
                          'PHONE' => 'Call button',
                          _ => 'Quick reply',
                        }, style: AppText.overline.copyWith(color: c.textSecondary)),
                      ),
                      IconButton(
                        tooltip: 'Remove button',
                        icon: Icon(LucideIcons.x, color: c.dangerFg),
                        onPressed: () => setState(() => _buttons.remove(b)),
                      ),
                    ],
                  ),
                  Padding(
                    padding: const EdgeInsets.only(right: Space.s3),
                    child: Column(
                      children: [
                        TextFormField(
                          initialValue: b.text,
                          decoration: const InputDecoration(labelText: 'Button text'),
                          onChanged: (v) => setState(() => b.text = v),
                        ),
                        if (b.type != 'QUICK_REPLY') ...[
                          const SizedBox(height: Space.s2),
                          TextFormField(
                            initialValue: b.value,
                            keyboardType: b.type == 'URL' ? TextInputType.url : TextInputType.phone,
                            decoration: InputDecoration(
                              labelText: b.type == 'URL' ? 'Link' : 'Phone number',
                              hintText: b.type == 'URL' ? 'https://...' : '+91...',
                            ),
                            onChanged: (v) => b.value = v,
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ]),
      ],
    );

    final preview = ListView(
      padding: const EdgeInsets.all(Space.s4),
      children: [
        Text('Live preview', style: AppText.h3.copyWith(color: c.textPrimary)),
        const SizedBox(height: Space.s3),
        Center(
          child: TemplatePreview(
            businessName: account.value?.name ?? '',
            headerType: _headerType,
            headerContent: _header.text,
            content: _content.text,
            footerContent: _footer.text,
            buttons: _buttons,
            compact: wide,
          ),
        ),
        const SizedBox(height: Space.s2),
        Text(
          'Approximate rendering — actual appearance may vary slightly by device.',
          textAlign: TextAlign.center,
          style: AppText.caption.copyWith(color: c.textTertiary),
        ),
      ],
    );

    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text(e == null ? 'Create template' : 'Edit: ${e!.name}', overflow: TextOverflow.ellipsis),
          bottom: wide
              ? null
              : const TabBar(
                  tabs: [
                    Tab(icon: Icon(LucideIcons.squarePen, size: 18), text: 'Edit'),
                    Tab(icon: Icon(LucideIcons.eye, size: 18), text: 'Preview'),
                  ],
                ),
        ),
        body: wide
            ? Row(
                children: [
                  Expanded(child: form),
                  const VerticalDivider(width: 1),
                  SizedBox(width: 320, child: preview),
                ],
              )
            : TabBarView(children: [form, preview]),
        bottomNavigationBar: Container(
          decoration: BoxDecoration(
            color: c.surface,
            border: Border(top: BorderSide(color: c.border)),
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(Space.s3),
              child: Row(
                children: [
                  TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
                  const SizedBox(width: Space.s2),
                  if (e != null) ...[
                    Expanded(
                      child: OutlinedButton(
                        onPressed: canSubmit ? _saveLocal : null,
                        child: const Text('Save locally'),
                      ),
                    ),
                    const SizedBox(width: Space.s2),
                  ],
                  Expanded(
                    child: FilledButton(
                      onPressed: canSubmit ? _createOnMeta : null,
                      child: _saving
                          ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
                          : Text(e != null ? 'Create on Meta' : 'Create template'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Numbered form section (DESIGN_PLAN §5.2).
class _Section extends StatelessWidget {
  const _Section(this.number, this.title, this.children);
  final int number;
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 12,
                backgroundColor: c.brandSubtle,
                child: Text('$number', style: AppText.caption.copyWith(color: c.brandText)),
              ),
              const SizedBox(width: Space.s2),
              Text(title.toUpperCase(), style: AppText.overline.copyWith(color: c.textPrimary)),
            ],
          ),
          const SizedBox(height: Space.s4),
          ...children,
        ],
      ),
    );
  }
}
