import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../app/providers.dart';
import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import 'lead_form_page.dart';
import 'leads_data.dart';
import 'leads_models.dart';

const _accounts = {'all': 'All accounts', '1': 'Account 1', '2': 'Account 2', '3': 'Account 3'};

class LeadsScreen extends ConsumerStatefulWidget {
  const LeadsScreen({super.key});

  @override
  ConsumerState<LeadsScreen> createState() => _LeadsScreenState();
}

class _LeadsScreenState extends ConsumerState<LeadsScreen> {
  final _search = TextEditingController();
  String? _page;
  Timer? _auto;

  @override
  void dispose() {
    _auto?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _invalidate() {
    ref.invalidate(leadFormsProvider);
    ref.invalidate(campaignLeadsProvider);
  }

  Future<void> _refresh() async {
    _invalidate();
    await Future.wait([ref.read(leadFormsProvider.future), ref.read(campaignLeadsProvider.future)])
        .then((_) {}, onError: (_) {}); // errors render in the tabs
  }

  void _toggleAuto(bool on) => setState(() {
    _auto?.cancel();
    _auto = on ? Timer.periodic(const Duration(seconds: 30), (_) => _invalidate()) : null;
  });

  void _open(LeadForm f) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => LeadFormPage(form: f)));

  Future<void> _exportAll(List<LeadForm> forms) async {
    final api = ref.read(apiClientProvider);
    final account = ref.read(accountProvider);
    final progress = ValueNotifier<(int, String)>((0, 'Starting…'));
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text('Exporting leads'),
        content: ValueListenableBuilder(
          valueListenable: progress,
          builder: (_, p, _) => Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              LinearProgressIndicator(value: p.$1 / forms.length),
              const SizedBox(height: Space.s3),
              Text('Form ${p.$1} of ${forms.length}: ${p.$2}', maxLines: 2, overflow: TextOverflow.ellipsis),
            ],
          ),
        ),
      ),
    );
    final rows = <(LeadForm, Lead)>[];
    for (var i = 0; i < forms.length; i++) {
      progress.value = (i + 1, forms[i].name);
      try {
        rows.addAll([for (final l in await fetchFormLeads(api, forms[i].id, account)) (forms[i], l)]);
      } catch (_) {} // same as web: skip forms that fail
    }
    progress.dispose();
    if (!mounted) return;
    Navigator.of(context, rootNavigator: true).pop();
    if (rows.isEmpty) {
      showSnack(context, 'No leads found to export.');
    } else {
      await shareLeadsCsv(rows, 'leads_export_${exportStamp()}');
    }
  }

  @override
  Widget build(BuildContext context) {
    final account = ref.watch(accountProvider);
    final formsAsync = ref.watch(leadFormsProvider);
    final campAsync = ref.watch(campaignLeadsProvider);
    final forms = formsAsync.value?.forms ?? const <LeadForm>[];
    final filtered = filterForms(forms, search: _search.text, page: _page);
    final campRows = campaignLeadRows(campAsync.value ?? const [], account);
    final totalLeads = campAsync.hasValue ? campRows.fold(0, (s, c) => s + c.leads) : null;

    final header = _Header(
      totalLeads: totalLeads,
      forms: formsAsync.hasValue ? forms : null,
      auto: _auto != null,
      onAuto: _toggleAuto,
      errors: formsAsync.value?.errors ?? const [],
    );

    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Leads'),
          actions: [
            PopupMenuButton<String>(
              tooltip: 'Choose ad account',
              initialValue: account,
              onSelected: (v) {
                ref.read(accountProvider.notifier).set(v);
                setState(() => _page = null);
              },
              itemBuilder: (_) => [
                for (final e in _accounts.entries)
                  CheckedPopupMenuItem(value: e.key, checked: e.key == account, child: Text(e.value)),
              ],
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 48),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_accounts[account] ?? 'Account $account', style: AppText.label),
                    const Icon(LucideIcons.chevronDown, size: 18),
                  ],
                ),
              ),
            ),
            IconButton(tooltip: 'Refresh', icon: const Icon(LucideIcons.refreshCw), onPressed: _invalidate),
            IconButton(
              tooltip: 'Export leads as CSV',
              icon: const Icon(LucideIcons.download),
              onPressed: filtered.isEmpty ? null : () => _exportAll(filtered),
            ),
          ],
          bottom: TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: [
              Tab(text: 'By campaign (${campAsync.hasValue ? campRows.length : '…'})'),
              Tab(text: 'Instant forms (${formsAsync.hasValue ? filtered.length : '…'})'),
              const Tab(text: 'Summary'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _tab(campAsync, header, (_) => _campaigns(context, campRows)),
            _tab(formsAsync, header, (_) => _forms(context, forms, filtered)),
            _tab(formsAsync, header, (_) => _summary(context, forms, totalLeads)),
          ],
        ),
      ),
    );
  }

  /// KPIs on top of every tab; the tab body handles loading / error / data.
  Widget _tab<T>(AsyncValue<T> value, Widget header, List<Widget> Function(T) data) => RefreshIndicator(
    onRefresh: _refresh,
    child: ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(Space.s4),
      children: [
        header,
        const SizedBox(height: Space.s4),
        ...value.when(
          skipLoadingOnRefresh: true,
          data: data,
          loading: () => [for (var i = 0; i < 4; i++) const _Skeleton()],
          error: (e, _) => [ErrorView(message: '$e', onRetry: _invalidate)],
        ),
      ],
    ),
  );

  List<Widget> _campaigns(BuildContext context, List<CampaignLeads> rows) {
    if (rows.isEmpty) {
      return [
        EmptyState(
          icon: LucideIcons.megaphone,
          title: 'No campaigns with leads or spend',
          message: 'Try another ad account.',
          actionLabel: 'Refresh',
          onAction: _invalidate,
        ),
      ];
    }
    final spend = rows.fold(0.0, (s, c) => s + c.spend);
    final leads = rows.fold(0, (s, c) => s + c.leads);
    return [
      SectionHeader(
        'Leads by campaign',
        subtitle:
            '${number(leads)} leads · ${rupees(spend)} spend · ${leads > 0 ? rupees(spend / leads) : '—'} avg CPL',
      ),
      for (final c in rows) _CampaignCard(c),
    ];
  }

  List<Widget> _forms(BuildContext context, List<LeadForm> forms, List<LeadForm> filtered) {
    final pages = formPages(forms);
    return [
      TextField(
        controller: _search,
        onChanged: (_) => setState(() {}),
        decoration: InputDecoration(
          hintText: 'Search forms or pages',
          prefixIcon: const Icon(LucideIcons.search),
          suffixIcon: _search.text.isEmpty
              ? null
              : IconButton(
                  tooltip: 'Clear search',
                  icon: const Icon(LucideIcons.x),
                  onPressed: () => setState(_search.clear),
                ),
        ),
      ),
      const SizedBox(height: Space.s3),
      DropdownButtonFormField<String?>(
        key: ValueKey(_page),
        initialValue: pages.contains(_page) ? _page : null,
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'Page', prefixIcon: Icon(LucideIcons.filter)),
        items: [
          DropdownMenuItem(value: null, child: Text('All pages (${pages.length})')),
          for (final p in pages)
            DropdownMenuItem(
              value: p,
              child: Text(p, overflow: TextOverflow.ellipsis),
            ),
        ],
        onChanged: (v) => setState(() => _page = v),
      ),
      const SizedBox(height: Space.s3),
      if (forms.isEmpty)
        EmptyState(
          icon: LucideIcons.fileText,
          title: 'No instant forms',
          message: 'Connect a Meta account that has lead forms.',
          actionLabel: 'Refresh',
          onAction: _invalidate,
        )
      else if (filtered.isEmpty)
        EmptyState(
          icon: LucideIcons.searchX,
          title: 'No matches',
          message: 'No forms match these filters.',
          actionLabel: 'Clear filters',
          onAction: () => setState(() {
            _search.clear();
            _page = null;
          }),
        )
      else
        for (final f in filtered) _FormCard(f, onView: f.leadsCount > 0 ? () => _open(f) : null),
    ];
  }

  List<Widget> _summary(BuildContext context, List<LeadForm> forms, int? totalLeads) {
    final c = context.colors;
    if (forms.isEmpty) {
      return [
        EmptyState(
          icon: LucideIcons.chartNoAxesColumn,
          title: 'Nothing to summarise yet',
          message: 'Summary appears once instant forms load.',
          actionLabel: 'Refresh',
          onAction: _invalidate,
        ),
      ];
    }
    final sorted = [...forms]..sort((a, b) => b.leadsCount.compareTo(a.leadsCount));
    final maxLeads = sorted.first.leadsCount;
    final pages = formPages(forms);
    final active = forms.where((f) => f.active).length;
    return [
      const SectionHeader('Overall'),
      StatGrid(
        children: [
          StatCard(label: 'Total forms', value: number(forms.length), icon: LucideIcons.fileText),
          StatCard(label: 'Active forms', value: number(active), icon: LucideIcons.target, tone: Tone.success),
          StatCard(label: 'Total leads', value: number(totalLeads), icon: LucideIcons.users, tone: Tone.info),
          StatCard(
            label: 'Avg leads / form',
            value: totalLeads == null ? '—' : number((totalLeads / forms.length).round()),
            icon: LucideIcons.chartNoAxesColumn,
          ),
        ],
      ),
      const SizedBox(height: Space.s6),
      const SectionHeader('Leads by form'),
      AppCard(
        child: Column(
          children: [
            for (final f in sorted)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: Space.s2),
                child: Row(
                  children: [
                    Expanded(
                      flex: 3,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(f.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.label),
                          Text(f.pageLabel, style: AppText.caption.copyWith(color: c.textTertiary)),
                        ],
                      ),
                    ),
                    const SizedBox(width: Space.s3),
                    Expanded(
                      flex: 2,
                      child: LinearProgressIndicator(
                        value: maxLeads == 0 ? 0 : f.leadsCount / maxLeads,
                        minHeight: 6,
                        borderRadius: BorderRadius.circular(Radii.full),
                        semanticsLabel: '${f.name} leads',
                        semanticsValue: '${f.leadsCount}',
                      ),
                    ),
                    SizedBox(
                      width: 44,
                      child: Text(number(f.leadsCount), textAlign: TextAlign.right, style: AppText.label),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
      const SizedBox(height: Space.s6),
      const SectionHeader('Forms by page'),
      for (final p in pages)
        Builder(
          builder: (_) {
            final pf = forms.where((f) => f.pageLabel == p).toList();
            return AppCard(
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(p, style: AppText.label.copyWith(color: c.textPrimary)),
                        Text(
                          '${pf.length} form${pf.length == 1 ? '' : 's'}',
                          style: AppText.caption.copyWith(color: c.textTertiary),
                        ),
                      ],
                    ),
                  ),
                  Text(
                    '${number(pf.fold<int>(0, (s, f) => s + f.leadsCount))} leads',
                    style: AppText.h3.copyWith(color: c.brandText),
                  ),
                ],
              ),
            );
          },
        ),
    ];
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.totalLeads,
    required this.forms,
    required this.auto,
    required this.onAuto,
    required this.errors,
  });
  final int? totalLeads;
  final List<LeadForm>? forms;
  final bool auto;
  final ValueChanged<bool> onAuto;
  final List<String> errors;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      children: [
        StatGrid(
          children: [
            StatCard(label: 'Total leads', value: number(totalLeads), icon: LucideIcons.users),
            StatCard(label: 'Total forms', value: number(forms?.length), icon: LucideIcons.fileText, tone: Tone.info),
            StatCard(
              label: 'Active forms',
              value: number(forms?.where((f) => f.active).length),
              icon: LucideIcons.target,
              tone: Tone.success,
            ),
            AppCard(
              onTap: () => onAuto(!auto),
              child: MergeSemantics(
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Auto-refresh', style: AppText.caption.copyWith(color: c.textSecondary)),
                          const SizedBox(height: Space.s2),
                          Text(auto ? 'On · 30 s' : 'Off', style: AppText.h3.copyWith(color: c.textPrimary)),
                        ],
                      ),
                    ),
                    Switch(value: auto, onChanged: onAuto),
                  ],
                ),
              ),
            ),
          ],
        ),
        if (errors.isNotEmpty) ...[
          const SizedBox(height: Space.s3),
          AlertBanner(tone: Tone.warning, title: 'Some lead forms may be missing', message: errors.join('\n')),
        ],
      ],
    );
  }
}

