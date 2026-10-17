import 'package:broadzen/features/campaigns/data.dart';
import 'package:broadzen/features/dashboard/data.dart';
import 'package:broadzen/widgets/ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Campaign camp(String id, {String status = 'ACTIVE', double spend = 0, int leads = 0, String acc = '1'}) =>
    Campaign.fromJson({
      'id': id,
      'name': 'C$id',
      'status': status,
      'accountId': acc,
      'insights': {
        'spend': spend,
        'impressions': 1000,
        'clicks': '25',
        'leads': leads,
        'cpl': leads > 0 ? spend / leads : 0,
      },
    });

void main() {
  test('CPL thresholds', () {
    expect(cplLevel(0), CplLevel.none);
    expect(cplLevel(299.99), CplLevel.good);
    expect(cplLevel(300), CplLevel.moderate);
    expect(cplLevel(599), CplLevel.moderate);
    expect(cplLevel(600), CplLevel.high);
  });

  test('fromJson tolerates missing/odd fields', () {
    final c = Campaign.fromJson({'id': 'x', 'insights': null});
    expect(c.name, 'Untitled campaign');
    expect(c.spend, 0);
    expect(c.accountName, '');
    expect(camp('1').clicks, 25); // string numbers parse
    expect(camp('1', acc: '2').accountName, 'Account 2');
  });

  test('totals aggregate spend, leads, CPL and CTR', () {
    final t = CampaignTotals.of([camp('1', spend: 1000, leads: 4), camp('2', status: 'PAUSED', spend: 500, leads: 1)]);
    expect(t.count, 2);
    expect(t.active, 1);
    expect(t.spend, 1500);
    expect(t.leads, 5);
    expect(t.cpl, 300);
    expect(t.ctr, 2.5);
    expect(CampaignTotals.of([]).cpl, 0);
  });

  test('sort by CPL descending', () {
    final s = sortCampaigns([camp('a', spend: 100, leads: 1), camp('b', spend: 900, leads: 1)], CampaignSort.cpl);
    expect(s.map((c) => c.id), ['b', 'a']);
  });

  test('MetaRange query + equality', () {
    expect(const MetaRange('last_7d').query, {'date_preset': 'last_7d'});
    final r = MetaRange('custom', DateTimeRange(start: DateTime(2026, 1, 2), end: DateTime(2026, 2, 3)));
    expect(r.query, {'since': '2026-01-02', 'until': '2026-02-03'});
    expect(r, MetaRange('custom', DateTimeRange(start: DateTime(2026, 1, 2), end: DateTime(2026, 2, 3))));
  });

  test('meta action queue', () {
    final items = metaActions([
      camp('hi', spend: 1300, leads: 2), // CPL 650 → high
      camp('none', spend: 800), // spent, no leads
      camp('small', spend: 400), // under ₹500, ignored
      camp('paused', status: 'PAUSED', spend: 5000, leads: 1), // not active
    ], 3);
    expect(items.map((i) => i.id), ['enquiries', 'cpl-hi', 'noleads-none']);
    expect(items.first.title, '3 new enquiries');
    expect(items[1].tone, Tone.danger);
    expect(metaActions([], 0), isEmpty);
  });

  test('whatsapp action queue', () {
    final items = whatsappActions(quality: 'YELLOW', rejected: 1, expiring: const MetaExpiry('2', 3));
    expect(items.map((i) => i.id), ['quality', 'rejected', 'expiring']);
    expect(items[0].tone, Tone.warning);
    expect(items[1].title, '1 template rejected');
    expect(whatsappActions(quality: 'GREEN'), isEmpty);
  });

  test('pages summary groups forms by page', () {
    final p = pagesSummary([
      {'pageId': 'a', 'pageName': 'A', 'leadsCount': 2},
      {'pageId': 'b', 'pageName': 'B', 'leadsCount': 10},
      {'pageId': 'a', 'pageName': 'A', 'leadsCount': 3},
    ]);
    expect(p.map((x) => (x.name, x.forms, x.leads)), [('B', 1, 10), ('A', 2, 5)]);
  });

  test('whatsapp formatting helpers', () {
    expect(formatHour(0), '12 AM');
    expect(formatHour(13), '1 PM');
    expect(formatTier('TIER_1K'), '1,000 customers / 24h');
    expect(formatTier(null), 'Not available');
    expect(qualityGuidance('weird').label, 'Not available');
    expect(categoryLabel('SOME_NEW'), 'SOME NEW');
  });
}
