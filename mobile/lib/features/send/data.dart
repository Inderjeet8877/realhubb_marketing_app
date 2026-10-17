import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../inbox/data.dart' show waAccountId;

String _s(Object? v) => v == null ? '' : '$v';

class TemplateButton {
  TemplateButton(this.type, this.text);
  final String type, text; // URL | PHONE | QUICK_REPLY
}

/// Approved template as returned by GET /api/whatsapp/templates.
class WaTemplate {
  WaTemplate({
    required this.name,
    this.language = 'en',
    this.content = '',
    this.headerType = 'none',
    this.headerContent = '',
    this.footerContent = '',
    this.buttons = const [],
    this.approvalStatus = '',
  });

  factory WaTemplate.fromJson(Map j) => WaTemplate(
    name: _s(j['name']),
    language: j['language'] == null ? 'en' : _s(j['language']),
    content: _s(j['content']),
    headerType: j['headerType'] == null ? 'none' : _s(j['headerType']),
    headerContent: _s(j['headerContent']),
    footerContent: _s(j['footerContent']),
    buttons: [
      for (final b in (j['buttons'] as List? ?? const []).whereType<Map>())
        TemplateButton(_s(b['type']), _s(b['text'])),
    ],
    approvalStatus: _s(j['approvalStatus']),
  );

  final String name, language, content, headerType, headerContent, footerContent, approvalStatus;
  final List<TemplateButton> buttons;

  /// Meta silently drops sends of media-header templates without the media.
  bool get needsMedia => const {'image', 'video', 'document'}.contains(headerType);
}

class WaAccount {
  WaAccount(this.name, this.phone, this.quality);
  final String name, phone, quality;
  String get label => [name, if (phone.isNotEmpty) '($phone)'].join(' ').trim();
}

final approvedTemplatesProvider = FutureProvider.autoDispose<List<WaTemplate>>((ref) async {
  final d = await ref.read(apiClientProvider).get('/api/whatsapp/templates', query: {'account_id': waAccountId});
  final list = (d is Map ? d['templates'] as List? : null) ?? const [];
  return [
    for (final t in list.whereType<Map>().map(WaTemplate.fromJson))
      if (t.approvalStatus == 'approved' && t.name.isNotEmpty) t,
  ];
});

final waAccountProvider = FutureProvider.autoDispose<WaAccount>((ref) async {
  final d = await ref.read(apiClientProvider).get('/api/whatsapp/account-info', query: {'account_id': waAccountId});
  if (d is! Map || d['success'] != true) throw ApiException('Account info unavailable');
  return WaAccount(_s(d['verifiedName']), _s(d['displayPhoneNumber']), _s(d['qualityRating']));
});

/// Body for POST /api/whatsapp/send (single). Mirrors the web's handleSend.
Map<String, Object?> sendBody({required String phone, String text = '', WaTemplate? template, String mediaUrl = ''}) =>
    {
      'phoneNumber': phone,
      'message': template == null ? text : '',
      'accountId': waAccountId,
      if (template != null) ...{
        'isTemplate': true,
        'templateName': template.name,
        'templateContent': template.content,
        'languageCode': template.language,
        'templateHeaderType': template.headerType,
        'templateHeaderContent': mediaUrl.trim(),
      },
    };
