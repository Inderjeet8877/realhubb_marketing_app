import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import '../send/send_screen.dart';
import 'chat_screen.dart';
import 'data.dart';

/// Inbox tab: conversation list; on ≥600dp a list + chat two-pane layout.
class InboxScreen extends ConsumerStatefulWidget {
  const InboxScreen({super.key});

  @override
  ConsumerState<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends ConsumerState<InboxScreen> with Polling {
  final _search = TextEditingController();
  InboxFilter _filter = InboxFilter.all;
  String? _selected; // phone, wide layout only

  @override
  void onPoll() => ref.invalidate(conversationsProvider);

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _open(Conversation conv, bool wide) {
    if (wide) {
      setState(() => _selected = conv.phone);
    } else {
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatScreen(conversation: conv)));
    }
  }

  void _clearFilters() => setState(() {
    _filter = InboxFilter.all;
    _search.clear();
  });

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(conversationsProvider);
    return LayoutBuilder(
      builder: (context, box) {
        final wide = box.maxWidth >= 600;
        final all = async.value;
        Conversation? selected;
        if (wide && all != null) {
          for (final c in all) {
            if (c.phone == _selected) selected = c;
          }
        }
        final list = Scaffold(
          appBar: AppBar(
            title: const Text('Inbox'),
            actions: [
              PopupMenuButton<String>(
                tooltip: 'More options',
                icon: const Icon(LucideIcons.ellipsisVertical),
                onSelected: (v) => v == 'send'
                    ? Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SendScreen()))
                    : _showWebhookDiagnostics(context, ref.read(apiClientProvider)),
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'send', child: Text('New message')),
                  PopupMenuItem(value: 'webhook', child: Text('Webhook diagnostics')),
                ],
              ),
            ],
            bottom: PreferredSize(preferredSize: const Size.fromHeight(116), child: _filters()),
          ),
          body: _body(async, wide),
        );
        if (!wide) return list;
        return Row(
          children: [
            SizedBox(width: box.maxWidth >= 1024 ? 400 : 340, child: list),
            const VerticalDivider(width: 1),
            Expanded(
              child: selected == null
                  ? Scaffold(
                      body: EmptyState(
                        icon: LucideIcons.messageSquare,
                        title: 'Select a conversation',
                        message: 'Pick a chat on the left to read and reply.',
                      ),
                    )
                  : ChatScreen(key: ValueKey(selected.phone), conversation: selected, embedded: true),
            ),
          ],
        );
      },
    );
  }

  Widget _filters() {
    final c = context.colors;
    ChoiceChip chip(InboxFilter f, String label) =>
        ChoiceChip(label: Text(label), selected: _filter == f, onSelected: (_) => setState(() => _filter = f));
    return Padding(
      padding: const EdgeInsets.fromLTRB(Space.s4, 0, Space.s4, Space.s2),
      child: Column(
        children: [
          TextField(
            controller: _search,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText: 'Search name or number',
              prefixIcon: Icon(LucideIcons.search, color: c.textTertiary),
              suffixIcon: _search.text.isEmpty
                  ? null
                  : IconButton(
                      tooltip: 'Clear search',
                      icon: const Icon(LucideIcons.x),
                      onPressed: () => setState(_search.clear),
                    ),
            ),
          ),
          const SizedBox(height: Space.s2),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              spacing: Space.s2,
              children: [
                chip(InboxFilter.all, 'All'),
                chip(InboxFilter.unread, 'Unread'),
                chip(InboxFilter.replies, 'Replies only'),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _body(AsyncValue<List<Conversation>> async, bool wide) {
    final all = async.value;
    if (all == null) {
      return async.hasError
          ? ErrorView(message: '${async.error}', onRetry: () => ref.invalidate(conversationsProvider))
          : const LoadingList(count: 8, itemHeight: 64);
    }
    final shown = filterConversations(all, _filter, _search.text);
    Future<void> refresh() => ref.refresh(conversationsProvider.future);

    if (shown.isEmpty) {
      final empty = all.isEmpty
          ? EmptyState(
              icon: LucideIcons.inbox,
              title: 'No conversations yet',
              message: 'Messages you send and replies you receive show up here.',
              actionLabel: 'Send a message',
              onAction: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SendScreen())),
            )
          : _filter == InboxFilter.unread && _search.text.isEmpty
          ? EmptyState(
              icon: LucideIcons.circleCheck,
              title: 'All caught up',
              message: 'No unread conversations.',
              actionLabel: 'Show all',
              onAction: _clearFilters,
            )
          : EmptyState(
              icon: LucideIcons.search,
              title: 'No matches',
              message: _filter == InboxFilter.replies ? 'No replies match.' : 'Try another name or number.',
              actionLabel: 'Clear filters',
              onAction: _clearFilters,
            );
      return RefreshIndicator(
        onRefresh: refresh,
        child: LayoutBuilder(
          builder: (context, box) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            children: [SizedBox(height: box.maxHeight, child: empty)],
          ),
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: refresh,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: shown.length,
        separatorBuilder: (_, _) => const Divider(indent: 76),
        itemBuilder: (context, i) => _ConversationTile(
          shown[i],
          selected: wide && shown[i].phone == _selected,
          onTap: () => _open(shown[i], wide),
        ),
      ),
    );
  }
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile(this.conv, {required this.selected, required this.onTap});
  final Conversation conv;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final unread = conv.unreadCount > 0;
    return Material(
      color: selected ? c.surfaceHover : c.surface,
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 72),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: Space.s4, vertical: Space.s3),
            child: Row(
              children: [
                InitialsAvatar(initials(conv.name.isNotEmpty ? conv.name : conv.phone), size: 48),
                const SizedBox(width: Space.s3),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              conv.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: (unread ? AppText.h3 : AppText.label).copyWith(color: c.textPrimary),
                            ),
                          ),
                          const SizedBox(width: Space.s2),
                          Text(
                            chatTime(conv.lastMessageAt),
                            style: AppText.caption.copyWith(color: unread ? c.brandText : c.textTertiary),
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          if (conv.outbound) ...[const TickIcon(Tick.sent, size: 14), const SizedBox(width: 4)],
                          Expanded(
                            child: Text(
                              conv.lastMessage.isEmpty ? 'No messages' : conv.lastMessage,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppText.body.copyWith(color: unread ? c.textPrimary : c.textSecondary),
                            ),
                          ),
                          if (unread) ...[
                            const SizedBox(width: Space.s2),
                            Semantics(
                              label: '${conv.unreadCount} unread',
                              excludeSemantics: true,
                              child: Container(
                                constraints: const BoxConstraints(minWidth: 22),
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: c.brand,
                                  borderRadius: BorderRadius.circular(Radii.full),
                                ),
                                child: Text(
                                  unreadBadge(conv.unreadCount),
                                  textAlign: TextAlign.center,
                                  style: AppText.caption.copyWith(color: c.onBrand),
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

Future<void> _showWebhookDiagnostics(BuildContext context, ApiClient api) {
  final future = fetchWebhookLogs(api);
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (ctx) {
      final c = ctx.colors;
      return DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.6,
        maxChildSize: 0.9,
        builder: (ctx, scroll) => FutureBuilder(
          future: future,
          builder: (ctx, snap) {
            final logs = snap.data;
            return ListView(
              controller: scroll,
              padding: const EdgeInsets.fromLTRB(Space.s4, 0, Space.s4, Space.s6),
              children: [
                Text('Webhook diagnostics', style: AppText.h2.copyWith(color: c.textPrimary)),
                const SizedBox(height: Space.s3),
                if (snap.hasError)
                  AlertBanner(tone: Tone.danger, title: "Couldn't load webhook logs", message: '${snap.error}')
                else if (logs == null)
                  const LinearProgressIndicator()
                else if (logs.isEmpty)
                  const AlertBanner(
                    tone: Tone.danger,
                    title: 'No webhook calls received from Meta',
                    message:
                        'Meta is not sending messages to the server. In Meta Business Manager open your app, '
                        'WhatsApp, Configuration, Webhooks. Set the callback URL to https://<your-domain>/api/whatsapp/webhook, '
                        'set the verify token to WHATSAPP_WEBHOOK_VERIFY_TOKEN, Verify and Save, then subscribe to "messages".',
                  )
                else ...[
                  AlertBanner(tone: Tone.success, title: 'Webhook is being called (${logs.length} recent calls)'),
                  const SizedBox(height: Space.s2),
                  for (final l in logs)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(
                        l.kind == 'Inbound message' ? LucideIcons.messageSquare : LucideIcons.webhook,
                        color: c.textSecondary,
                      ),
                      title: Text(l.kind, style: AppText.label.copyWith(color: c.textPrimary)),
                      trailing: Text(
                        l.at == null ? 'unknown' : dateTime(l.at),
                        style: AppText.caption.copyWith(color: c.textTertiary),
                      ),
                    ),
                ],
                const SizedBox(height: Space.s3),
                const AlertBanner(
                  tone: Tone.warning,
                  title: 'Test end to end',
                  message: 'After fixing the Meta config, send a real WhatsApp message to this number from your phone.',
                ),
              ],
            );
          },
        ),
      );
    },
  );
}
