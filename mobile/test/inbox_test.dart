import 'package:broadzen/features/inbox/data.dart';
import 'package:broadzen/features/send/data.dart';
import 'package:broadzen/features/send/send_screen.dart' show validatePhone;
import 'package:flutter_test/flutter_test.dart';

void main() {
  final now = DateTime(2026, 10, 17, 15);

  test('conversation fromJson is tolerant and hides name == phone', () {
    final c = Conversation.fromJson({
      'phone': '919876543210',
      'name': '919876543210',
      'lastMessageAt': '2026-10-17T10:00:00Z',
      'lastMessageDirection': 'outbound',
      'unreadCount': 2,
    });
    expect(c.name, '');
    expect(c.title, '+91 98765 43210');
    expect(c.outbound, isTrue);
    expect(Conversation.fromJson({}).unreadCount, 0);
  });

  test('unread first, then newest', () {
    Conversation c(String p, int h, [int unread = 0]) =>
        Conversation(phone: p, lastMessageAt: DateTime(2026, 10, 17, h), unreadCount: unread);
    final sorted = sortConversations([c('a', 9), c('b', 12), c('c', 8, 1), c('d', 11, 3)]);
    expect(sorted.map((e) => e.phone), ['d', 'c', 'b', 'a']);
  });

  test('filters and search', () {
    final list = [
      Conversation(phone: '919876543210', name: 'Rahul Sharma', unreadCount: 1),
      Conversation(phone: '919000000001', hasInbound: true),
      Conversation(phone: '919000000002'),
    ];
    expect(filterConversations(list, InboxFilter.unread, '').length, 1);
    expect(filterConversations(list, InboxFilter.replies, '').single.phone, '919000000001');
    expect(filterConversations(list, InboxFilter.all, 'rahul').single.name, 'Rahul Sharma');
    expect(filterConversations(list, InboxFilter.all, '+91 90000 00002').single.phone, '919000000002');
    expect(filterConversations(list, InboxFilter.all, 'zzz'), isEmpty);
  });

  test('unread badge caps at 9+', () {
    expect(unreadBadge(3), '3');
    expect(unreadBadge(9), '9');
    expect(unreadBadge(10), '9+');
  });

  test('tick mapping', () {
    expect(tickFor('read'), Tick.read);
    expect(tickFor('delivered'), Tick.delivered);
    expect(tickFor('sent'), Tick.sent);
    expect(tickFor('failed'), Tick.failed);
    expect(tickFor(null), Tick.pending);
    expect(ChatMessage.fromJson({'direction': 'outbound'}).tick, Tick.sent);
  });

  test('date separators bucket by day', () {
    ChatMessage m(DateTime t) => ChatMessage(id: '$t', text: '', outbound: false, at: t);
    final items = withDateSeparators([
      m(DateTime(2026, 10, 1, 9)),
      m(DateTime(2026, 10, 16, 9)),
      m(DateTime(2026, 10, 16, 23)),
      m(DateTime(2026, 10, 17, 8)),
    ], now: now);
    expect(items.whereType<String>(), ['1 October 2026', 'Yesterday', 'Today']);
    expect(items.length, 7);
  });

  test('phone validation and send body', () {
    expect(validatePhone('98765 43210'), isNull);
    expect(validatePhone('12345'), isNotNull);
    expect(validatePhone(''), isNotNull);
    final tpl = WaTemplate(name: 'promo', headerType: 'image', content: 'Hi');
    expect(tpl.needsMedia, isTrue);
    final b = sendBody(phone: '919876543210', template: tpl, mediaUrl: ' https://x.io/a.jpg ');
    expect(b['isTemplate'], true);
    expect(b['templateHeaderContent'], 'https://x.io/a.jpg');
    expect(sendBody(phone: '1', text: 'hello')['message'], 'hello');
    expect(sendBody(phone: '1', text: 'hello').containsKey('templateName'), isFalse);
  });
}
