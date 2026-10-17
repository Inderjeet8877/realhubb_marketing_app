import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/format.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import 'contacts_data.dart';
import 'contacts_models.dart';

/// Matches the web: each addBatch is a full duplicate pass over the sheet.
const _batchSize = 500;

enum _Phase { details, parsing, uploading, done }

class _Summary {
  _Summary({required this.parse, required this.saved, required this.dbDuplicates, required this.failedContacts});
  final ImportParse parse;
  final int saved, dbDuplicates, failedContacts;
  int get duplicates => parse.fileDuplicates + parse.existingDuplicates + dbDuplicates;
}

/// Full-screen wizard: details + file → parsing → uploading → summary.
/// Pops `true` when anything was saved.
class ImportContactsPage extends ConsumerStatefulWidget {
  const ImportContactsPage({super.key});

  @override
  ConsumerState<ImportContactsPage> createState() => _ImportContactsPageState();
}

class _ImportContactsPageState extends ConsumerState<ImportContactsPage> {
  final _name = TextEditingController();
  var _phase = _Phase.details;
  String? _nameError;
  var _done = 0, _total = 0;
  _Summary? _summary;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _pick() async {
    final batch = _name.text.trim();
    if (batch.isEmpty) {
      setState(() => _nameError = 'Enter a batch name first');
      return;
    }
    final file = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: const ['csv', 'xlsx', 'xls']);
    if (file == null || !mounted) return;
    final ext = (file.extension ?? '').toLowerCase().replaceAll('.', '');
    if (!const ['csv', 'xlsx', 'xls'].contains(ext)) {
      showSnack(context, 'Choose a CSV or Excel file (.csv / .xlsx)', tone: Tone.danger);
      return;
    }
    setState(() => _phase = _Phase.parsing);
    try {
      final bytes = await file.readAsBytes();
      var parse = ext == 'csv'
          ? parseContactRows(parseCsvRows(utf8.decode(bytes, allowMalformed: true)), batch)
          : await ref.read(contactsApiProvider).previewExcel(bytes, file.name, batch);
      final existing = ref.read(contactsProvider).value;
      if (existing != null) parse = parse.excluding(existingPhoneSet(existing));
      if (parse.isEmpty) throw const FormatException('No data found. Make sure the file has name and phone columns.');
      if (parse.valid.isEmpty) {
        setState(() {
          _summary = _Summary(parse: parse, saved: 0, dbDuplicates: 0, failedContacts: 0);
          _phase = _Phase.done;
        });
        return;
      }
      await _upload(parse);
    } catch (e) {
      if (!mounted) return;
      showSnack(context, e is FormatException ? e.message : '$e', tone: Tone.danger);
      setState(() => _phase = _Phase.details);
    }
  }

  /// Retries each batch 3 times; a failing batch is recorded, not fatal.
  Future<void> _upload(ImportParse parse) async {
    setState(() {
      _phase = _Phase.uploading;
      _done = 0;
      _total = parse.valid.length;
    });
    final api = ref.read(contactsApiProvider);
    var saved = 0, dbDup = 0, failed = 0;
    for (final b in chunk(parse.valid, _batchSize)) {
      var ok = false;
      for (var attempt = 0; attempt < 3 && !ok; attempt++) {
        try {
          final (s, d) = await api.addBatch(b);
          saved += s;
          dbDup += d;
          ok = true;
        } catch (_) {
          if (attempt < 2) await Future<void>.delayed(Duration(milliseconds: 1500 * (attempt + 1)));
        }
      }
      if (!ok) failed += b.length;
      if (!mounted) return;
      setState(() => _done += b.length);
    }
    setState(() {
      _summary = _Summary(parse: parse, saved: saved, dbDuplicates: dbDup, failedContacts: failed);
      _phase = _Phase.done;
    });
  }

  @override
  Widget build(BuildContext context) {
    final busy = _phase == _Phase.parsing || _phase == _Phase.uploading;
    return PopScope(
      canPop: !busy,
      child: Scaffold(
        appBar: AppBar(title: const Text('Import contacts'), automaticallyImplyLeading: !busy),
        body: switch (_phase) {
          _Phase.details => _details(context),
          _Phase.parsing => const _Progress(title: 'Reading your file', message: 'Checking rows and duplicates'),
          _Phase.uploading => _Progress(
            title: 'Uploading contacts',
            message: '${number(_done)} of ${number(_total)}',
            value: _total == 0 ? null : _done / _total,
          ),
          _Phase.done => _SummaryView(
            summary: _summary!,
            onDone: () => Navigator.pop(context, (_summary?.saved ?? 0) > 0),
          ),
        },
      ),
    );
  }

  Widget _details(BuildContext context) {
    final c = context.colors;
    return ListView(
      padding: const EdgeInsets.all(Space.s4),
      children: [
        TextField(
          controller: _name,
          textCapitalization: TextCapitalization.words,
          onChanged: (_) => _nameError == null ? null : setState(() => _nameError = null),
          decoration: InputDecoration(
            labelText: 'Batch name *',
            hintText: 'e.g. Godrej Leads May 2025',
            helperText: 'Used to identify this upload in bulk messaging.',
            errorText: _nameError,
          ),
        ),
        const SizedBox(height: Space.s6),
        AppCard(
          onTap: _pick,
          padding: const EdgeInsets.all(Space.s6),
          child: Column(
            children: [
              Icon(LucideIcons.fileSpreadsheet, size: 40, color: c.brandText),
              const SizedBox(height: Space.s3),
              Text('CSV or Excel file', style: AppText.h3.copyWith(color: c.textPrimary)),
              const SizedBox(height: Space.s1),
              Text(
                'CSV is checked on your phone. Excel files are checked by the server.',
                textAlign: TextAlign.center,
                style: AppText.body.copyWith(color: c.textSecondary),
              ),
              const SizedBox(height: Space.s4),
              FilledButton.icon(
                onPressed: _pick,
                icon: const Icon(LucideIcons.upload),
                label: const Text('Choose file'),
              ),
            ],
          ),
        ),
        const SizedBox(height: Space.s4),
        Text('Supported column headers', style: AppText.label.copyWith(color: c.textPrimary)),
        const SizedBox(height: Space.s2),
        Wrap(
          spacing: Space.s2,
          runSpacing: Space.s2,
          children: [
            for (final h in const ['name / names', 'phone / mobile', 'contact', 'email', 'tags'])
              StatusBadge(h, tone: Tone.info),
          ],
        ),
        const SizedBox(height: Space.s2),
        Text(
          'Phone numbers are auto-formatted. Duplicates and invalid rows are skipped and listed after upload.',
          style: AppText.caption.copyWith(color: c.textTertiary),
        ),
      ],
    );
  }
}

