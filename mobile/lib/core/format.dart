import 'package:intl/intl.dart';

/// ₹ in Indian grouping: 124580 → ₹1,24,580.
String rupees(num? v, {int decimals = 0}) =>
    v == null ? '—' : NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: decimals).format(v);

/// 1234567 → 12,34,567.
String number(num? v) => v == null ? '—' : NumberFormat.decimalPattern('en_IN').format(v);

String percent(num? v, {int decimals = 1}) => v == null ? '—' : '${v.toStringAsFixed(decimals)}%';

/// Digits only, with a 91 country code added to bare 10-digit Indian numbers
/// (matches how the backend stores phones in Firestore).
String normalizePhone(String raw) {
  final d = raw.replaceAll(RegExp(r'\D'), '');
  return d.length == 10 ? '91$d' : d;
}

/// 919876543210 → +91 98765 43210 (falls back to +digits).
String displayPhone(String raw) {
  final d = normalizePhone(raw);
  if (d.length == 12 && d.startsWith('91')) return '+91 ${d.substring(2, 7)} ${d.substring(7)}';
  return d.isEmpty ? raw : '+$d';
}

/// Chat-list style time: 14:05 today, "Yesterday", or "12 Oct".
String chatTime(DateTime? t, {DateTime? now}) {
  if (t == null) return '';
  final n = now ?? DateTime.now();
  final local = t.toLocal();
  final days = DateTime(n.year, n.month, n.day).difference(DateTime(local.year, local.month, local.day)).inDays;
  if (days == 0) return DateFormat.Hm().format(local);
  if (days == 1) return 'Yesterday';
  return DateFormat('d MMM').format(local);
}

/// "5m ago", "3h ago", "2d ago".
String timeAgo(DateTime? t, {DateTime? now}) {
  if (t == null) return '';
  final d = (now ?? DateTime.now()).difference(t);
  if (d.inMinutes < 1) return 'just now';
  if (d.inHours < 1) return '${d.inMinutes}m ago';
  if (d.inDays < 1) return '${d.inHours}h ago';
  return '${d.inDays}d ago';
}

String dateTime(DateTime? t) => t == null ? '' : DateFormat('d MMM yyyy, HH:mm').format(t.toLocal());

/// Parses the date shapes the backend returns: ISO string, epoch ms, or a
/// serialized Firestore Timestamp ({_seconds} / {seconds}).
DateTime? parseDate(Object? v) {
  if (v == null) return null;
  if (v is String) return DateTime.tryParse(v);
  if (v is num) return DateTime.fromMillisecondsSinceEpoch(v.toInt());
  if (v is Map) {
    final s = v['_seconds'] ?? v['seconds'];
    if (s is num) return DateTime.fromMillisecondsSinceEpoch((s * 1000).toInt());
  }
  return null;
}

/// Initials for avatars: "Rahul Sharma" → "RS"; phone → last 2 digits.
String initials(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (RegExp(r'^\+?\d').hasMatch(parts.first)) {
    final d = parts.join().replaceAll(RegExp(r'\D'), '');
    return d.length >= 2 ? d.substring(d.length - 2) : d;
  }
  return (parts.first[0] + (parts.length > 1 ? parts.last[0] : '')).toUpperCase();
}
