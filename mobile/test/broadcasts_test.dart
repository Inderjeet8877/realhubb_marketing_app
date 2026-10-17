import 'package:broadzen/features/broadcasts/broadcast_data.dart';
import 'package:broadzen/features/send/bulk/bulk_data.dart';
import 'package:broadzen/widgets/ui.dart';
import 'package:flutter_test/flutter_test.dart';

Broadcast b(String id, {String? template, String status = 'completed', int total = 10, int sent = 8}) =>
    Broadcast(id: id, batchName: 'B$id', templateName: template, status: status, total: total, sent: sent);

void main() {
  test('progress is clamped and safe on zero total', () {
    expect(broadcastProgress(0, 0), 0);
    expect(broadcastProgress(50, 200), 0.25);
    expect(broadcastProgress(250, 200), 1);
    final x = Broadcast.fromJson({'id': 'a', 'total': 40, 'sent': 9, 'failed': '1', 'status': 'processing'});
    expect(x.processed, 10);
    expect(x.progress, 0.25);
    expect(x.isProcessing, isTrue);
  });

  test('status maps follow DESIGN_PLAN §5.4', () {
    expect(broadcastStatus('processing'), ('Sending', Tone.brand));
    expect(broadcastStatus('completed'), ('Completed', Tone.success));
    expect(broadcastStatus('cancelled'), ('Cancelled', Tone.warning));
    expect(broadcastStatus('failed'), ('Failed', Tone.danger));
    expect(messageStatus('read'), ('Read', Tone.brand));
    expect(messageStatus('delivered'), ('Delivered', Tone.info));
    expect(messageStatus('sent'), ('Sent', Tone.neutral));
    expect(messageStatus('failed'), ('Failed', Tone.danger));
    expect(BroadcastContact.fromJson({'phone': '91', 'success': true}).isFailed, isFalse);
    expect(BroadcastContact.fromJson({'phone': '91', 'success': false}).isFailed, isTrue);
  });

  test('Meta error code → likely reason matches the web table', () {
    expect(metaErrorReason(131047), startsWith('More than 24 hours'));
    expect(metaErrorReason(131026), contains("isn't reachable on WhatsApp"));
    expect(metaErrorReason(100), contains('malformed phone number'));
    expect(metaErrorReason(999999), isNull);
    expect(metaErrorReason(null), isNull);
    expect(metaErrorReasons.length, 13);
  });

  test('duration formatting and completed-only duration', () {
    expect(formatDuration(const Duration(seconds: 45)), '45s');
    expect(formatDuration(const Duration(minutes: 3, seconds: 20)), '3m 20s');
    expect(formatDuration(const Duration(hours: 1, minutes: 5, seconds: 9)), '1h 5m');
    expect(formatDuration(null), '—');
    final t0 = DateTime(2026, 1, 1);
    final done = Broadcast(id: 'x', batchName: 'x', createdAt: t0, finishedAt: t0.add(const Duration(seconds: 90)));
    expect(done.duration, const Duration(seconds: 90));
    final cancelled = Broadcast(
      id: 'y',
      batchName: 'y',
      status: 'cancelled',
      createdAt: t0,
      finishedAt: t0.add(const Duration(seconds: 9)),
    );
    expect(cancelled.duration, isNull);
  });

  test('contacts chunk into ranges of 100 and custom ranges clamp', () {
    expect(rangeChunks(0), isEmpty);
    expect(rangeChunks(100), [(1, 100)]);
    expect(rangeChunks(250), [(1, 100), (101, 200), (201, 250)]);
    expect(clampRange(250, null, null), (1, 250));
    expect(clampRange(250, 0, 900), (1, 250));
    expect(clampRange(250, 120, 130), (120, 130));
    final items = List.generate(250, (i) => i + 1);
    expect(sliceRange(items, 101, 200).first, 101);
    expect(sliceRange(items, 101, 200).length, 100);
    expect(sliceRange(items, 300, 400), isEmpty);
    expect(sliceRange(items, 5, 2), isEmpty);
  });

  test('template media requirement', () {
    final img = WaTemplate(name: 'promo', headerType: 'image');
    expect(mediaProblem(null, ''), isNull);
    expect(mediaProblem(WaTemplate(name: 'plain'), ''), isNull);
    expect(mediaProblem(img, ''), contains('image header'));
    expect(mediaProblem(img, 'not a url'), contains('not a valid link'));
    expect(mediaProblem(img, 'https://res.cloudinary.com/x/a.jpg'), isNull);
  });

  test('report scope counting', () {
    final rows = [b('1', template: 'promo'), b('2', template: 'promo'), b('3'), b('4', template: 'diwali')];
    expect(templateCounts(rows), [('promo', 2), (noTemplateKey, 1), ('diwali', 1)]);
    expect(rowsInScope(rows, ReportScope.all, {}).length, 4);
    expect(rowsInScope(rows, ReportScope.single, {'promo'}).map((r) => r.id), ['1', '2']);
    expect(rowsInScope(rows, ReportScope.multiple, {'promo', noTemplateKey}).length, 3);
    expect(rowsInScope(rows, ReportScope.multiple, {}), isEmpty);
    expect(templateLabel(noTemplateKey), noTemplateLabel);

    final out = buildReportRows(rows, 'Scope: All Templates', Engagement([], [], []));
    expect(out.first, ['WhatsApp Broadcast Report']);
    expect(out.where((r) => r.isNotEmpty && '${r.first}'.startsWith('Template: ')).map((r) => r.first), [
      'Template: promo (2 broadcasts)',
      'Template: diwali (1 broadcast)',
      'Template: Custom / No Template (1 broadcast)', // custom pinned last
    ]);
    expect(out.firstWhere((r) => r.isNotEmpty && r.first == 'Contacts targeted')[1], 40);
    expect(out.any((r) => r.isNotEmpty && r.first == 'Recipient engagement and replies'), isTrue);
  });
}
