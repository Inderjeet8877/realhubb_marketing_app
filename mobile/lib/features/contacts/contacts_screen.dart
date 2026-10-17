import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/format.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import 'contacts_data.dart';
import 'contacts_models.dart';
import 'import_page.dart';

const _pageSize = 50;

class ContactsScreen extends ConsumerStatefulWidget {
  const ContactsScreen({super.key});

  @override
  ConsumerState<ContactsScreen> createState() => _ContactsScreenState();
}

class _ContactsScreenState extends ConsumerState<ContactsScreen> {
  final _search = TextEditingController();
  var _view = ContactView.all;
  String? _batch;
  var _shown = _pageSize;
  final _selected = <String>{};
  var _busy = false;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _set(VoidCallback f) => setState(() {
    f();
    _shown = _pageSize;
    _selected.clear();
  });

  Future<void> _reload() async {
    ref.invalidate(contactsProvider);
    ref.invalidate(failedContactsProvider);
    try {
      await ref.read(contactsProvider.future);
    } catch (_) {} // shown by the error state
  }

  Future<void> _import() async {
    final saved = await Navigator.of(context)
        .push<bool>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => const ImportContactsPage()));
    if (saved == true) _reload();
  }

  Future<void> _run(Future<String> Function() action) async {
    setState(() => _busy = true);
    try {
      final msg = await action();
      if (mounted) showSnack(context, msg, tone: Tone.success);
      _reload();
    } catch (e) {
      if (mounted) showSnack(context, '$e', tone: Tone.danger);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    final n = _selected.length;
    if (!await confirm(
      context,
      title: 'Delete $n contact${n == 1 ? '' : 's'}?',
      message: 'They will be removed from your contacts and bulk-send lists. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    )) {
      return;
    }
    await _run(() async {
      await ref.read(contactsApiProvider).delete(_selected.toList());
      _selected.clear();
      return 'Deleted $n contact${n == 1 ? '' : 's'}';
    });
  }

  Future<void> _dedupe(String batch) async {
    if (!await confirm(
      context,
      title: 'Remove duplicates?',
      message: 'Scan "$batch" for contacts with the same phone number and delete the extra copies, keeping the first.',
      confirmLabel: 'Remove duplicates',
    )) {
      return;
    }
    await _run(() async {
      final (removed, remaining) = await ref.read(contactsApiProvider).dedupe(batch);
      return removed > 0
          ? 'Removed ${number(removed)} duplicate(s). ${number(remaining)} remain in this batch.'
          : 'No duplicates found in this batch.';
    });
  }

  @override
  Widget build(BuildContext context) {
    final contacts = ref.watch(contactsProvider);
    final failed = ref.watch(failedContactsProvider);
    final selecting = _selected.isNotEmpty;

    return PopScope(
      canPop: !selecting,
      onPopInvokedWithResult: (didPop, _) => didPop ? null : setState(_selected.clear),
      child: Scaffold(
        appBar: selecting
            ? AppBar(
                leading: IconButton(
                  tooltip: 'Cancel selection',
                  icon: const Icon(LucideIcons.x),
                  onPressed: () => setState(_selected.clear),
                ),
                title: Text('${_selected.length} selected'),
                actions: [
                  TextButton.icon(
                    onPressed: _busy ? null : _delete,
                    icon: const Icon(LucideIcons.trash2),
                    label: Text('Delete (${_selected.length})'),
                    style: TextButton.styleFrom(foregroundColor: context.colors.dangerFg),
                  ),
                ],
              )
            : AppBar(
                title: const Text('Contacts'),
                actions: [
                  TextButton.icon(
                    onPressed: _import,
                    icon: const Icon(LucideIcons.upload),
                    label: const Text('Import'),
                  ),
                ],
              ),
        body: AsyncBody(value: contacts, onRetry: _reload, data: (all) => _body(context, all, failed)),
      ),
    );
  }

  Widget _body(BuildContext context, List<Contact> all, AsyncValue<List<Contact>> failed) {
    final c = context.colors;
    final failedList = failed.value ?? const <Contact>[];
    final isFailed = _view == ContactView.failed;
    final now = DateTime.now();
    final list = filterContacts(
      isFailed ? failedList : all,
      view: _view,
      search: _search.text,
      batch: _batch,
      now: now,
    );
    final batches = batchNames([...all, ...failedList]);
    final paged = list.take(_shown).toList();

    Widget stat(ContactView v, String label, String value, IconData icon, Tone tone, [String? sub]) {
      final on = _view == v;
      return DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(Radii.lg),
          border: Border.all(color: on ? c.brand : Colors.transparent, width: 2),
        ),
        child: Semantics(
          selected: on,
          button: true,
          child: StatCard(
            label: label,
            value: value,
            icon: icon,
            tone: tone,
            sub: on ? 'Showing' : sub,
            subTone: on ? Tone.brand : null,
            onTap: () => _set(() {
              _view = on && v != ContactView.all ? ContactView.all : v;
              if (v == ContactView.failed) _batch = null;
            }),
          ),
        ),
      );
    }

    final header = <Widget>[
      StatGrid(
        children: [
          stat(ContactView.all, 'Total', number(all.length), LucideIcons.users, Tone.brand),
          stat(
            ContactView.tagged,
            'Tagged',
            number(all.where((x) => x.tags.isNotEmpty).length),
            LucideIcons.tag,
            Tone.success,
            '${number({for (final x in all) ...x.tags}.length)} tags',
          ),
          stat(
            ContactView.failed,
            'Failed numbers',
            failed.isLoading && !failed.hasValue ? '…' : (failed.hasError ? '—' : number(failedList.length)),
            LucideIcons.circleX,
            Tone.danger,
          ),
          stat(
            ContactView.recent,
            'Added this month',
            number(all.where((x) => isRecentContact(x, now)).length),
            LucideIcons.userPlus,
            Tone.info,
            'Last 30 days',
          ),
        ],
      ),
      if (_view != ContactView.all) ...[
        const SizedBox(height: Space.s3),
        AlertBanner(
          tone: isFailed ? Tone.danger : Tone.info,
          title: switch (_view) {
            ContactView.failed => 'Failed and invalid numbers',
            ContactView.tagged => 'Contacts with at least one tag',
            _ => 'Contacts added in the last 30 days',
          },
          message: isFailed ? 'Separated out during validation. These are not part of your sendable contacts.' : null,
          actionLabel: 'Show all contacts',
          onAction: () => _set(() => _view = ContactView.all),
        ),
      ],
      const SizedBox(height: Space.s3),
      TextField(
        controller: _search,
        onChanged: (_) => _set(() {}),
        decoration: InputDecoration(
          hintText: 'Search name or phone',
          prefixIcon: const Icon(LucideIcons.search),
          suffixIcon: _search.text.isEmpty
              ? null
              : IconButton(
                  tooltip: 'Clear search',
                  icon: const Icon(LucideIcons.x),
                  onPressed: () => _set(_search.clear),
                ),
        ),
      ),
      const SizedBox(height: Space.s3),
      DropdownButtonFormField<String?>(
        key: ValueKey(_batch), // re-sync when the chip clears the filter
        initialValue: batches.contains(_batch) ? _batch : null,
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'Batch', prefixIcon: Icon(LucideIcons.layers)),
        items: [
          DropdownMenuItem(value: null, child: Text('All batches (${number(all.length)})')),
          for (final b in batches)
            DropdownMenuItem(
              value: b,
              child: Text('$b (${number(all.where((x) => x.batch == b).length)})', overflow: TextOverflow.ellipsis),
            ),
        ],
        onChanged: (v) => _set(() => _batch = v),
      ),
      if (_batch != null) ...[
        const SizedBox(height: Space.s3),
        AppCard(
          padding: const EdgeInsets.symmetric(horizontal: Space.s3, vertical: Space.s1),
          child: Row(
            children: [
              Icon(LucideIcons.tag, size: 16, color: c.brandText),
              const SizedBox(width: Space.s2),
              Expanded(
                child: Text(
                  '$_batch · ${number(list.length)} contacts',
                  style: AppText.label.copyWith(color: c.textPrimary),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              TextButton(onPressed: _busy ? null : () => _dedupe(_batch!), child: const Text('Remove duplicates')),
              IconButton(
                tooltip: 'Clear batch filter',
                icon: const Icon(LucideIcons.x, size: 18),
                onPressed: () => _set(() => _batch = null),
              ),
            ],
          ),
        ),
      ],
      if (_busy)
        const Padding(
          padding: EdgeInsets.only(top: Space.s3),
          child: LinearProgressIndicator(),
        ),
      const SizedBox(height: Space.s3),
    ];

    final Widget? empty = isFailed && failed.hasError
        ? ErrorView(message: '${failed.error}', onRetry: () => ref.invalidate(failedContactsProvider))
        : isFailed && failed.isLoading
        ? const LoadingList(count: 3)
        : all.isEmpty && !isFailed
        ? EmptyState(
            icon: LucideIcons.users,
            title: 'No contacts yet',
            message: 'Import a CSV or Excel file to add contacts.',
            actionLabel: 'Import contacts',
            onAction: _import,
          )
        : list.isEmpty
        ? EmptyState(
            icon: LucideIcons.searchX,
            title: 'No matches',
            message: 'No contacts match these filters.',
            actionLabel: 'Clear filters',
            onAction: () => _set(() {
              _search.clear();
              _batch = null;
              _view = ContactView.all;
            }),
          )
        : null;

    return RefreshIndicator(
      onRefresh: _reload,
      child: NotificationListener<ScrollNotification>(
        onNotification: (n) {
          if (n.metrics.extentAfter < 600 && _shown < list.length) setState(() => _shown += _pageSize);
          return false;
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(Space.s4),
          children: [
            ...header,
            if (empty != null)
              empty
            else ...[
              for (final x in paged)
                Padding(
                  padding: const EdgeInsets.only(bottom: Space.s2),
                  child: _ContactCard(
                    contact: x,
                    failed: isFailed,
                    selected: _selected.contains(x.id),
                    onTap: _selected.isEmpty || isFailed || x.id.isEmpty
                        ? null
                        : () => setState(() => _selected.contains(x.id) ? _selected.remove(x.id) : _selected.add(x.id)),
                    onLongPress: isFailed || x.id.isEmpty ? null : () => setState(() => _selected.add(x.id)),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: Space.s3),
                child: Text(
                  'Showing ${number(paged.length)} of ${number(list.length)}',
                  textAlign: TextAlign.center,
                  style: AppText.caption.copyWith(color: c.textTertiary),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ContactCard extends StatelessWidget {
  const _ContactCard({
    required this.contact,
    required this.failed,
    required this.selected,
    this.onTap,
    this.onLongPress,
  });
  final Contact contact;
  final bool failed, selected;
  final VoidCallback? onTap, onLongPress;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final x = contact;
    return Card(
      clipBehavior: Clip.antiAlias,
      color: selected ? c.brandSubtle : null,
      child: InkWell(
        onTap: onTap,
        onLongPress: onLongPress,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 64),
          child: Padding(
            padding: const EdgeInsets.all(Space.s3),
            child: Row(
              children: [
                selected
                    ? Icon(LucideIcons.squareCheck, size: 32, color: c.brandText, semanticLabel: 'Selected')
                    : InitialsAvatar(initials(x.name), tone: failed ? Tone.danger : Tone.brand),
                const SizedBox(width: Space.s3),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        x.name,
                        style: AppText.label.copyWith(color: c.textPrimary),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        x.phone.isEmpty ? 'No phone' : displayPhone(x.phone),
                        style: AppText.body.copyWith(color: c.textSecondary),
                      ),
                      const SizedBox(height: Space.s1),
                      Wrap(
                        spacing: Space.s1,
                        runSpacing: Space.s1,
                        children: [
                          if (failed)
                            StatusBadge(x.failReason ?? 'Unknown', tone: Tone.danger, icon: LucideIcons.circleX),
                          if (x.dataName.isNotEmpty) StatusBadge(x.dataName, tone: Tone.brand),
                          for (final t in x.tags) StatusBadge(t),
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
