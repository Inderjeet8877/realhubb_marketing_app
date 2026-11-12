import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import 'data.dart';

/// One conversation: header, bubbles on chatBg, composer. Used full-screen on
/// phones and as the right pane of the inbox when wide ([embedded]).
class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key, required this.conversation, this.embedded = false});
  final Conversation conversation;
  final bool embedded;

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> with Polling {
  final _text = TextEditingController();
  final _focus = FocusNode();
  final _pending = <ChatMessage>[];
  final _readWamids = <String>{};
  bool _sending = false, _firstLoad = true;

  String get _phone => widget.conversation.phone;

  @override
  void initState() {
    super.initState();
    ref.listenManual(messagesProvider(_phone), (_, next) {
      final msgs = next.value;
      if (msgs != null) _markRead(msgs);
    }, fireImmediately: true);
  }

  @override
  void dispose() {
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  void onPoll() => ref.invalidate(messagesProvider(_phone));

  /// Read receipt for the newest inbound message (WhatsApp marks every earlier
  /// one read too); the route also zeroes unreadCount for this phone.
  Future<void> _markRead(List<ChatMessage> msgs) async {
    final inbound = msgs.where((m) => !m.outbound && m.wamid != null).toList();
    final fresh = inbound.where((m) => !_readWamids.contains(m.wamid)).toList();
    final first = _firstLoad;
    _firstLoad = false;
    _readWamids.addAll(inbound.map((m) => m.wamid!));
    if (fresh.isEmpty && !(first && widget.conversation.unreadCount > 0)) return;
    try {
      await ref
          .read(apiClientProvider)
          .post(
            '/api/whatsapp/mark-read',
            body: {
              'phone': _phone,
              'wamids': [if (fresh.isNotEmpty) fresh.last.wamid],
              'accountId': waAccountId,
            },
          );
      ref.invalidate(conversationsProvider);
    } catch (_) {
      // Best effort, like the web: a missed receipt only leaves the badge on.
    }
  }

  Future<void> _send() async {
    final text = _text.text.trim();
    if (text.isEmpty || _sending) return;
    final local = ChatMessage(
      id: 'local-${DateTime.now().microsecondsSinceEpoch}',
      text: text,
      outbound: true,
      at: DateTime.now(),
    );
    setState(() {
      _sending = true;
      _pending.add(local);
      _text.clear();
    });
    try {
      final d = await ref
          .read(apiClientProvider)
          .post('/api/whatsapp/send', body: {'phoneNumber': _phone, 'message': text, 'accountId': waAccountId});
      if (d is! Map || d['success'] != true) throw ApiException('Failed to send');
      final sent = ChatMessage(
        id: local.id,
        text: text,
        outbound: true,
        at: local.at,
        tick: Tick.sent,
        wamid: d['messageId'] as String?,
      );
      HapticFeedback.lightImpact();
      setState(() => _pending[_pending.indexOf(local)] = sent);
      ref.invalidate(messagesProvider(_phone));
      ref.invalidate(conversationsProvider);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _pending.remove(local);
        if (_text.text.isEmpty) _text.text = text;
      });
      showSnack(context, "Couldn't send: $e", tone: Tone.danger);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _copy() async {
    final c = widget.conversation;
    await Clipboard.setData(ClipboardData(text: c.name.isNotEmpty ? '${c.name}\n${c.phone}' : c.phone));
    if (mounted) showSnack(context, 'Contact copied');
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final conv = widget.conversation;
    final async = ref.watch(messagesProvider(_phone));
    final server = async.value;
    // Drop optimistic bubbles once the server copy (same wamid) arrives.
    if (server != null) {
      final ids = {for (final m in server) ?m.wamid};
      _pending.removeWhere((m) => m.wamid != null && ids.contains(m.wamid));
    }

    final Widget body;
    if (server != null) {
      body = _MessageList(
        messages: [...server, ..._pending],
        onRefresh: () => ref.refresh(messagesProvider(_phone).future),
        onEmptyAction: _focus.requestFocus,
      );
    } else if (async.hasError) {
      body = ErrorView(message: '${async.error}', onRetry: () => ref.invalidate(messagesProvider(_phone)));
    } else {
      body = const _BubblesSkeleton();
    }

    return Scaffold(
      backgroundColor: c.chatBg,
      appBar: AppBar(
        automaticallyImplyLeading: !widget.embedded,
        titleSpacing: widget.embedded ? Space.s4 : 0,
        title: Row(
          children: [
            InitialsAvatar(initials(conv.name.isNotEmpty ? conv.name : conv.phone), size: 36),
            const SizedBox(width: Space.s3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    conv.title,
                    style: AppText.h3.copyWith(color: c.textPrimary),
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (conv.name.isNotEmpty)
                    Text(displayPhone(conv.phone), style: AppText.caption.copyWith(color: c.textSecondary)),
                ],
              ),
            ),
          ],
        ),
        actions: [IconButton(tooltip: 'Copy name and number', icon: const Icon(LucideIcons.copy), onPressed: _copy)],
      ),
      body: Column(
        children: [
          Expanded(child: body),
          _Composer(controller: _text, focus: _focus, sending: _sending, onSend: _send),
        ],
      ),
    );
  }
}

class _MessageList extends StatelessWidget {
  const _MessageList({required this.messages, required this.onRefresh, required this.onEmptyAction});
  final List<ChatMessage> messages;
  final Future<void> Function() onRefresh;
  final VoidCallback onEmptyAction;

