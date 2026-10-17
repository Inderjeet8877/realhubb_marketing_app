import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/format.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import '../contacts/contacts_data.dart';
import '../contacts/contacts_models.dart';
import 'leads_data.dart';
import 'leads_models.dart';

/// Shares a CSV of leads (replaces the web's CSV download; PDF not ported).
Future<void> shareLeadsCsv(List<(LeadForm, Lead)> rows, String fileName) => SharePlus.instance.share(
  ShareParams(
    files: [XFile.fromData(utf8.encode(leadsCsv(rows)), mimeType: 'text/csv')],
    fileNameOverrides: ['$fileName.csv'],
    subject: 'Leads export',
  ),
);

String exportStamp() => DateTime.now().toIso8601String().split('T').first;

/// One instant form's leads, with "Save to contacts" / "Send WhatsApp".
class LeadFormPage extends ConsumerStatefulWidget {
  const LeadFormPage({super.key, required this.form});
  final LeadForm form;

  @override
  ConsumerState<LeadFormPage> createState() => _LeadFormPageState();
}

class _LeadFormPageState extends ConsumerState<LeadFormPage> {
  var _saving = false;

  /// Same as the web's "Send to Database", in 500-contact batches.
  Future<bool> _save(List<Lead> leads) async {
    final contacts = leadsToContacts(widget.form, leads);
    if (contacts.isEmpty) {
      showSnack(context, 'None of these leads has a valid phone number.', tone: Tone.danger);
      return false;
    }
    setState(() => _saving = true);
    try {
      var saved = 0, dup = 0;
      for (final b in chunk(contacts, 500)) {
        final (s, d) = await ref.read(contactsApiProvider).addBatch(b);
        saved += s;
        dup += d;
      }
      ref.invalidate(contactsProvider);
      final skipped = leads.length - contacts.length;
      if (mounted) {
        showSnack(
          context,
          [
            'Saved ${number(saved)} to "${widget.form.name}"',
            if (dup > 0) '${number(dup)} already in contacts',
            if (skipped > 0) '${number(skipped)} skipped (no valid phone or repeated)',
          ].join(' · '),
          tone: Tone.success,
        );
      }
      return true;
    } catch (e) {
      if (mounted) showSnack(context, '$e', tone: Tone.danger);
      return false;
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _sendWhatsApp(List<Lead> leads) async {
    final router = GoRouter.of(context);
    if (await _save(leads) && mounted) {
      Navigator.of(context).pop();
      router.go('/more/send');
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final f = widget.form;
    final leadsAsync = ref.watch(formLeadsProvider(f.id));
    final leads = leadsAsync.value;
    final ready = leads != null && leads.isNotEmpty && !_saving;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(f.name, maxLines: 1, overflow: TextOverflow.ellipsis),
            Text(
              '${f.pageLabel} · ${leads == null ? '…' : number(leads.length)} leads',
              style: AppText.caption.copyWith(color: c.textSecondary),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Export CSV',
            icon: const Icon(LucideIcons.download),
            onPressed: ready ? () => shareLeadsCsv([for (final l in leads) (f, l)], 'leads_${exportStamp()}') : null,
          ),
        ],
      ),
      body: AsyncBody(
        value: leadsAsync,
        onRetry: () => ref.invalidate(formLeadsProvider(f.id)),
        loading: const LoadingList(itemHeight: 160),
        data: (leads) => RefreshIndicator(
          onRefresh: () => ref.refresh(formLeadsProvider(f.id).future).then((_) {}, onError: (_) {}),
          child: leads.isEmpty
              ? ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: [
                    EmptyState(
                      icon: LucideIcons.users,
                      title: 'No leads for this form',
                      message: 'This may need the leads_retrieval permission on the Meta account.',
                      actionLabel: 'Try again',
                      onAction: () => ref.invalidate(formLeadsProvider(f.id)),
                    ),
                  ],
                )
              : ListView.separated(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(Space.s4),
                  itemCount: leads.length,
                  separatorBuilder: (_, _) => const SizedBox(height: Space.s3),
                  itemBuilder: (_, i) => _LeadCard(lead: leads[i]),
                ),
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(Space.s3),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: ready ? () => _save(leads) : null,
                  icon: _saving
                      ? const SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(LucideIcons.database),
                  label: Text(_saving ? 'Saving…' : 'Save to contacts'),
                ),
              ),
              const SizedBox(width: Space.s3),
              Expanded(
                child: FilledButton.icon(
                  onPressed: ready ? () => _sendWhatsApp(leads) : null,
                  icon: const Icon(LucideIcons.messageSquare),
                  label: const Text('Send WhatsApp'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LeadCard extends StatelessWidget {
  const _LeadCard({required this.lead});
  final Lead lead;

  static const _shown = {'full_name', 'first_name', 'last_name', 'email', 'work_email', 'city', ..._phoneKeys};
  static const _phoneKeys = {'phone', 'phone_number', 'phonenumber', 'mobile', 'phone_'};

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = lead;
    final extra = l.fields.where((e) => !_shown.contains(e.$1.toLowerCase()) && e.$2.isNotEmpty).toList();
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              InitialsAvatar(initials(l.name)),
              const SizedBox(width: Space.s3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(l.name, style: AppText.label.copyWith(color: c.textPrimary)),
                    Text(dateTime(l.createdTime), style: AppText.caption.copyWith(color: c.textTertiary)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: Space.s2),
          if (l.email.isNotEmpty)
            _InfoRow(
              icon: LucideIcons.mail,
              text: l.email,
              label: 'Email ${l.email}',
              onTap: () => launchUrl(Uri(scheme: 'mailto', path: l.email)),
            ),
          if (l.phone.isNotEmpty)
            _InfoRow(
              icon: LucideIcons.phone,
              text: displayPhone(l.phone),
              label: 'Call ${l.phone}',
              onTap: () => launchUrl(Uri(scheme: 'tel', path: '+${normalizeContactPhone(l.phone)}')),
            ),
          if (l.city.isNotEmpty) _InfoRow(icon: LucideIcons.mapPin, text: l.city),
          if (l.campaignName.isNotEmpty) _InfoRow(icon: LucideIcons.megaphone, text: l.campaignName),
          if (extra.isNotEmpty) ...[
            const Divider(height: Space.s6),
            Text('Additional fields', style: AppText.caption.copyWith(color: c.textTertiary)),
            const SizedBox(height: Space.s1),
            for (final (k, v) in extra)
              Padding(
                padding: const EdgeInsets.only(top: Space.s1),
                child: Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: '${fieldLabel(k)}: ',
                        style: AppText.body.copyWith(color: c.textSecondary),
                      ),
                      TextSpan(
                        text: v,
                        style: AppText.label.copyWith(color: c.textPrimary),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.text, this.label, this.onTap});
  final IconData icon;
  final String text;
  final String? label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final row = Row(
      children: [
        Icon(icon, size: 16, color: c.textTertiary),
        const SizedBox(width: Space.s2),
        Expanded(
          child: Text(
            text,
            style: AppText.body.copyWith(color: onTap == null ? c.textSecondary : c.brandText),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
    if (onTap == null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: Space.s1),
        child: row,
      );
    }
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(Radii.sm),
        child: ConstrainedBox(constraints: const BoxConstraints(minHeight: 48), child: row),
      ),
    );
  }
}
