import 'package:dio/dio.dart' show FormData, MultipartFile;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import 'contacts_models.dart';

/// /api/contacts — Google Sheets backed, slow (up to 60 s) and currently
/// failing with 502, so no automatic retries: the user retries from the UI.
List<Contact> _list(dynamic d) => [
  for (final c in (d is Map ? d['contacts'] : null) as List? ?? const [])
    if (c is Map) Contact.fromJson(c.cast<String, dynamic>()),
];

final contactsProvider = FutureProvider<List<Contact>>(
  (ref) async => _list(await ref.read(apiClientProvider).get('/api/contacts')),
  retry: (_, _) => null,
);

final failedContactsProvider = FutureProvider<List<Contact>>(
  (ref) async => _list(await ref.read(apiClientProvider).get('/api/contacts', query: {'failed': 'true'})),
  retry: (_, _) => null,
);

class ContactsApi {
  ContactsApi(this._api);
  final ApiClient _api;

  /// One addBatch call → (saved, already in the sheet).
  Future<(int, int)> addBatch(List<Contact> batch) async {
    final d = await _api.post(
      '/api/contacts',
      body: {
        'contacts': [for (final c in batch) c.toUpload()],
      },
    );
    return (((d as Map)['saved'] as num?)?.toInt() ?? 0, (d['dbDuplicates'] as num?)?.toInt() ?? 0);
  }

  Future<void> delete(List<String> ids) => _api.delete('/api/contacts', body: {'ids': ids});

  /// Returns (removed, remaining).
  Future<(int, int)> dedupe(String batch) async {
    final d = await _api.post('/api/contacts', body: {'action': 'dedupe', 'dataName': batch}) as Map;
    return ((d['duplicatesRemoved'] as num?)?.toInt() ?? 0, (d['remaining'] as num?)?.toInt() ?? 0);
  }

  /// Excel files are parsed by the server's preview endpoint (no xlsx
  /// package in the app); CSV is parsed on-device.
  Future<ImportParse> previewExcel(List<int> bytes, String fileName, String dataName) async {
    final d = await _api.post(
      '/api/contacts',
      query: {'preview': 'true'},
      body: FormData.fromMap({'file': MultipartFile.fromBytes(bytes, filename: fileName), 'dataName': dataName}),
    ) as Map;
    return ImportParse(
      valid: [
        for (final c in d['valid'] as List? ?? const [])
          if (c is Map) Contact.fromJson(c.cast<String, dynamic>()),
      ],
      invalid: [
        for (final r in d['corrupted'] as List? ?? const [])
          if (r is Map) InvalidRow.fromJson(r.cast<String, dynamic>()),
      ],
      fileDuplicates: (d['intraFileDuplicates'] as num?)?.toInt() ?? 0,
    );
  }
}

final contactsApiProvider = Provider((ref) => ContactsApi(ref.read(apiClientProvider)));