  @override
  Widget build(BuildContext context) {
    if (messages.isEmpty) {
      return RefreshIndicator(
        onRefresh: onRefresh,
        child: LayoutBuilder(
          builder: (context, box) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            children: [
              SizedBox(
                height: box.maxHeight,
                child: EmptyState(
                  icon: LucideIcons.messageSquare,
                  title: 'No messages yet',
                  message: 'Send a message to start the conversation',
                  actionLabel: 'Write a message',
                  onAction: onEmptyAction,
                ),
              ),
            ],
          ),
        ),
      );
    }
    // Newest at the bottom: reverse the list so it opens scrolled to the end.
    final items = withDateSeparators(messages).reversed.toList();
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: LayoutBuilder(
        builder: (context, box) => ListView.builder(
          reverse: true,
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: Space.s3, vertical: Space.s3),
          itemCount: items.length,
          itemBuilder: (context, i) {
            final it = items[i];
            return it is ChatMessage ? _Bubble(it, maxWidth: box.maxWidth * 0.75) : _DateChip(it as String);
          },
        ),
      ),
    );
  }
}

class _DateChip extends StatelessWidget {
  const _DateChip(this.label);
  final String label;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Center(
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: Space.s3),
        padding: const EdgeInsets.symmetric(horizontal: Space.s3, vertical: Space.s1),
        decoration: BoxDecoration(color: c.surfaceRaised, borderRadius: BorderRadius.circular(Radii.full)),
        child: Text(label, style: AppText.caption.copyWith(color: c.textSecondary)),
      ),
    );
  }
}

class TickIcon extends StatelessWidget {
  const TickIcon(this.tick, {super.key, this.size = 15});
  final Tick tick;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final (icon, color, label) = switch (tick) {
      Tick.pending => (LucideIcons.clock, c.textTertiary, 'Sending'),
      Tick.sent => (LucideIcons.check, c.textSecondary, 'Sent'),
      Tick.delivered => (LucideIcons.checkCheck, c.textSecondary, 'Delivered'),
      Tick.read => (LucideIcons.checkCheck, c.brandText, 'Read'),
      Tick.failed => (LucideIcons.circleAlert, c.dangerFg, 'Failed'),
    };
    return Icon(icon, size: size, color: color, semanticLabel: label);
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble(this.m, {required this.maxWidth});
  final ChatMessage m;
  final double maxWidth;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    const r = Radius.circular(18), flat = Radius.circular(4);
    return Align(
      alignment: m.outbound ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: Container(
          margin: const EdgeInsets.only(bottom: Space.s1),
          padding: const EdgeInsets.fromLTRB(Space.s3, Space.s2, Space.s3, Space.s1),
          decoration: BoxDecoration(
            color: m.outbound ? c.bubbleOut : c.bubbleIn,
            borderRadius: BorderRadius.only(
              topLeft: m.outbound ? r : flat,
              topRight: m.outbound ? flat : r,
              bottomLeft: r,
              bottomRight: r,
            ),
          ),
          child: IntrinsicWidth(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (m.templateName != null && m.templateName!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 2),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(LucideIcons.layoutTemplate, size: 12, color: c.successFg),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            'Template: ${m.templateName}',
                            style: AppText.caption.copyWith(color: c.successFg),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                Text(m.text, style: AppText.bodyL.copyWith(color: c.textPrimary)),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text(
                      DateFormat.Hm().format(m.at.toLocal()),
                      style: AppText.caption.copyWith(color: c.textSecondary),
                    ),
                    if (m.outbound) ...[const SizedBox(width: 4), TickIcon(m.tick)],
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({required this.controller, required this.focus, required this.sending, required this.onSend});
  final TextEditingController controller;
  final FocusNode focus;
  final bool sending;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Material(
      color: c.surface,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Space.s3, Space.s2, Space.s2, Space.s2),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: TextField(
                  controller: controller,
                  focusNode: focus,
                  minLines: 1,
                  maxLines: 5,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(hintText: 'Type a message'),
                ),
              ),
              const SizedBox(width: Space.s2),
              ValueListenableBuilder(
                valueListenable: controller,
                builder: (context, v, _) {
                  final enabled = !sending && v.text.trim().isNotEmpty;
                  return IconButton.filled(
                    tooltip: sending ? 'Sending' : 'Send',
                    constraints: const BoxConstraints.tightFor(width: 48, height: 48),
                    onPressed: enabled ? onSend : null,
                    icon: sending
                        ? SizedBox.square(
                            dimension: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: c.textSecondary),
                          )
                        : const Icon(LucideIcons.send, size: 20),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BubblesSkeleton extends StatelessWidget {
  const _BubblesSkeleton();

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return ListView(
      reverse: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.all(Space.s3),
      children: [
        for (var i = 0; i < 8; i++)
          Align(
            alignment: i.isEven ? Alignment.centerRight : Alignment.centerLeft,
            child: Container(
              margin: const EdgeInsets.only(bottom: Space.s2),
              width: 140.0 + (i * 37 % 100),
              height: i % 3 == 0 ? 56 : 40,
              decoration: BoxDecoration(
                color: (i.isEven ? c.bubbleOut : c.bubbleIn).withValues(alpha: 0.6),
                borderRadius: BorderRadius.circular(18),
              ),
            ),
          ),
      ],
    );
  }
}
