import 'package:broadzen/core/format.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('rupees uses Indian grouping', () {
    expect(rupees(124580), '₹1,24,580');
    expect(rupees(299.5, decimals: 2), '₹299.50');
    expect(rupees(null), '—');
  });

  test('normalizePhone matches backend storage', () {
    expect(normalizePhone('98765 43210'), '919876543210');
    expect(normalizePhone('+91-98765-43210'), '919876543210');
    expect(normalizePhone('14155552671'), '14155552671');
    expect(displayPhone('919876543210'), '+91 98765 43210');
  });

  test('chatTime buckets today / yesterday / date', () {
    final now = DateTime(2026, 10, 17, 18);
    expect(chatTime(DateTime(2026, 10, 17, 9, 5), now: now), '09:05');
    expect(chatTime(DateTime(2026, 10, 16, 23), now: now), 'Yesterday');
    expect(chatTime(DateTime(2026, 10, 2), now: now), '2 Oct');
  });

  test('parseDate handles ISO, epoch and Firestore timestamps', () {
    expect(parseDate('2026-10-17T10:00:00Z')!.toUtc().hour, 10);
    expect(parseDate(0), DateTime.fromMillisecondsSinceEpoch(0));
    expect(parseDate({'_seconds': 1}), DateTime.fromMillisecondsSinceEpoch(1000));
    expect(parseDate(null), isNull);
  });

  test('initials', () {
    expect(initials('Rahul Sharma'), 'RS');
    expect(initials('919876543210'), '10');
    expect(initials(''), '?');
  });
}