class _Progress extends StatelessWidget {
  const _Progress({required this.title, required this.message, this.value});
  final String title, message;
  final double? value;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(Space.s8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(title, style: AppText.h3.copyWith(color: c.textPrimary)),
            const SizedBox(height: Space.s4),
            LinearProgressIndicator(value: value, minHeight: 8, borderRadius: BorderRadius.circular(Radii.full)),
            const SizedBox(height: Space.s2),
            Text(
              value == null ? message : '$message · ${(value! * 100).round()}%',
              style: AppText.body.copyWith(color: c.textSecondary),
            ),
            const SizedBox(height: Space.s2),
            Text('Keep this screen open.', style: AppText.caption.copyWith(color: c.textTertiary)),
          ],
        ),
      ),
    );
  }
}

class _SummaryView extends StatelessWidget {
  const _SummaryView({required this.summary, required this.onDone});
  final _Summary summary;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final s = summary;
    final invalid = s.parse.invalid;
    const shown = 200;
    return ListView(
      padding: const EdgeInsets.all(Space.s4),
      children: [
        if (s.parse.valid.isEmpty)
          const AlertBanner(
            tone: Tone.warning,
            title: 'Nothing to upload',
            message: 'Every row was a duplicate or invalid.',
          )
        else if (s.failedContacts > 0)
          AlertBanner(
            tone: Tone.warning,
            title: 'Finished with issues: ${number(s.failedContacts)} contact(s) not saved',
            message:
                'Some batches failed after retrying. Import the same file again to retry; '
                'use "Remove duplicates" on the batch if copies appear.',
          )
        else
          const AlertBanner(tone: Tone.success, title: 'Upload complete'),
        const SizedBox(height: Space.s4),
        StatGrid(
          children: [
            StatCard(label: 'Added', value: number(s.saved), icon: LucideIcons.circleCheck, tone: Tone.success),
            StatCard(label: 'Duplicates', value: number(s.duplicates), icon: LucideIcons.copyMinus, tone: Tone.warning),
            StatCard(label: 'Invalid', value: number(invalid.length), icon: LucideIcons.circleX, tone: Tone.danger),
          ],
        ),
        if (s.duplicates > 0) ...[
          const SizedBox(height: Space.s3),
          Text(
            [
              if (s.parse.fileDuplicates > 0) '${number(s.parse.fileDuplicates)} repeated within the file',
              if (s.parse.existingDuplicates + s.dbDuplicates > 0)
                '${number(s.parse.existingDuplicates + s.dbDuplicates)} already in your contacts',
            ].join(' · '),
            style: AppText.body.copyWith(color: c.textSecondary),
          ),
        ],
        if (invalid.isNotEmpty) ...[
          const SizedBox(height: Space.s4),
          Card(
            clipBehavior: Clip.antiAlias,
            child: ExpansionTile(
              leading: Icon(LucideIcons.triangleAlert, color: c.dangerFg),
              title: Text('${number(invalid.length)} invalid row${invalid.length == 1 ? '' : 's'}'),
              subtitle: const Text('Tap to review'),
              children: [
                for (final r in invalid.take(shown))
                  ListTile(
                    dense: true,
                    leading: Text('Row ${r.row}', style: AppText.caption.copyWith(color: c.textTertiary)),
                    title: Text(r.reason, style: AppText.label.copyWith(color: c.dangerFg)),
                    subtitle: Text(
                      '${r.rawName.isEmpty ? '(no name)' : r.rawName} · ${r.rawPhone.isEmpty ? '(no phone)' : r.rawPhone}',
                    ),
                  ),
                if (invalid.length > shown)
                  Padding(
                    padding: const EdgeInsets.all(Space.s3),
                    child: Text('and ${number(invalid.length - shown)} more'),
                  ),
              ],
            ),
          ),
        ],
        const SizedBox(height: Space.s6),
        FilledButton(onPressed: onDone, child: const Text('Done')),
      ],
    );
  }
}
