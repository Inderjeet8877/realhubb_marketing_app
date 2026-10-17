import 'package:csv/csv.dart';

import '../../core/format.dart';

/// Pure contacts logic (no Flutter) — parsing, validation, filters.
/// Mirrors src/app/api/contacts/route.ts and src/lib/whatsapp-send.ts so a
/// number accepted here is one the backend will accept and send to.

class Contact {
  const Contact({
    required this.id,
    required this.name,
    required this.phone,
    this.email = '',
    this.tags = const [],
    this.dataName = '',
    this.addedAt,
    this.failReason,
  });

  final String id, name, phone, email, dataName;
  final List<String> tags;
  final DateTime? addedAt;
  final String? failReason;

  String get batch => dataName.isEmpty ? uncategorized : dataName;

  factory Contact.fromJson(Map<String, dynamic> j) {
    final t = j['tags'];
    return Contact(
      id: '${j['id'] ?? ''}',
      name: '${j['name'] ?? 'Unknown'}',
      phone: '${j['phone'] ?? ''}',
      email: '${j['email'] ?? ''}',
      tags: t is List
          ? [for (final x in t) '$x'].where((s) => s.trim().isNotEmpty).toList()
          : t is String
          ? t.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList()
          : const [],
      dataName: '${j['dataName'] ?? ''}'.trim(),
      addedAt: parseDate(j['addedAt']),
      failReason: j['failReason'] == null ? null : '${j['failReason']}',
    );
  }

  /// Shape the backend's addBatch expects.
  Map<String, dynamic> toUpload() => {'name': name, 'phone': phone, 'email': email, 'tags': tags, 'dataName': dataName};
}

const uncategorized = 'Uncategorized';

// ── Phone validation (port of whatsapp-send.ts) ────────────────────────────

String _digits(String raw) {
  final d = raw.replaceAll(RegExp(r'\D'), '');
  return d.length > 10 && d.startsWith('00') ? d.substring(2) : d;
}

/// Backend normalisation: 10 digits / 0-prefixed 11 digits → 91…; else digits.
String normalizeContactPhone(String raw) {
  final d = _digits(raw);
  if (d.length == 10) return '91$d';
  if (d.length == 11 && d.startsWith('0')) return '91${d.substring(1)}';
  return d;
}

/// Indian-shaped numbers must be real mobiles (6-9 first digit); anything
/// else (NRI contacts) just needs a plausible E.164 length.
bool isValidContactPhone(String raw) {
  final d = _digits(raw);
  if (d.isEmpty) return false;
  final indian = (d.length == 12 && d.startsWith('91')) || d.length == 10 || (d.length == 11 && d.startsWith('0'));
  if (indian) return RegExp(r'^91[6-9]\d{9}$').hasMatch(normalizeContactPhone(raw));
  return d.length >= 8 && d.length <= 15;
}

/// '+919876543210', or '' when invalid.
String cleanContactPhone(String raw) => isValidContactPhone(raw) ? '+${normalizeContactPhone(raw)}' : '';

// ── Import parsing (port of parseDataRows, CSV via the csv package) ────────

class InvalidRow {
  const InvalidRow({required this.row, required this.rawName, required this.rawPhone, required this.reason});
  final int row;
  final String rawName, rawPhone, reason;

  factory InvalidRow.fromJson(Map<String, dynamic> j) => InvalidRow(
    row: (j['row'] as num?)?.toInt() ?? 0,
    rawName: '${j['rawName'] ?? ''}',
    rawPhone: '${j['rawPhone'] ?? ''}',
    reason: '${j['reason'] ?? 'Invalid row'}',
  );
}

class ImportParse {
  const ImportParse({
    required this.valid,
    required this.invalid,
    required this.fileDuplicates,
    this.existingDuplicates = 0,
  });
  final List<Contact> valid;
  final List<InvalidRow> invalid;
  final int fileDuplicates, existingDuplicates;

  bool get isEmpty => valid.isEmpty && invalid.isEmpty;

  /// Drops contacts whose phone is already in [phones] (normalised '+91…').
  ImportParse excluding(Set<String> phones) {
    final keep = valid.where((c) => !phones.contains(cleanContactPhone(c.phone))).toList();
    return ImportParse(
      valid: keep,
      invalid: invalid,
      fileDuplicates: fileDuplicates,
      existingDuplicates: existingDuplicates + valid.length - keep.length,
    );
  }
}

/// Column indexes found in the header; -1 when absent.
typedef Columns = ({int name, int phone, int email, int tags, int headerRow});

String _norm(String h) => h.toLowerCase().trim().replaceAll(RegExp('["\']'), '');
bool _isName(String h) =>
    RegExp(r'^(name|names|full.?name|first.?name|contact.?name|customer.?name|client.?name)').hasMatch(_norm(h));
bool _isPhone(String h) =>
    RegExp(r'^(phone|mobile|number|contact|whatsapp)').hasMatch(_norm(h)) || _norm(h).contains('number');
