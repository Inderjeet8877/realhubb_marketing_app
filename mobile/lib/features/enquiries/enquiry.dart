import '../../core/format.dart';
import '../../widgets/ui.dart';

/// One row from GET /api/enquiries.
class Enquiry {
  const Enquiry({
    required this.id,
    required this.name,
    required this.email,
    required this.phone,
    required this.company,
    required this.message,
    required this.status,
    this.createdAt,
  });

  factory Enquiry.fromJson(Map<String, dynamic> j) => Enquiry(
    id: '${j['id'] ?? ''}',
    name: '${j['name'] ?? ''}',
    email: '${j['email'] ?? ''}',
    phone: '${j['phone'] ?? ''}',
    company: '${j['company'] ?? ''}',
    message: '${j['message'] ?? ''}',
    status: '${j['status'] ?? 'new'}',
    createdAt: parseDate(j['createdAt']),
  );

  final String id, name, email, phone, company, message, status;
  final DateTime? createdAt;

  bool matches(String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return true;
    return [name, email, phone, company, message].any((f) => f.toLowerCase().contains(q));
  }
}

/// Status pill (DESIGN_PLAN §6 row 15). The backend only writes 'new' today.
(String, Tone) enquiryStatus(String status) => switch (status.toLowerCase()) {
  'new' || '' => ('New', Tone.info),
  'contacted' => ('Contacted', Tone.warning),
  'closed' => ('Closed', Tone.success),
  _ => (status[0].toUpperCase() + status.substring(1), Tone.neutral),
};
