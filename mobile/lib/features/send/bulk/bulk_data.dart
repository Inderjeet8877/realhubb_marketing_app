import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';

String _s(Object? v) => v == null ? '' : '$v';

/// Approved template from GET /api/whatsapp/templates.
class WaTemplate {
  WaTemplate({
    required this.name,
    this.language = 'en',
    this.content = '',
    this.headerType = 'none',
    this.headerContent = '',
    this.footerContent = '',
    this.buttons = const [],
    this.approvalStatus = '',
  });

  factory WaTemplate.fromJson(Map<String, dynamic> j) => WaTemplate(
    name: _s(j['name']),
    language: _s(j['language']).isEmpty ? 'en' : _s(j['language']),
    content: _s(j['content']),
    headerType: _s(j['headerType']).isEmpty ? 'none' : _s(j['headerType']).toLowerCase(),
    headerContent: _s(j['headerContent']),
    footerContent: _s(j['footerContent']),
    buttons: [
      for (final b in (j['buttons'] as List? ?? const []))
        if (b is Map && _s(b['text']).isNotEmpty) _s(b['text']),
    ],
    approvalStatus: _s(j['approvalStatus']),
  );

  final String name, language, content, headerType, headerContent, footerContent, approvalStatus;
  final List<String> buttons;

  bool get needsMedia => const {'image', 'video', 'document'}.contains(headerType);
}

class ContactBatch {
  ContactBatch(this.name, this.count);
  final String name;
  final int count;
}

class BulkContact {
  BulkContact(this.name, this.phone, this.dataName);
  final String name, phone, dataName;
}

// ── Pure logic (unit-tested) ────────────────────────────────────────────────

/// 1-based inclusive chunks: 250 → (1,100) (101,200) (201,250).
List<(int, int)> rangeChunks(int total, {int size = 100}) => [
  for (var s = 1; s <= total; s += size) (s, math.min(s + size - 1, total)),
];

/// Clamped 1-based inclusive range, like the web's Apply button.
/// Missing/invalid bounds default to the full list.
(int, int) clampRange(int length, int? from, int? to) {
  final f = math.max(1, from ?? 1);
  final t = math.min(length, to ?? length);
  return (f, t);
}

List<T> sliceRange<T>(List<T> items, int from, int to) =>
    from > to || from > items.length ? <T>[] : items.sublist(from - 1, math.min(to, items.length));

/// Null when OK; otherwise why the template can't be sent (mirrors the
/// server's validateTemplateHeaderMedia so the button explains itself).
String? mediaProblem(WaTemplate? t, String url) {
  if (t == null || !t.needsMedia) return null;
  final u = url.trim();
  if (u.isEmpty) return 'This template has a ${t.headerType} header — add its media URL first.';
  final uri = Uri.tryParse(u);
  if (uri == null || !uri.hasScheme || uri.host.isEmpty) return 'The ${t.headerType} URL is not a valid link.';
  return null;
}

// ── Data access ─────────────────────────────────────────────────────────────

final bulkTemplatesProvider = FutureProvider.autoDispose<List<WaTemplate>>((ref) async {
  final d = await ref.watch(apiClientProvider).get('/api/whatsapp/templates');
  return [
    for (final t in (d is Map ? d['templates'] as List? : null) ?? const [])
      if (t is Map && t['approvalStatus'] == 'approved') WaTemplate.fromJson(t.cast<String, dynamic>()),
  ];
});

final bulkBatchesProvider = FutureProvider.autoDispose<List<ContactBatch>>((ref) async {
  final d = await ref.watch(apiClientProvider).get('/api/contacts', query: {'listCategories': 'true'});
  if (d is Map && d['success'] == false) throw ApiException('${d['error'] ?? 'Failed to load batches'}');
  return [
    for (final b in (d is Map ? d['categories'] as List? : null) ?? const [])
      if (b is Map)
        ContactBatch(_s(b['name'] ?? b['dataName']), b['count'] is num ? (b['count'] as num).toInt() : 0)
      else if (b is String)
        ContactBatch(b, 0),
  ];
});

/// Contacts of one batch (or every contact when [dataName] is null). The
/// route returns 502 when the Google Sheet backend fails — surfaced as an error.
Future<List<BulkContact>> fetchBulkContacts(ApiClient api, String? dataName) async {
  final d = await api.get('/api/contacts', query: {'dataName': ?dataName});
  if (d is Map && d['success'] == false) throw ApiException('${d['error'] ?? 'Failed to load contacts'}');
  return [
    for (final c in (d is Map ? d['contacts'] as List? : null) ?? const [])
      if (c is Map && _s(c['phone']).isNotEmpty)
        BulkContact(_s(c['name']).isEmpty ? _s(c['phone']) : _s(c['name']), _s(c['phone']), _s(c['dataName'])),
  ];
}

class StartResult {
  StartResult(this.broadcastId, this.total, this.optedOut);
  final String broadcastId;
  final int total, optedOut;
}

/// POST /api/whatsapp/broadcasts/start — the server then runs the job itself
/// (process/ self-triggers with an internal secret; the client never drives it).
Future<StartResult> startBroadcast(
  ApiClient api, {
  required List<BulkContact> contacts,
  required String batchName,
  WaTemplate? template,
  String message = '',
  String mediaUrl = '',
}) async {
  final d = await api.post(
    '/api/whatsapp/broadcasts/start',
    body: {
      'contacts': [for (final c in contacts) c.phone],
      'contactNames': {for (final c in contacts) c.phone: c.name},
      'batchName': batchName,
      'message': message,
      'accountId': '1', // the web's fixed WhatsApp account slot
      if (template != null) ...{
        'templateName': template.name,
        'templateContent': template.content,
        'languageCode': template.language,
        'templateHeaderType': template.headerType,
        'templateHeaderContent': template.needsMedia ? mediaUrl.trim() : template.headerContent,
      },
      'isTemplate': template != null,
    },
  );
  if (d is! Map || d['broadcastId'] == null) {
    throw ApiException('${(d is Map ? d['error'] : null) ?? 'Failed to start broadcast'}');
  }
  return StartResult(
    '${d['broadcastId']}',
    d['total'] is num ? (d['total'] as num).toInt() : contacts.length,
    d['optedOutCount'] is num ? (d['optedOutCount'] as num).toInt() : 0,
  );
}
