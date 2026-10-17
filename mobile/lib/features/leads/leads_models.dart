import 'package:csv/csv.dart';

import '../../core/format.dart';
import '../contacts/contacts_models.dart';

/// Pure leads logic (no Flutter). Shapes from src/app/api/meta/leads/**
/// and /api/meta/campaigns. pageAccessToken is deliberately not kept.

class LeadForm {
  const LeadForm({
    required this.id,
    required this.name,
    required this.status,
    required this.leadsCount,
    this.createdTime,
    this.page = '',
  });
  final String id, name, status, page;
  final int leadsCount;
  final DateTime? createdTime;

  bool get active => status == 'ACTIVE';
  String get pageLabel => page.isEmpty ? 'Other' : page;

  factory LeadForm.fromJson(Map<String, dynamic> j) => LeadForm(
    id: '${j['id'] ?? ''}',
    name: '${j['name'] ?? 'Untitled form'}',
    status: '${j['status'] ?? ''}',
    leadsCount: (j['leadsCount'] as num?)?.toInt() ?? 0,
    createdTime: parseDate(j['createdTime']),
    page: '${j['pageName'] ?? j['businessName'] ?? ''}',
  );
}

class LeadsData {
  const LeadsData(this.forms, this.errors);
  final List<LeadForm> forms;

  /// Per-account permission errors: forms may be missing.
  final List<String> errors;

  factory LeadsData.fromJson(dynamic d) {
    final m = d is Map ? d : const {};
    return LeadsData(
      [
        for (final f in m['forms'] as List? ?? const [])
          if (f is Map) LeadForm.fromJson(f.cast<String, dynamic>()),
      ],
      [for (final e in m['errors'] as List? ?? const []) '$e'],
    );
  }
}

class Lead {
  const Lead({required this.id, this.createdTime, this.campaignName = '', this.fields = const []});
  final String id, campaignName;
  final DateTime? createdTime;

  /// (raw field name, joined values) in submission order.
  final List<(String, String)> fields;

  factory Lead.fromJson(Map<String, dynamic> j) => Lead(
    id: '${j['id'] ?? ''}',
    createdTime: parseDate(j['createdTime']),
    campaignName: '${j['campaignName'] ?? ''}',
    fields: [
      for (final f in j['fieldData'] as List? ?? const [])
        if (f is Map)
          (
            '${f['name'] ?? ''}',
            f['values'] is List ? (f['values'] as List).map((v) => '$v').join(', ') : '${f['values'] ?? ''}',
          ),
    ],
  );

  String field(List<String> names) {
    for (final (k, v) in fields) {
      if (names.contains(k.toLowerCase()) && v.trim().isNotEmpty) return v.trim();
    }
    return '';
  }

  String get name {
    final full = field(const ['full_name']);
    if (full.isNotEmpty) return full;
    final fl = '${field(const ['first_name'])} ${field(const ['last_name'])}'.trim();
    return fl.isEmpty ? 'Unknown' : fl;
  }

  String get email => field(const ['email', 'work_email']);
  String get phone => field(_phoneKeys);
  String get city => field(const ['city']);
}

const _phoneKeys = ['phone', 'phone_number', 'phonenumber', 'mobile', 'phone_'];

const _labels = {
  'email': 'Email',
  'phone_number': 'Phone',
  'full_name': 'Name',
  'first_name': 'First name',
  'last_name': 'Last name',
  'city': 'City',
  'state': 'State',
  'country': 'Country',
  'zip_code': 'ZIP code',
  'job_title': 'Job title',
  'company_name': 'Company',
  'work_email': 'Work email',
};

/// "preferred_budget?" → "Preferred budget?".
String fieldLabel(String name) {
  final l = _labels[name.toLowerCase()];
  if (l != null) return l;
  final s = name.replaceAll('_', ' ').trim();
  return s.isEmpty ? 'Field' : s[0].toUpperCase() + s.substring(1);
}

class CampaignLeads {
  const CampaignLeads({
    required this.id,
    required this.name,
    required this.status,
    required this.accountId,
    required this.accountName,
    required this.spend,
    required this.leads,
    required this.cpl,
  });
  final String id, name, status, accountId, accountName;
  final double spend, cpl;
  final int leads;

  factory CampaignLeads.fromJson(Map<String, dynamic> j) {
    final i = j['insights'] is Map ? j['insights'] as Map : const {};
    num n(Object? v) => v is num ? v : num.tryParse('$v') ?? 0;
    return CampaignLeads(
      id: '${j['id'] ?? ''}',
      name: '${j['name'] ?? ''}',
      status: '${j['status'] ?? ''}',
      accountId: '${j['accountId'] ?? ''}',
      accountName: '${j['accountName'] ?? ''}',
      spend: n(i['spend']).toDouble(),
      leads: n(i['leads']).toInt(),
      cpl: n(i['cpl']).toDouble(),
    );
  }
}

/// Web rule: rows for the selected account with any leads or spend, most
/// leads first.
List<CampaignLeads> campaignLeadRows(List<CampaignLeads> all, String account) =>
    all.where((c) => (account == 'all' || c.accountId == account) && (c.leads > 0 || c.spend > 0)).toList()
      ..sort((a, b) => b.leads.compareTo(a.leads));

/// Search by form or page name; [page] null = all pages.
List<LeadForm> filterForms(List<LeadForm> forms, {String search = '', String? page}) {
  final q = search.trim().toLowerCase();
  return forms
      .where(
        (f) =>
            (q.isEmpty || f.name.toLowerCase().contains(q) || f.page.toLowerCase().contains(q)) &&
            (page == null || f.pageLabel == page),
      )
      .toList();
}

List<String> formPages(List<LeadForm> forms) => {for (final f in forms) f.pageLabel}.toList()..sort();

/// Export rows: fixed columns first, then every other field (union across
/// all leads, first-seen order; the web only used the first lead's fields).
List<List<String>> leadsCsvRows(List<(LeadForm, Lead)> leads) {
  const fixed = ['Form Name', 'Page/Business', 'Name', 'Email', 'Phone', 'City', 'Submitted At'];
  final extra = <String>[];
  for (final (_, l) in leads) {
    for (final (k, _) in l.fields) {
      if (k.isNotEmpty && !_phoneKeys.contains(k.toLowerCase()) && !fixed.contains(k) && !extra.contains(k)) {
        extra.add(k);
      }
    }
  }
  return [
    [...fixed, ...extra],
    for (final (f, l) in leads)
      [
        f.name,
        f.page,
        l.name,
        l.email,
        l.phone,
        l.city,
        dateTime(l.createdTime),
        for (final k in extra) l.fields.where((e) => e.$1 == k).map((e) => e.$2).firstOrNull ?? '',
      ],
  ];
}

String leadsCsv(List<(LeadForm, Lead)> leads) => Csv(lineDelimiter: '\n').encode(leadsCsvRows(leads));

/// Leads → contacts for "Save to contacts": batch = form name (so it shows in
/// bulk send), tag = page. Leads without a valid phone are dropped (the web
/// sent them as "-", which the sheet stored as junk); repeats are collapsed.
List<Contact> leadsToContacts(LeadForm form, List<Lead> leads) {
  final seen = <String>{};
  return [
    for (final l in leads)
      if (cleanContactPhone(l.phone) case final p when p.isNotEmpty && seen.add(p))
        Contact(
          id: '',
          name: l.name,
          phone: p,
          email: l.email,
          tags: [if (form.page.isNotEmpty) form.page],
          dataName: form.name,
        ),
  ];
}
