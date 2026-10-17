import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../widgets/ui.dart';

// ── Models ──────────────────────────────────────────────────────────────────

int _int(Object? v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;
int? _intOrNull(Object? v) => v is num ? v.toInt() : int.tryParse('${v ?? ''}');
String? _str(Object? v) => v == null || '$v'.isEmpty ? null : '$v';

/// One row of GET /api/whatsapp/broadcasts (a `bulk_reports` doc).
class Broadcast {
  Broadcast({
    required this.id,
    required this.batchName,
    this.templateName,
    this.status = 'completed',
    this.cancelReason,
    this.total = 0,
    this.sent = 0,
    this.failed = 0,
    this.delivered = 0,
    this.read = 0,
    this.createdAt,
    this.finishedAt,
    this.contacts = const [],
  });

  factory Broadcast.fromJson(Map<String, dynamic> j) => Broadcast(
    id: '${j['id'] ?? ''}',
    batchName: _str(j['batchName']) ?? 'Unknown Batch',
    templateName: _str(j['templateName']),
    status: _str(j['status']) ?? 'completed',
    cancelReason: _str(j['cancelReason']),
    total: _int(j['total']),
    sent: _int(j['sent']),
    failed: _int(j['failed']),
    delivered: _int(j['delivered']),
    read: _int(j['read']),
    createdAt: parseDate(j['createdAt']),
    finishedAt: parseDate(j['finishedAt']),
    contacts: [
      for (final c in (j['contacts'] as List? ?? const []))
        if (c is Map) BroadcastContact.fromJson(c.cast<String, dynamic>()),
    ],
  );

  final String id, batchName, status;
  final String? templateName, cancelReason;
  final int total, sent, failed, delivered, read;
  final DateTime? createdAt, finishedAt;

  /// Inline per-contact results — only older reports carry these.
  final List<BroadcastContact> contacts;

  bool get isProcessing => status == 'processing';
  int get processed => sent + failed;
  double get progress => broadcastProgress(processed, total);

  /// Only for a full completion — cancelled/failed runs would misleadingly look finished.
  Duration? get duration =>
      status == 'completed' && createdAt != null && finishedAt != null ? finishedAt!.difference(createdAt!) : null;
}

/// Per-recipient result from `?id=` (or the inline array on old reports).
class BroadcastContact {
  BroadcastContact({
    required this.phone,
    required this.name,
    this.success = false,
    this.status = 'failed',
    this.error,
    this.errorCode,
    this.errorSubcode,
    this.errorDetail,
  });

  factory BroadcastContact.fromJson(Map<String, dynamic> j) {
    final phone = '${j['phone'] ?? ''}';
    return BroadcastContact(
      phone: phone,
      name: _str(j['name']) ?? phone,
      success: j['success'] == true,
      status: _str(j['status']) ?? (j['success'] == true ? 'sent' : 'failed'),
      error: _str(j['error']),
      errorCode: _intOrNull(j['errorCode']),
      errorSubcode: _intOrNull(j['errorSubcode']),
      errorDetail: _str(j['errorDetail']),
    );
  }

  final String phone, name, status;
  final bool success;
  final String? error, errorDetail;
  final int? errorCode, errorSubcode;

  bool get isFailed => !const {'read', 'delivered', 'sent'}.contains(status);
}

// ── Pure logic (unit-tested) ────────────────────────────────────────────────

double broadcastProgress(int processed, int total) => total <= 0 ? 0 : (processed / total).clamp(0, 1).toDouble();

/// DESIGN_PLAN §5.4 broadcast status map.
(String, Tone) broadcastStatus(String status) => switch (status) {
  'processing' => ('Sending', Tone.brand),
  'completed' => ('Completed', Tone.success),
  'cancelled' => ('Cancelled', Tone.warning),
  'failed' => ('Failed', Tone.danger),
  _ => (status.isEmpty ? 'Unknown' : status, Tone.neutral),
};

/// DESIGN_PLAN §5.4 message status map.
(String, Tone) messageStatus(String status) => switch (status) {
  'read' => ('Read', Tone.brand),
  'delivered' => ('Delivered', Tone.info),
  'sent' => ('Sent', Tone.neutral),
  _ => ('Failed', Tone.danger),
};

/// Same table as the web's describeMetaErrorCode (src/lib/whatsapp-send.ts) —
/// unknown codes return null so the UI shows Meta's own message instead of guessing.
const metaErrorReasons = <int, String>{
  131026: "This number likely isn't reachable on WhatsApp (not registered, or the device has been offline/unreachable for an extended period).",
  131047: 'More than 24 hours have passed since this contact last messaged you, and no approved template was used for this send — outside that window, only template messages can be delivered.',
  131031: 'This WhatsApp Business Account has been restricted by Meta — check Meta Business Suite for the reason.',
  131048: "This send was blocked as part of Meta's spam-rate protection for this account/number.",
  131056: "This account/number has hit Meta's throughput ('pair rate') limit — sending too many messages too quickly.",
  132000: "The number of variables provided doesn't match what the template expects.",
  132001: "The template this send referenced doesn't exist (or was deleted) on Meta's side.",
  132005: 'This template is currently paused by Meta due to quality issues.',
  132007: 'This template has been disabled by Meta.',
  132015: "This template isn't approved for use yet.",
  100: 'Meta rejected a parameter in this request — most often an invalid or malformed phone number.',
  131009: 'One of the parameters (often the phone number) is not in a format Meta accepts.',
  470: 'This message falls outside the allowed messaging window/policy for this template category.',
};

String? metaErrorReason(int? code) => code == null ? null : metaErrorReasons[code];

/// Same as the web's formatDuration: "1h 5m", "3m 20s", "45s".
String formatDuration(Duration? d) {
  if (d == null || d.isNegative) return '—';
  final s = (d.inMilliseconds / 1000).round();
  final h = s ~/ 3600, m = (s % 3600) ~/ 60, sec = s % 60;
  if (h > 0) return '${h}h ${m}m';
  if (m > 0) return '${m}m ${sec}s';
  return '${sec}s';
}

// Report builder

enum ReportScope { all, single, multiple }

const noTemplateKey = '__none__';
const noTemplateLabel = 'Custom / No Template';

String templateKeyOf(Broadcast b) => b.templateName ?? noTemplateKey;
String templateLabel(String key) => key == noTemplateKey ? noTemplateLabel : key;

/// Templates with broadcast counts, most-used first.
List<(String key, int count)> templateCounts(List<Broadcast> rows) {
  final m = <String, int>{};
  for (final r in rows) {
    m.update(templateKeyOf(r), (v) => v + 1, ifAbsent: () => 1);
  }
  return m.entries.map((e) => (e.key, e.value)).toList()..sort((a, b) => b.$2.compareTo(a.$2));
}

List<Broadcast> rowsInScope(List<Broadcast> rows, ReportScope scope, Set<String> keys) {
  if (scope == ReportScope.all) return rows;
  return rows.where((r) => keys.contains(templateKeyOf(r))).toList();
}

class EngagementContact {
  EngagementContact(this.phone, this.name, this.message, this.date);
  factory EngagementContact.fromJson(Map<String, dynamic> j) => EngagementContact(
    '${j['phone'] ?? ''}',
    '${j['name'] ?? j['phone'] ?? ''}',
    _str(j['message']),
    parseDate(j['date']),
  );
  final String phone, name;
  final String? message;
  final DateTime? date;
}

class Engagement {
  Engagement(this.replied, this.noReply, this.optedOut);
  factory Engagement.fromJson(Map<String, dynamic> j) {
    List<EngagementContact> list(String k) => [
      for (final c in (j[k] as List? ?? const []))
        if (c is Map) EngagementContact.fromJson(c.cast<String, dynamic>()),
    ];
    return Engagement(list('replied'), list('noReply'), list('optedOut'));
  }
  final List<EngagementContact> replied, noReply, optedOut;
}

String _pct(int n, int of) => of > 0 ? percent(n / of * 100) : '—';
String _date(DateTime? d) => d == null ? '—' : DateFormat('d MMM yyyy, HH:mm').format(d.toLocal());

/// Rows for the CSV export — same sections as the web PDF (overall summary,
/// per-template summary + broadcast details, optional engagement lists).
List<List<Object>> buildReportRows(List<Broadcast> rows, String scopeLabel, Engagement? eng, {DateTime? now}) {
  List<List<Object>> summary(List<Broadcast> rs) {
    int sum(int Function(Broadcast) f) => rs.fold(0, (a, r) => a + f(r));
    final durations = [for (final r in rs) ?r.duration];
    final avg = durations.isEmpty
        ? null
        : Duration(milliseconds: durations.fold(0, (a, d) => a + d.inMilliseconds) ~/ durations.length);
    int count(String s) => rs.where((r) => r.status == s).length;
    return [
      ['Broadcasts', rs.length],
      ['Contacts targeted', sum((r) => r.total)],
      ['Sent', sum((r) => r.sent)],
      ['Delivered', sum((r) => r.delivered)],
      ['Read', sum((r) => r.read)],
      ['Failed', sum((r) => r.failed)],
      ['Success rate (sent / targeted)', _pct(sum((r) => r.sent), sum((r) => r.total))],
      [
        'Completed / Cancelled / Failed / In progress',
        '${count('completed')} / ${count('cancelled')} / ${count('failed')} / ${count('processing')}',
      ],
      ['Average duration (completed)', formatDuration(avg)],
    ];
  }

  final out = <List<Object>>[
    ['WhatsApp Broadcast Report'],
    [scopeLabel],
    ['Generated ${_date(now ?? DateTime.now())}'],
    [],
    ['Overall summary'],
    ...summary(rows),
  ];

  final groups = <String, List<Broadcast>>{};
  for (final r in rows) {
    groups.putIfAbsent(templateKeyOf(r), () => []).add(r);
  }
  final keys = groups.keys.toList()
    ..sort((a, b) {
      if (a == noTemplateKey) return 1;
      if (b == noTemplateKey) return -1;
      return groups[b]!.fold(0, (s, r) => s + r.sent).compareTo(groups[a]!.fold(0, (s, r) => s + r.sent));
    });
  for (final k in keys) {
    final g = groups[k]!..sort((a, b) => (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0)));
    out
      ..add([])
      ..add(['Template: ${templateLabel(k)} (${g.length} broadcast${g.length == 1 ? '' : 's'})'])
      ..addAll(summary(g))
      ..add(['Batch', 'Date', 'Status', 'Total', 'Sent', 'Delivered', 'Read', 'Failed', 'Duration', 'Note'])
      ..addAll([
        for (final r in g)
          [
            r.batchName,
            _date(r.createdAt),
            r.isProcessing ? 'In progress' : broadcastStatus(r.status).$1,
            r.total,
            r.sent,
            r.delivered,
            r.read,
            r.failed,
            formatDuration(r.duration),
            r.status == 'cancelled' ? (r.cancelReason ?? '') : (r.status == 'failed' ? 'Broadcast failed' : ''),
          ],
      ]);
  }

  if (eng != null) {
    final unique = eng.replied.length + eng.noReply.length + eng.optedOut.length;
    out.addAll([
      [],
      ['Recipient engagement and replies'],
      ['Total unique contacts', unique],
      ['Replied / interested', eng.replied.length],
      ['No reply', eng.noReply.length],
      ['Opted out / said stop', eng.optedOut.length],
      ['Reply rate', _pct(eng.replied.length, unique)],
      ['Opt-out rate', _pct(eng.optedOut.length, unique)],
    ]);
    for (final (title, list, withMsg) in [
      ('Replied / interested', eng.replied, true),
      ('Opted out / said stop', eng.optedOut, true),
      ('No reply', eng.noReply, false),
    ]) {
      out
        ..add([])
        ..add(['$title (${list.length})'])
        ..add(withMsg ? ['Name', 'Phone', 'Message', 'Date'] : ['Name', 'Phone'])
        ..addAll([
          for (final c in list) withMsg ? [c.name, c.phone, c.message ?? '—', _date(c.date)] : [c.name, c.phone],
        ]);
    }
  }
  return out;
}

