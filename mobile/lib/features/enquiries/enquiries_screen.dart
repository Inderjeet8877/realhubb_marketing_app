import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import 'enquiry.dart';

final enquiriesProvider = FutureProvider.autoDispose<List<Enquiry>>((ref) async {
  final d = await ref.read(apiClientProvider).get('/api/enquiries', query: {'limit': 200});
  return [for (final e in (d['enquiries'] as List? ?? const [])) Enquiry.fromJson(Map<String, dynamic>.from(e))];
});

/// Website "Get Started" form submissions (web: dashboard/enquiries).
class EnquiriesScreen extends ConsumerStatefulWidget {
  const EnquiriesScreen({super.key});

  @override
  ConsumerState<EnquiriesScreen> createState() => _EnquiriesScreenState();
}

class _EnquiriesScreenState extends ConsumerState<EnquiriesScreen> {
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _refresh() => ref.refresh(enquiriesProvider.future);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Enquiries')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.s4, Space.s3, Space.s4, 0),
            child: TextField(
              controller: _search,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                labelText: 'Search enquiries',
                prefixIcon: const Icon(LucideIcons.search, size: 18),
                suffixIcon: _search.text.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Clear search',
                        icon: const Icon(LucideIcons.x, size: 18),
                        onPressed: () => setState(_search.clear),
                      ),
              ),
            ),
          ),
          Expanded(
            child: AsyncBody(
              value: ref.watch(enquiriesProvider),
              onRetry: () => ref.invalidate(enquiriesProvider),
              loading: const LoadingList(itemHeight: 120),
              data: (all) {
                final items = all.where((e) => e.matches(_search.text)).toList();
                return RefreshIndicator(
                  onRefresh: _refresh,
                  child: items.isEmpty
                      ? ListView(
                          children: [
                            all.isEmpty
                                ? EmptyState(
                                    icon: LucideIcons.inbox,
                                    title: 'No enquiries yet',
                                    message: 'New submissions from the website form will show up here.',
                                    actionLabel: 'Refresh',
                                    onAction: _refresh,
                                  )
                                : EmptyState(
                                    icon: LucideIcons.searchX,
                                    title: 'No matches',
                                    message: 'Nothing matches "${_search.text}".',
                                    actionLabel: 'Clear search',
                                    onAction: () => setState(_search.clear),
                                  ),
                          ],
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.all(Space.s4),
                          itemCount: items.length,
                          separatorBuilder: (_, _) => const SizedBox(height: Space.s3),
                          itemBuilder: (_, i) => _EnquiryCard(items[i]),
                        ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

Future<void> _launch(BuildContext context, Uri uri) async {
  if (!await launchUrl(uri) && context.mounted) showSnack(context, 'No app found to open this.', tone: Tone.danger);
}

class _EnquiryCard extends StatelessWidget {
  const _EnquiryCard(this.e);
  final Enquiry e;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      onTap: () => showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (_) => _EnquiryDetail(e),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Header(e),
          const SizedBox(height: Space.s2),
          _ContactLinks(e),
          if (e.message.isNotEmpty) ...[const SizedBox(height: Space.s2), _MessageBox(e.message, maxLines: 3)],
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header(this.e);
  final Enquiry e;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final (label, tone) = enquiryStatus(e.status);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InitialsAvatar(initials(e.name)),
        const SizedBox(width: Space.s3),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(e.name.isEmpty ? 'Unnamed' : e.name, style: AppText.h3.copyWith(color: c.textPrimary)),
              Text(
                e.createdAt == null ? 'Date unknown' : dateTime(e.createdAt),
                style: AppText.caption.copyWith(color: c.textTertiary),
              ),
            ],
          ),
        ),
        StatusBadge(label, tone: tone, icon: LucideIcons.circleDot),
      ],
    );
  }
}

class _ContactLinks extends StatelessWidget {
  const _ContactLinks(this.e);
  final Enquiry e;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Wrap(
      spacing: Space.s2,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        if (e.email.isNotEmpty)
          TextButton.icon(
            onPressed: () => _launch(context, Uri(scheme: 'mailto', path: e.email)),
            icon: const Icon(LucideIcons.mail, size: 16),
            label: Text(e.email),
          ),
        if (e.phone.isNotEmpty)
          TextButton.icon(
            onPressed: () => _launch(context, Uri(scheme: 'tel', path: e.phone)),
            icon: const Icon(LucideIcons.phone, size: 16),
            label: Text(displayPhone(e.phone)),
          ),
        if (e.company.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: Space.s3, vertical: Space.s3),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(LucideIcons.building2, size: 16, color: c.textSecondary),
                const SizedBox(width: Space.s2),
                Text(e.company, style: AppText.body.copyWith(color: c.textSecondary)),
              ],
            ),
          ),
      ],
    );
  }
}

class _MessageBox extends StatelessWidget {
  const _MessageBox(this.text, {this.maxLines});
  final String text;
  final int? maxLines;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(Space.s3),
      decoration: BoxDecoration(color: c.surfaceSubtle, borderRadius: BorderRadius.circular(Radii.md)),
      child: Text(
        text,
        maxLines: maxLines,
        overflow: maxLines == null ? null : TextOverflow.ellipsis,
        style: AppText.body.copyWith(color: c.textPrimary),
      ),
    );
  }
}

class _EnquiryDetail extends StatelessWidget {
  const _EnquiryDetail(this.e);
  final Enquiry e;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(Space.s4, 0, Space.s4, Space.s6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _Header(e),
            const SizedBox(height: Space.s3),
            _ContactLinks(e),
            const SizedBox(height: Space.s3),
            Text('Message', style: AppText.label.copyWith(color: c.textSecondary)),
            const SizedBox(height: Space.s1),
            _MessageBox(e.message.isEmpty ? 'No message left.' : e.message),
            const SizedBox(height: Space.s4),
            Row(
              children: [
                if (e.phone.isNotEmpty)
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: () => _launch(context, Uri(scheme: 'tel', path: e.phone)),
                      icon: const Icon(LucideIcons.phone, size: 18),
                      label: const Text('Call'),
                    ),
                  ),
                if (e.phone.isNotEmpty && e.email.isNotEmpty) const SizedBox(width: Space.s3),
                if (e.email.isNotEmpty)
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _launch(context, Uri(scheme: 'mailto', path: e.email)),
                      icon: const Icon(LucideIcons.mail, size: 18),
                      label: const Text('Email'),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
