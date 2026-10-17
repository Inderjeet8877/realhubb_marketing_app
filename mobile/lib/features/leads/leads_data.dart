import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/api_client.dart';
import 'leads_models.dart';

/// Instant forms for the selected account (+ partial-permission errors).
final leadFormsProvider = FutureProvider<LeadsData>((ref) async {
  final account = ref.watch(accountProvider);
  return LeadsData.fromJson(await ref.read(apiClientProvider).get('/api/meta/leads', query: {'account_id': account}));
});

/// Conversion-tracked leads per campaign — the real lead counts for this
/// business (Instant Form leads_count is 0 here). Same call the web makes.
final campaignLeadsProvider = FutureProvider<List<CampaignLeads>>((ref) async {
  final d = await ref
      .read(apiClientProvider)
      .get('/api/meta/campaigns', query: {'account_id': 'all', 'date_preset': 'maximum'});
  return [
    for (final c in (d is Map ? d['campaigns'] : null) as List? ?? const [])
      if (c is Map) CampaignLeads.fromJson(c.cast<String, dynamic>()),
  ];
});

Future<List<Lead>> fetchFormLeads(ApiClient api, String formId, String account) async {
  final d = await api.get('/api/meta/leads/form', query: {'form_id': formId, 'account_id': account});
  return [
    for (final l in (d is Map ? d['leads'] : null) as List? ?? const [])
      if (l is Map) Lead.fromJson(l.cast<String, dynamic>()),
  ];
}

final formLeadsProvider = FutureProvider.autoDispose.family<List<Lead>, String>(
  (ref, formId) => fetchFormLeads(ref.read(apiClientProvider), formId, ref.watch(accountProvider)),
);