class _Skeleton extends StatelessWidget {
  const _Skeleton();

  @override
  Widget build(BuildContext context) => Container(
    height: 96,
    margin: const EdgeInsets.only(bottom: Space.s3),
    decoration: BoxDecoration(color: context.colors.surfaceHover, borderRadius: BorderRadius.circular(Radii.lg)),
  );
}

class _CampaignCard extends StatelessWidget {
  const _CampaignCard(this.c);
  final CampaignLeads c;

  @override
  Widget build(BuildContext context) {
    final col = context.colors;
    final (tone, icon) = switch (c.status) {
      'ACTIVE' => (Tone.success, LucideIcons.circleCheck),
      'PAUSED' => (Tone.warning, LucideIcons.circlePause),
      _ => (Tone.neutral, LucideIcons.circleMinus),
    };
    Widget metric(String label, String value) => Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: AppText.caption.copyWith(color: col.textTertiary)),
          Text(value, style: AppText.label.copyWith(color: col.textPrimary)),
        ],
      ),
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: Space.s3),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    c.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.label.copyWith(color: col.textPrimary),
                  ),
                ),
                const SizedBox(width: Space.s2),
                StatusBadge(_title(c.status), tone: tone, icon: icon),
              ],
            ),
            Text(c.accountName, style: AppText.caption.copyWith(color: col.textTertiary)),
            const SizedBox(height: Space.s3),
            Row(
              children: [
                metric('Spend', c.spend > 0 ? rupees(c.spend) : '—'),
                metric('Leads', number(c.leads)),
                metric('CPL', c.cpl > 0 ? rupees(c.cpl) : '—'),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

String _title(String s) => s.isEmpty ? 'Unknown' : s[0].toUpperCase() + s.substring(1).toLowerCase();

class _FormCard extends StatelessWidget {
  const _FormCard(this.f, {this.onView});
  final LeadForm f;
  final VoidCallback? onView;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final (tone, icon) = switch (f.status) {
      'ACTIVE' => (Tone.success, LucideIcons.circleCheck),
      'INACTIVE' => (Tone.danger, LucideIcons.circleAlert),
      _ => (Tone.neutral, LucideIcons.clock),
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: Space.s3),
      child: AppCard(
        onTap: onView,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        f.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: AppText.label.copyWith(color: c.textPrimary),
                      ),
                      Text(f.pageLabel, style: AppText.caption.copyWith(color: c.textTertiary)),
                    ],
                  ),
                ),
                const SizedBox(width: Space.s2),
                StatusBadge(_title(f.status), tone: tone, icon: icon),
              ],
            ),
            const SizedBox(height: Space.s2),
            Row(
              children: [
                Icon(LucideIcons.users, size: 16, color: c.textTertiary),
                const SizedBox(width: Space.s1),
                Text('${number(f.leadsCount)} leads', style: AppText.body.copyWith(color: c.textSecondary)),
                const SizedBox(width: Space.s4),
                Icon(LucideIcons.calendar, size: 16, color: c.textTertiary),
                const SizedBox(width: Space.s1),
                Expanded(
                  child: Text(
                    f.createdTime == null ? '—' : dateTime(f.createdTime).split(',').first,
                    style: AppText.body.copyWith(color: c.textSecondary),
                  ),
                ),
                TextButton.icon(
                  onPressed: onView,
                  icon: const Icon(LucideIcons.eye, size: 18),
                  label: const Text('View leads'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