// ── Data access ─────────────────────────────────────────────────────────────

class BroadcastsApi {
  BroadcastsApi(this._api);
  final ApiClient _api;
  static const _base = '/api/whatsapp/broadcasts';

  Future<List<Broadcast>> list({int? limit}) async {
    final d = await _api.get(_base, query: {'limit': ?limit});
    if (d is Map && d['success'] == false && d['error'] != null) throw ApiException('${d['error']}');
    return [
      for (final b in (d is Map ? d['broadcasts'] as List? : null) ?? const [])
        if (b is Map) Broadcast.fromJson(b.cast<String, dynamic>()),
    ];
  }

  Future<List<BroadcastContact>> contacts(String id) async {
    final d = await _api.get(_base, query: {'id': id});
    return [
      for (final c in (d is Map ? d['contacts'] as List? : null) ?? const [])
        if (c is Map) BroadcastContact.fromJson(c.cast<String, dynamic>()),
    ];
  }

  Future<void> resume(String id) => _api.post('$_base/resume', body: {'broadcastId': id});
  Future<void> cancel(String id, String reason) =>
      _api.post('$_base/cancel', body: {'broadcastId': id, 'reason': reason});

  Future<Engagement> engagement(List<String> ids) async {
    final d = await _api.post('$_base/engagement-report', body: {'broadcastIds': ids});
    return Engagement.fromJson((d as Map).cast<String, dynamic>());
  }
}

final broadcastsApiProvider = Provider((ref) => BroadcastsApi(ref.watch(apiClientProvider)));

final broadcastsProvider = FutureProvider.autoDispose((ref) => ref.watch(broadcastsApiProvider).list());

/// Lazily fetched only when a card's Details is expanded (Firestore quota).
final broadcastContactsProvider = FutureProvider.autoDispose.family<List<BroadcastContact>, String>(
  (ref, id) => ref.watch(broadcastsApiProvider).contacts(id),
);
