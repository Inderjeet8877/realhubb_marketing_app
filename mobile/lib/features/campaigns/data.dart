import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';

/// Meta campaign row from GET /api/meta/campaigns.
class Campaign {
  Campaign({
    required this.id,
    required this.name,
    required this.objective,
    required this.status,
    required this.accountId,
    required this.accountName,
    this.spend = 0,
    this.impressions = 0,
    this.clicks = 0,
    this.ctr = 0,
    this.leads = 0,
    this.cpl = 0,
  });

  final String id, name, objective, status, accountId, accountName;
  final double spend, ctr, cpl;
  final int impressions, clicks, leads;

  factory Campaign.fromJson(Map<String, dynamic> j) {
    final ins = (j['insights'] as Map?) ?? const {};
    double d(Object? v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;
    int i(Object? v) => d(v).round();
    final acc = '${j['accountId'] ?? ''}';
    return Campaign(
      id: '${j['id'] ?? ''}',
      name: '${j['name'] ?? 'Untitled campaign'}',
      objective: '${j['objective'] ?? ''}',
      status: '${j['status'] ?? ''}',
      accountId: acc,
      accountName: '${j['accountName'] ?? (acc.isEmpty ? '' : 'Account $acc')}',
      spend: d(ins['spend']),
      impressions: i(ins['impressions']),
      clicks: i(ins['clicks']),
      ctr: d(ins['ctr']),
      leads: i(ins['leads']),
      cpl: d(ins['cpl']),
    );
  }

  bool get active => status == 'ACTIVE';
}

const _objectives = {
  'CONVERSIONS': 'Conversions',
  'LEAD_GENERATION': 'Lead Gen',
  'OUTCOME_LEADS': 'Lead Gen',
  'TRAFFIC': 'Traffic',
  'OUTCOME_TRAFFIC': 'Traffic',
  'BRAND_AWARENESS': 'Brand Awareness',
  'OUTCOME_AWARENESS': 'Awareness',
  'REACH': 'Reach',
  'OUTCOME_ENGAGEMENT': 'Engagement',
  'OUTCOME_SALES': 'Sales',
};

String objectiveLabel(String o) => _objectives[o] ?? o.replaceAll('_', ' ');

/// CPL bands (DESIGN_PLAN §5.4): Good < ₹300, Moderate < ₹600, else High.
enum CplLevel { none, good, moderate, high }

CplLevel cplLevel(num cpl) => cpl <= 0
    ? CplLevel.none
    : cpl < 300
    ? CplLevel.good
    : cpl < 600
    ? CplLevel.moderate
    : CplLevel.high;

/// Sums for a set of campaigns (KPI cards and totals rows).
class CampaignTotals {
  CampaignTotals.of(Iterable<Campaign> list) {
    for (final c in list) {
      count++;
      if (c.active) active++;
      spend += c.spend;
      impressions += c.impressions;
      clicks += c.clicks;
      leads += c.leads;
    }
  }

  int count = 0, active = 0, impressions = 0, clicks = 0, leads = 0;
  double spend = 0;

  double get cpl => leads > 0 ? spend / leads : 0;
  double get ctr => impressions > 0 ? clicks / impressions * 100 : 0;
}

enum CampaignSort { spend, leads, cpl }

List<Campaign> sortCampaigns(Iterable<Campaign> list, CampaignSort by) => [...list]
  ..sort(
    (a, b) => switch (by) {
      CampaignSort.spend => b.spend.compareTo(a.spend),
      CampaignSort.leads => b.leads.compareTo(a.leads),
      CampaignSort.cpl => b.cpl.compareTo(a.cpl),
    },
  );

/// Date range for Meta insights: a preset or a custom since/until.
class MetaRange {
  const MetaRange(this.preset, [this.custom]);
  final String preset; // last_7d | last_30d | last_90d | this_month | maximum | custom
  final DateTimeRange? custom;

  static const presets = {
    'last_7d': 'Last 7 days',
    'last_30d': 'Last 30 days',
    'last_90d': 'Last 90 days',
    'this_month': 'This month',
    'maximum': 'All time',
  };

  static final _ymd = DateFormat('yyyy-MM-dd');

  String get label {
    if (custom == null) return presets[preset] ?? 'Last 30 days';
    final f = DateFormat('d MMM');
    return '${f.format(custom!.start)} – ${f.format(custom!.end)}';
  }

  Map<String, String> get query => custom == null
      ? {'date_preset': preset}
      : {'since': _ymd.format(custom!.start), 'until': _ymd.format(custom!.end)};

  @override
  bool operator ==(Object other) => other is MetaRange && other.preset == preset && other.custom == custom;
  @override
  int get hashCode => Object.hash(preset, custom);
}

typedef CampaignQuery = ({String account, MetaRange range});

final campaignsProvider = FutureProvider.autoDispose.family<List<Campaign>, CampaignQuery>((ref, q) async {
  final res = await ref
      .read(apiClientProvider)
      .get('/api/meta/campaigns', query: {'account_id': q.account, ...q.range.query});
  return [for (final c in (res['campaigns'] as List? ?? const [])) Campaign.fromJson(c as Map<String, dynamic>)];
});
