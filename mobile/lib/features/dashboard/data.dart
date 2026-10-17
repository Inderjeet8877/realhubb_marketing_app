import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../widgets/ui.dart';
import '../campaigns/data.dart';

double _d(Object? v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;
int _i(Object? v) => _d(v).round();
List _list(Object? v) => v is List ? v : const [];

// ───────────────────────── Action Queue ─────────────────────────

/// One "needs attention" row. [route] is a go_router path; null = no button.
class ActionItem {
  const ActionItem({
    required this.id,
    required this.icon,
    required this.tone,
    required this.title,
    required this.subtitle,
    this.actionLabel = 'Review',
    this.route,
  });
  final String id, title, subtitle, actionLabel;
  final IconData icon;
  final Tone tone;
  final String? route;
}

String _plural(int n, String one, String many) => '$n ${n == 1 ? one : many}';

/// Data-derived Meta items: new enquiries, active campaigns with CPL ≥ ₹600
/// (top 3), active campaigns that spent > ₹500 with no leads (top 2).
List<ActionItem> metaActions(List<Campaign> all, int newEnquiries) {
  final highCpl = all.where((c) => c.active && c.cpl >= 600).toList()..sort((a, b) => b.cpl.compareTo(a.cpl));
  final noLeads = all.where((c) => c.active && c.spend > 500 && c.leads == 0);
  return [
    if (newEnquiries > 0)
      ActionItem(
        id: 'enquiries',
        icon: LucideIcons.inbox,
        tone: Tone.info,
        title: _plural(newEnquiries, 'new enquiry', 'new enquiries'),
        subtitle: "From the website's Get Started form",
        route: '/more/enquiries',
      ),
    for (final c in highCpl.take(3))
      ActionItem(
        id: 'cpl-${c.id}',
        icon: LucideIcons.triangleAlert,
        tone: Tone.danger,
        title: 'High CPL — ${c.name}',
        subtitle: '${rupees(c.cpl)} per lead (${c.accountName})',
        route: '/more/campaigns',
      ),
    for (final c in noLeads.take(2))
      ActionItem(
        id: 'noleads-${c.id}',
        icon: LucideIcons.trendingDown,
        tone: Tone.warning,
        title: 'No leads yet — ${c.name}',
        subtitle: '${rupees(c.spend)} spent (${c.accountName})',
        route: '/more/campaigns',
      ),
  ];
}

/// WhatsApp items: quality Medium/Low, rejected/paused templates, Meta login
/// expiring within 7 days.
List<ActionItem> whatsappActions({String? quality, int rejected = 0, int paused = 0, MetaExpiry? expiring}) => [
  if (quality == 'RED' || quality == 'YELLOW')
    ActionItem(
      id: 'quality',
      icon: LucideIcons.shieldAlert,
      tone: quality == 'RED' ? Tone.danger : Tone.warning,
      title: 'Number quality is ${quality == 'RED' ? 'Low' : 'Medium'}',
      subtitle: 'See reasons and fixes in the quality card above',
    ),
  if (rejected > 0)
    ActionItem(
      id: 'rejected',
      icon: LucideIcons.circleX,
      tone: Tone.danger,
      title: '${_plural(rejected, 'template', 'templates')} rejected',
      subtitle: 'Meta declined these — edit and resubmit',
      actionLabel: 'Fix',
      route: '/more/templates',
    ),
  if (paused > 0)
    ActionItem(
      id: 'paused',
      icon: LucideIcons.circlePause,
      tone: Tone.warning,
      title: '${_plural(paused, 'template', 'templates')} paused',
      subtitle: 'Suspended for quality issues',
      route: '/more/templates',
    ),
  if (expiring != null)
    ActionItem(
      id: 'expiring',
      icon: LucideIcons.clock,
      tone: Tone.warning,
      title: 'Meta login expires in ${expiring.days}d',
      subtitle: 'Account ${expiring.slot}',
      actionLabel: 'Reconnect',
      route: '/more/settings',
    ),
];

// ───────────────────────── Meta extras ─────────────────────────

class PageSummary {
  PageSummary(this.name);
  final String name;
  int forms = 0, leads = 0;
}

/// Lead forms grouped by Facebook Page, most leads first.
List<PageSummary> pagesSummary(List forms) {
  final byPage = <String, PageSummary>{};
  for (final f in forms.whereType<Map>()) {
    final name = '${f['pageName'] ?? 'Unknown Page'}';
    final p = byPage.putIfAbsent('${f['pageId'] ?? name}', () => PageSummary(name));
    p.forms++;
    p.leads += _i(f['leadsCount']);
  }
  return byPage.values.toList()..sort((a, b) => b.leads.compareTo(a.leads));
}

class LeadsSummary {
  LeadsSummary(this.totalLeads, this.pages);
  final int totalLeads;
  final List<PageSummary> pages;
}

final metaLeadsProvider = FutureProvider.autoDispose<LeadsSummary>((ref) async {
  final res = await ref.read(apiClientProvider).get('/api/meta/leads', query: {'account_id': 'all'});
  return LeadsSummary(_i(res['totalLeads']), pagesSummary(_list(res['forms'])));
});

/// Count of enquiries still in "new" status (Action Queue only).
final newEnquiriesProvider = FutureProvider.autoDispose<int>((ref) async {
  final res = await ref.read(apiClientProvider).get('/api/enquiries', query: {'limit': 200});
  return _list(res['enquiries']).whereType<Map>().where((e) => (e['status'] ?? 'new') == 'new').length;
});

class MetaExpiry {
  const MetaExpiry(this.slot, this.days);
  final String slot;
  final int days;
}

/// First connected Meta slot whose login expires within 7 days, if any.
final metaExpiryProvider = FutureProvider.autoDispose<MetaExpiry?>((ref) async {
  final res = await ref.read(apiClientProvider).get('/api/meta/status');
  for (final s in _list(res['slots']).whereType<Map>()) {
    final d = s['daysUntilExpiry'];
    if (s['connected'] == true && d is num && d <= 7) return MetaExpiry('${s['slot']}', d.toInt());
  }
  return null;
});

// ───────────────────────── WhatsApp ─────────────────────────

class DayPoint {
  DayPoint(this.date, this.sent, this.delivered);
  final String date;
  final int sent, delivered;
}

class CostRow {
  CostRow(this.category, this.cost, this.delivered);
  final String category;
  final double cost;
  final int delivered;
}

/// GET /api/whatsapp/insights?days=N
class WaInsights {
  WaInsights.fromJson(Map j)
    : phoneNumber = j['phoneNumber']?.toString(),
      days = _i(j['days']),
      dayPoints = [
        for (final p in _list(j['dayPoints']).whereType<Map>())
          DayPoint('${p['date'] ?? ''}', _i(p['sent']), _i(p['delivered'])),
      ],
      totalSent = _i(j['totalSent']),
      totalDelivered = _i(j['totalDelivered']),
      deliveryRate = _d(j['deliveryRate']),
      costAvailable = j['costAvailable'] == true,
      costByCategory = [
        for (final c in _list(j['costByCategory']).whereType<Map>())
          CostRow('${c['category'] ?? ''}', _d(c['cost']), _i(c['delivered'])),
      ],
      totalCost = _d(j['totalCost']),
      costCurrency = '${j['costCurrency'] ?? 'INR'}',
      costError = j['costError']?.toString();

  final String? phoneNumber, costError;
  final int days, totalSent, totalDelivered;
  final double deliveryRate, totalCost;
  final bool costAvailable;
  final List<DayPoint> dayPoints;
  final List<CostRow> costByCategory;
  final String costCurrency;
}

final waInsightsProvider = FutureProvider.autoDispose.family<WaInsights, int>((ref, days) async {
  return WaInsights.fromJson(await ref.read(apiClientProvider).get('/api/whatsapp/insights', query: {'days': days}));
});

class WaHealth {
  WaHealth.fromJson(Map j)
    : displayPhoneNumber = '${j['displayPhoneNumber'] ?? ''}',
      verifiedName = '${j['verifiedName'] ?? ''}',
      qualityRating = '${j['qualityRating'] ?? 'NA'}',
      messagingLimitTier = j['messagingLimitTier']?.toString();
  final String displayPhoneNumber, verifiedName, qualityRating;
  final String? messagingLimitTier;
}

final waHealthProvider = FutureProvider.autoDispose<WaHealth>((ref) async {
  return WaHealth.fromJson(
    await ref.read(apiClientProvider).get('/api/whatsapp/account-info', query: {'account_id': '1'}),
  );
});

/// (rejected, paused) template counts.
final waTemplateIssuesProvider = FutureProvider.autoDispose<(int, int)>((ref) async {
  final res = await ref.read(apiClientProvider).get('/api/whatsapp/templates', query: {'account_id': '1'});
  final statuses = _list(res['templates']).whereType<Map>().map((t) => t['approvalStatus']).toList();
  return (statuses.where((s) => s == 'rejected').length, statuses.where((s) => s == 'paused').length);
});

class RateStat {
  RateStat.fromJson(Map j, String key)
    : label = '${j[key] ?? ''}',
      hour = _i(j['hour']),
      sent = _i(j['sent']),
      delivered = _i(j['delivered']),
      read = _i(j['read']),
      readRate = _d(j['readRate']),
      avgLength = _i(j['avgLength']);
  final String label;
  final int hour, sent, delivered, read, avgLength;
  final double readRate;
}

/// GET /api/whatsapp/insights/engagement (whole history, fetched once).
class WaEngagement {
  WaEngagement.fromJson(Map j)
    : totalMessages = _i(j['totalMessages']),
      earliest = parseDate(j['earliestDate']),
      latest = parseDate(j['latestDate']),
      dayStats = [for (final d in _list(j['dayStats']).whereType<Map>()) RateStat.fromJson(d, 'day')],
      templateStats = [for (final t in _list(j['templateStats']).whereType<Map>()) RateStat.fromJson(t, 'template')]
        ..sort((a, b) => b.sent.compareTo(a.sent)),
      bestDay = _opt(j['bestDay'], 'day'),
      worstDay = _opt(j['worstDay'], 'day'),
      bestHour = _opt(j['bestHour'], 'hour'),
      bestTemplate = _opt(j['bestTemplate'], 'template'),
      worstTemplate = _opt(j['worstTemplate'], 'template'),
      copyLengthObservation = j['copyLengthObservation']?.toString(),
      minSampleSize = j['minSampleSize'] is num ? _i(j['minSampleSize']) : 50;

  static RateStat? _opt(Object? v, String key) => v is Map ? RateStat.fromJson(v, key) : null;

  final int totalMessages, minSampleSize;
  final DateTime? earliest, latest;
  final List<RateStat> dayStats, templateStats;
  final RateStat? bestDay, worstDay, bestHour, bestTemplate, worstTemplate;
  final String? copyLengthObservation;
}

final waEngagementProvider = FutureProvider.autoDispose<WaEngagement>((ref) async {
  return WaEngagement.fromJson(await ref.read(apiClientProvider).get('/api/whatsapp/insights/engagement'));
});

const _tiers = {
  'TIER_50': '50 customers / 24h',
  'TIER_250': '250 customers / 24h',
  'TIER_1K': '1,000 customers / 24h',
  'TIER_10K': '10,000 customers / 24h',
  'TIER_100K': '100,000 customers / 24h',
  'TIER_UNLIMITED': 'Unlimited',
};

String formatTier(String? tier) => tier == null ? 'Not available' : _tiers[tier] ?? tier.replaceAll('_', ' ');

const _categories = {
  'MARKETING': 'Marketing',
  'MARKETING_LITE': 'Marketing (lite)',
  'UTILITY': 'Utility',
  'AUTHENTICATION': 'Authentication',
  'AUTHENTICATION_INTERNATIONAL': 'Authentication – international',
  'SERVICE': 'Service',
  'REFERRAL_CONVERSION': 'Referral conversion',
};

String categoryLabel(String c) => _categories[c] ?? c.replaceAll('_', ' ');

/// 0 → "12 AM", 13 → "1 PM".
String formatHour(int h) => '${h % 12 == 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}';

/// Currency amount; unknown codes fall back to "12.50 XYZ" rather than throwing.
String money(double v, String currency) {
  try {
    return NumberFormat.simpleCurrency(locale: 'en_IN', name: currency).format(v);
  } catch (_) {
    return '${v.toStringAsFixed(2)} $currency';
  }
}

/// Meta only returns the traffic-light rating, not a "why"; these are Meta's
/// documented drivers per rating (copied from the web dashboard).
class QualityGuidance {
  const QualityGuidance(this.label, this.tone, this.summary, this.reasons, this.improve);
  final String label, summary;
  final Tone tone;
  final List<String> reasons, improve;
}

const _guidance = {
  'GREEN': QualityGuidance(
    'High',
    Tone.success,
    'Recipients are engaging well with your messages — few are blocking or reporting this number.',
    ['Low block/report rate over recent messages', 'Messages mostly go to people who opted in and expect them'],
    [
      'Keep sending only to contacts who clearly opted in',
      'Keep templates relevant and not overly frequent',
      'Watch this card after any large bulk send — a spike in blocks shows up here first',
    ],
  ),
  'YELLOW': QualityGuidance(
    'Medium',
    Tone.warning,
    'Quality has started slipping — a meaningful share of recent recipients are blocking, reporting as spam, or '
        'ignoring your messages. Left unaddressed, this can drop to Low and reduce your messaging limit.',
    [
      'Rising block or spam-report rate, often after a recent bulk campaign',
      "Messaging contacts who didn't clearly opt in, or haven't engaged in a long time",
      'Sending the same/similar template too frequently',
    ],
    [
      'Pause or slow down bulk sends for a few days while this recovers',
      'Check which recent campaign/template correlates with the drop and stop reusing it as-is',
      'Trim your send list to contacts with clear, recent opt-in — remove long-inactive numbers',
      'Space out repeat messages instead of sending back-to-back campaigns',
    ],
  ),
  'RED': QualityGuidance(
    'Low',
    Tone.danger,
    'This number is at real risk right now — enough recipients have blocked or reported it that Meta may pause '
        'templates or cut your messaging limit until it recovers.',
    [
      'High block/spam-report rate, usually traceable to one recent bulk campaign',
      'Sending to contacts without clear consent, or to a stale/purchased list',
      'A template that recipients found irritating or irrelevant sent at volume',
    ],
    [
      'Stop bulk/broadcast sends immediately until the rating recovers',
      "Identify the recent campaign or template that triggered this (check broadcast reports around when it "
          "dropped) and don't resend it as-is",
      "Only message contacts with explicit, recent opt-in — cut anyone who hasn't engaged recently",
      'Quality typically recovers over 1–2 weeks of restrained, well-targeted sending — resume slowly',
    ],
  ),
  'NA': QualityGuidance(
    'Not available',
    Tone.neutral,
    "Meta hasn't assigned a quality rating yet — usually because this number hasn't sent enough messages "
        'recently for a rating to be calculated.',
    ['Too little recent sending volume for Meta to score'],
    ['Nothing to act on yet — this fills in once the number has more message history'],
  ),
};

QualityGuidance qualityGuidance(String rating) => _guidance[rating] ?? _guidance['NA']!;
