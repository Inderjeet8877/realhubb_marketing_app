import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';

/// WhatsApp number slot used by the inbox and single send. The web page is
/// locked to account 1 too (whatsapp/page.tsx `waAccountId`).
const waAccountId = '1';

/// How often the inbox / open chat re-fetch while visible.
// ponytail: polling. The list endpoint reads ~2000+ Firestore docs per call;
// replace with a push channel (FCM data message) or a cursor endpoint.
const pollEvery = Duration(seconds: 5);

String _s(Object? v) => v == null ? '' : '$v';

class Conversation {
  Conversation({
    required this.phone,
    this.name = '',
    this.lastMessage = '',
    this.lastMessageAt,
    this.outbound = false,
    this.unreadCount = 0,
    this.hasInbound = false,
  });

  factory Conversation.fromJson(Map j) {
    final phone = _s(j['phone']);
    final name = _s(j['name']);
    return Conversation(
      phone: phone,
      name: name == phone ? '' : name,
      lastMessage: _s(j['lastMessage']),
      lastMessageAt: parseDate(j['lastMessageAt']),
      outbound: j['lastMessageDirection'] == 'outbound',
      unreadCount: (j['unreadCount'] as num?)?.toInt() ?? 0,
      hasInbound: j['hasInbound'] == true,
    );
  }

  final String phone, name, lastMessage;
  final DateTime? lastMessageAt;
  final bool outbound, hasInbound;
  final int unreadCount;

  String get title => name.isNotEmpty ? name : displayPhone(phone);
}

enum Tick { pending, sent, delivered, read, failed }

Tick tickFor(String? status) => switch (status) {
  'sent' => Tick.sent,
  'delivered' => Tick.delivered,
  'read' => Tick.read,
  'failed' => Tick.failed,
  _ => Tick.pending,
};

class ChatMessage {
  ChatMessage({
    required this.id,
    required this.text,
    required this.outbound,
    required this.at,
    this.tick = Tick.pending,
    this.wamid,
    this.templateName,
  });

  factory ChatMessage.fromJson(Map j) {
    final out = j['direction'] == 'outbound';
    return ChatMessage(
      id: _s(j['id']),
      text: _s(j['message']),
      outbound: out,
      at: parseDate(j['createdAt']) ?? DateTime.now(),
      tick: tickFor(j['status'] as String? ?? (out ? 'sent' : null)),
      wamid: j['wamid'] as String?,
      templateName: j['templateName'] as String?,
    );
  }

  final String id, text;
  final bool outbound;
  final DateTime at;
  final Tick tick;
  final String? wamid, templateName;
}

enum InboxFilter { all, unread, replies }

/// WhatsApp-style order: anything unread first, then most recent activity.
List<Conversation> sortConversations(Iterable<Conversation> list) {
  final out = list.toList();
  int t(Conversation c) => c.lastMessageAt?.millisecondsSinceEpoch ?? 0;
  out.sort((a, b) {
    final au = a.unreadCount > 0, bu = b.unreadCount > 0;
    if (au != bu) return au ? -1 : 1;
    return t(b).compareTo(t(a));
  });
  return out;
}

List<Conversation> filterConversations(List<Conversation> list, InboxFilter filter, String query) {
  final q = query.trim().toLowerCase();
  final qDigits = q.replaceAll(RegExp(r'\D'), '');
  return [
    for (final c in list)
      if ((filter != InboxFilter.unread || c.unreadCount > 0) &&
          (filter != InboxFilter.replies || c.hasInbound) &&
          (q.isEmpty || c.name.toLowerCase().contains(q) || (qDigits.isNotEmpty && c.phone.contains(qDigits))))
        c,
  ];
}

String unreadBadge(int n) => n > 9 ? '9+' : '$n';

/// Date separator label: Today / Yesterday / 12 October 2026.
String dayLabel(DateTime t, {DateTime? now}) {
  final n = now ?? DateTime.now();
  final l = t.toLocal();
  final days = DateTime(n.year, n.month, n.day).difference(DateTime(l.year, l.month, l.day)).inDays;
  if (days == 0) return 'Today';
  if (days == 1) return 'Yesterday';
  return DateFormat('d MMMM yyyy').format(l);
}

/// Chronological messages with a day label (String) before each new day.
List<Object> withDateSeparators(List<ChatMessage> msgs, {DateTime? now}) {
  final out = <Object>[];
  String? last;
  for (final m in msgs) {
    final label = dayLabel(m.at, now: now);
    if (label != last) out.add(label);
    last = label;
    out.add(m);
  }
  return out;
}

final conversationsProvider = FutureProvider.autoDispose<List<Conversation>>((ref) async {
  final d = await ref.read(apiClientProvider).get('/api/whatsapp/messages', query: {'account_id': waAccountId});
  final list = (d is Map ? d['conversations'] as List? : null) ?? const [];
  return sortConversations(list.whereType<Map>().map(Conversation.fromJson).where((c) => c.phone.isNotEmpty));
});

final messagesProvider = FutureProvider.autoDispose.family<List<ChatMessage>, String>((ref, phone) async {
  final d = await ref
      .read(apiClientProvider)
      .get('/api/whatsapp/messages', query: {'phone': phone, 'account_id': waAccountId});
  final list = (d is Map ? d['messages'] as List? : null) ?? const [];
  return list.whereType<Map>().map(ChatMessage.fromJson).toList()..sort((a, b) => a.at.compareTo(b.at));
});

class WebhookLog {
  WebhookLog(this.at, this.kind);
  final DateTime? at;
  final String kind;
}

Future<List<WebhookLog>> fetchWebhookLogs(ApiClient api) async {
  final d = await api.get('/api/whatsapp/simulate-inbound');
  final list = (d is Map ? d['logs'] as List? : null) ?? const [];
  return [
    for (final l in list.whereType<Map>())
      WebhookLog(
        parseDate(l['receivedAt']),
        l['hasMessages'] == true
            ? 'Inbound message'
            : l['hasStatuses'] == true
            ? 'Status update'
            : 'Webhook call',
      ),
  ];
}

/// Calls [onPoll] every [pollEvery] while this widget is on screen (its
/// TickerMode is enabled — false when another route covers it or its shell
/// tab is hidden) and the app is in the foreground. Polls once on return.
mixin Polling<T extends StatefulWidget> on State<T> {
  Timer? _timer;
  bool _visible = false;
  AppLifecycleListener? _life;

  void onPoll();

  @override
  void initState() {
    super.initState();
    _life = AppLifecycleListener(onStateChange: (_) => _sync());
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _visible = TickerMode.valuesOf(context).enabled;
    _sync();
  }

  void _sync() {
    final s = WidgetsBinding.instance.lifecycleState;
    final on = _visible && (s == null || s == AppLifecycleState.resumed || s == AppLifecycleState.inactive);
    if (on && _timer == null) {
      final first = !_started;
      _started = true;
      _timer = Timer.periodic(pollEvery, (_) => onPoll());
      if (!first) onPoll();
    } else if (!on) {
      _timer?.cancel();
      _timer = null;
    }
  }

  bool _started = false;

  @override
  void dispose() {
    _timer?.cancel();
    _life?.dispose();
    super.dispose();
  }
}
