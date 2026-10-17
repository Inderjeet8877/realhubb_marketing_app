import '../../core/format.dart';

typedef Recipient = ({String name, String phone});

/// Selected contacts plus the optional one-off number, deduped by normalized
/// phone (the one-off loses to an existing contact so its name is kept).
List<Recipient> buildRecipients({
  required List<Recipient> contacts,
  required Set<String> selectedPhones,
  String quickName = '',
  String quickPhone = '',
}) {
  final seen = <String>{};
  final out = <Recipient>[];
  void add(Recipient r) {
    final key = normalizePhone(r.phone);
    if (key.isNotEmpty && seen.add(key)) out.add(r);
  }

  for (final c in contacts) {
    if (selectedPhones.contains(c.phone)) add(c);
  }
  final p = quickPhone.trim();
  if (p.isNotEmpty) add((name: quickName.trim().isEmpty ? p : quickName.trim(), phone: p));
  return out;
}

/// Contact picker filter: first 200 matches, like the web.
List<Recipient> filterContacts(List<Recipient> contacts, String query, {int limit = 200}) {
  final q = query.trim().toLowerCase();
  final hits = q.isEmpty ? contacts : contacts.where((c) => c.name.toLowerCase().contains(q) || c.phone.contains(q));
  return hits.take(limit).toList();
}