bool _isEmail(String h) => RegExp(r'^(email|e-?mail|mail)').hasMatch(_norm(h));
bool _isTag(String h) => RegExp(r'^(tags?|labels?)').hasMatch(_norm(h));

/// Scans the first 5 rows for headers. Falls back to name=col 0, phone=col 1.
/// Unlike the web, a "Contact Name" column is never also taken as the phone.
Columns detectColumns(List<List<String>> rows) {
  var n = -1, p = -1, e = -1, t = -1, header = 0;
  for (var i = 0; i < rows.length && i < 5; i++) {
    for (var j = 0; j < rows[i].length; j++) {
      final h = rows[i][j].trim();
      if (h.isEmpty) continue;
      if (n == -1 && _isName(h)) {
        n = j;
        header = i;
      } else if (e == -1 && _isEmail(h)) {
        e = j;
      } else if (t == -1 && _isTag(h)) {
        t = j;
      } else if (p == -1 && j != n && _isPhone(h)) {
        p = j;
        header = i;
      }
    }
    if (n != -1 && p != -1) break;
  }
  return (name: n == -1 ? 0 : n, phone: p == -1 ? 1 : p, email: e, tags: t, headerRow: header);
}

/// Validates rows after the header: missing name / invalid phone → invalid;
/// repeats within the file are counted and skipped.
ImportParse parseContactRows(List<List<String>> rows, String dataName) {
  final c = detectColumns(rows);
  String cell(List<String> r, int i) => i >= 0 && i < r.length ? r[i].trim() : '';
  final seen = <String>{};
  final valid = <Contact>[];
  final invalid = <InvalidRow>[];
  var fileDup = 0;

  for (var i = c.headerRow + 1; i < rows.length; i++) {
    final r = rows[i];
    final rawName = cell(r, c.name), rawPhone = cell(r, c.phone);
    if (rawName.isEmpty && rawPhone.isEmpty) continue;
    if (rawName.isEmpty) {
      invalid.add(InvalidRow(row: i + 1, rawName: rawName, rawPhone: rawPhone, reason: 'Missing name'));
      continue;
    }
    final phone = cleanContactPhone(rawPhone);
    if (phone.isEmpty) {
      invalid.add(
        InvalidRow(row: i + 1, rawName: rawName, rawPhone: rawPhone, reason: 'Invalid or missing phone number'),
      );
      continue;
    }
    if (!seen.add(phone)) {
      fileDup++;
      continue;
    }
    valid.add(
      Contact(
        id: '',
        name: rawName,
        phone: phone,
        email: cell(r, c.email),
        tags: cell(r, c.tags).split(RegExp('[;,|]')).map((s) => s.trim()).where((s) => s.isNotEmpty).toList(),
        dataName: dataName,
      ),
    );
  }
  return ImportParse(valid: valid, invalid: invalid, fileDuplicates: fileDup);
}

/// CSV text → string rows (delimiter auto-detected, BOM stripped).
List<List<String>> parseCsvRows(String text) {
  final clean = text.startsWith('﻿') ? text.substring(1) : text;
  if (clean.trim().isEmpty) return const [];
  return [
    for (final r in csv.decode(clean)) [for (final v in r) '${v ?? ''}'],
  ];
}

/// Normalised phones of existing contacts, for "already in your contacts".
Set<String> existingPhoneSet(Iterable<Contact> contacts) => {
  for (final c in contacts)
    if (cleanContactPhone(c.phone).isNotEmpty) cleanContactPhone(c.phone),
};

List<List<T>> chunk<T>(List<T> list, int size) => [
  for (var i = 0; i < list.length; i += size) list.sublist(i, i + size > list.length ? list.length : i + size),
];

// ── List filters ───────────────────────────────────────────────────────────

enum ContactView { all, tagged, recent, failed }

bool isRecentContact(Contact c, DateTime now) =>
    c.addedAt != null && !c.addedAt!.isBefore(now.subtract(const Duration(days: 30)));

/// [list] is the active list (failed list when view == failed).
List<Contact> filterContacts(
  List<Contact> list, {
  ContactView view = ContactView.all,
  String search = '',
  String? batch,
  DateTime? now,
}) {
  final q = search.trim().toLowerCase();
  final qDigits = q.replaceAll(RegExp(r'\D'), '');
  final t = now ?? DateTime.now();
  return list.where((c) {
    if (q.isNotEmpty &&
        !c.name.toLowerCase().contains(q) &&
        !c.phone.contains(q) &&
        !(qDigits.isNotEmpty && c.phone.replaceAll(RegExp(r'\D'), '').contains(qDigits))) {
      return false;
    }
    if (batch != null && c.batch != batch) return false;
    return switch (view) {
      ContactView.tagged => c.tags.isNotEmpty,
      ContactView.recent => isRecentContact(c, t),
      _ => true,
    };
  }).toList();
}

/// Sorted batch names across both lists.
List<String> batchNames(Iterable<Contact> contacts) => {for (final c in contacts) c.batch}.toList()..sort();
