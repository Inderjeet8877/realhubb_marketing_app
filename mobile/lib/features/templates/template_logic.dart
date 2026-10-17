import 'package:flutter/widgets.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../widgets/ui.dart';

/// Pure template rules ported from the web templates page + API route.

class TemplateButton {
  TemplateButton(this.type, this.text, [this.value = '']);
  factory TemplateButton.fromJson(Map m) =>
      TemplateButton('${m['type'] ?? 'QUICK_REPLY'}', '${m['text'] ?? ''}', '${m['url'] ?? m['phone_number'] ?? ''}');

  /// URL, PHONE or QUICK_REPLY (the API's own names).
  final String type;
  String text;

  /// url for URL buttons, phone_number for PHONE buttons.
  String value;

  Map<String, dynamic> toJson() => {
    'type': type,
    'text': text,
    if (type == 'URL') 'url': value,
    if (type == 'PHONE') 'phone_number': value,
  };
}

class Template {
  Template({
    required this.id,
    required this.name,
    this.language = 'en_US',
    this.category = 'MARKETING',
    this.content = '',
    this.headerType = 'none',
    this.headerContent = '',
    this.footerContent = '',
    this.buttons = const [],
    this.status = '',
    this.qualityScore,
    this.rejectedReason,
  });

  factory Template.fromJson(Map m) => Template(
    id: '${m['id']}',
    name: '${m['name'] ?? ''}',
    language: '${m['language'] ?? 'en'}',
    category: '${m['category'] ?? 'MARKETING'}',
    content: '${m['content'] ?? ''}',
    headerType: '${m['headerType'] ?? 'none'}',
    headerContent: '${m['headerContent'] ?? ''}',
    footerContent: '${m['footerContent'] ?? ''}',
    buttons: [for (final b in (m['buttons'] as List? ?? const [])) TemplateButton.fromJson(b as Map)],
    status: '${m['approvalStatus'] ?? ''}',
    qualityScore: m['qualityScore']?.toString(),
    rejectedReason: m['rejectedReason']?.toString(),
  );

  final String id, name, language, category, content, headerType, headerContent, footerContent, status;
  final List<TemplateButton> buttons;
  final String? qualityScore, rejectedReason;

  bool get isMediaHeader => mediaHeaderTypes.contains(headerType);
}

const mediaHeaderTypes = ['image', 'video', 'document'];

const languages = {
  'en_US': 'English (US)',
  'en_GB': 'English (UK)',
  'hi_IN': 'Hindi',
  'kn_IN': 'Kannada',
  'ta_IN': 'Tamil',
  'te_IN': 'Telugu',
};
const categories = {'MARKETING': 'Marketing', 'UTILITY': 'Utility', 'AUTHENTICATION': 'Authentication'};
const headerTypes = {'none': 'None', 'text': 'Text', 'image': 'Image', 'video': 'Video', 'document': 'Document'};

typedef StatusInfo = ({String label, Tone tone, IconData icon});

/// DESIGN_PLAN §5.4 template status map (values are the API's mapped statuses).
StatusInfo templateStatus(String status) => switch (status) {
  'approved' => (label: 'Approved', tone: Tone.success, icon: LucideIcons.circleCheck),
  'pending' => (label: 'Pending review', tone: Tone.info, icon: LucideIcons.clock),
  'rejected' => (label: 'Rejected', tone: Tone.danger, icon: LucideIcons.circleX),
  'paused' => (label: 'Paused – quality issue', tone: Tone.warning, icon: LucideIcons.circlePause),
  'disabled' => (label: 'Disabled by Meta', tone: Tone.danger, icon: LucideIcons.ban),
  'in_appeal' => (label: 'In appeal', tone: Tone.warning, icon: LucideIcons.triangleAlert),
  'limit_exceeded' => (label: 'Limit exceeded', tone: Tone.warning, icon: LucideIcons.triangleAlert),
  'pending_deletion' => (label: 'Pending deletion', tone: Tone.neutral, icon: LucideIcons.trash2),
  _ => (label: 'Not submitted', tone: Tone.neutral, icon: LucideIcons.clock),
};

/// Plain-language "what happened, what to do" for the non-obvious statuses.
String? statusExplanation(Template t) {
  final q = t.qualityScore != null ? ' (quality rating: ${t.qualityScore})' : '';
  return switch (t.status) {
    'paused' =>
      'Meta suspended this template$q — usually because too many recipients blocked or reported messages sent with it. '
          "Sending will likely fail until Meta lifts the pause (often a few hours), and repeated pauses can lead to it being disabled entirely. "
          "Consider revising the message or targeting before it's used again.",
    'disabled' =>
      'Meta has disabled this template$q — it can no longer be used to send messages. '
          "This usually follows repeated quality pauses. You'll need to create a new template.",
    'rejected' when t.rejectedReason != null => "Meta's rejection reason: ${t.rejectedReason}.",
    'limit_exceeded' => "This template hit Meta's per-template messaging limit for the current period.",
    _ => null,
  };
}

typedef ContentAnalysis = ({int score, String label, List<String> warnings});

const _qualityLabels = [(90, 'Excellent'), (75, 'Good'), (55, 'Fair'), (35, 'Poor'), (0, 'Bad')];
// Valid with unicode: true (the lint doesn't know the flag); covered by the test.
// ignore: valid_regexps
final _emoji = RegExp(r'\p{Extended_Pictographic}', unicode: true);
final _allCaps = RegExp(r'\b[A-Z]{4,}\b');
final _urgency = RegExp(
  r"\b(limited units?|hurry|act now|don'?t miss|last chance|offer ends|only \d+\s*(left|units?)|not for every)\b",
  caseSensitive: false,
);
final _optOut = RegExp(r'\b(stop|unsubscribe|opt.?out)\b', caseSensitive: false);

/// Predicted content score — our own estimate from the text, not Meta's rating.
/// Advisory only; ported 1:1 from the web `analyzeTemplateContent`.
ContentAnalysis analyzeContent(String text) {
  final warnings = <String>[];
  var score = 100;
  if (text.trim().isEmpty) return (score: 100, label: 'Excellent', warnings: warnings);

  final emojis = _emoji.allMatches(text).length;
  if (emojis > 5) {
    warnings.add('$emojis emojis used — heavy emoji use reads as spammy to many recipients. Keep it to 2–3 at most.');
    score -= 15;
  }

  final exclamations = '!'.allMatches(text).length;
  if (exclamations > 3) {
    warnings.add('$exclamations exclamation marks — excessive urgency punctuation is a common spam signal.');
    score -= 15;
  }

  final caps = _allCaps.allMatches(text).toList();
  if (caps.length > 2) {
    warnings.add('Multiple ALL-CAPS words (e.g. "${caps.first[0]}") — reads as shouting.');
    score -= 15;
  }

  if (_urgency.hasMatch(text)) {
    warnings.add(
      'Contains urgency/scarcity phrasing ("limited", "hurry", "act now", etc.) — this pattern correlates strongly '
      'with block/report rates in sales-style broadcasts.',
    );
    score -= 20;
  }

  if (!_optOut.hasMatch(text)) {
    warnings.add(
      'No opt-out instructions found — adding "Reply STOP to unsubscribe" gives recipients an alternative to '
      'blocking/reporting you, which is what actually damages your quality rating.',
    );
    score -= 15;
  }

  if (score < 0) score = 0;
  final label = _qualityLabels.firstWhere((l) => score >= l.$1).$2;
  return (score: score, label: label, warnings: warnings);
}

/// Same rule the API applies before submitting: lowercase, a-z/0-9/_ only,
/// must start with a letter.
String sanitizeName(String raw) =>
    raw.toLowerCase().replaceAll(RegExp(r'[^a-z0-9_]'), '_').replaceFirst(RegExp(r'^[^a-z]+'), '');

/// Every `{{...}}` placeholder, as the API counts them for Meta's example values.
List<String> templateVariables(String text) => RegExp(r'\{\{[^}]+\}\}').allMatches(text).map((m) => m[0]!).toList();

/// Meta wants numbered variables in order from {{1}}; null when the body is fine.
String? variableIssue(String text) {
  final vars = templateVariables(text);
  if (vars.isEmpty) return null;
  final nums = <int>{};
  for (final v in vars) {
    final n = int.tryParse(v.substring(2, v.length - 2).trim());
    if (n == null) return 'Variables must be numbers, like {{1}} — "$v" will be rejected.';
    nums.add(n);
  }
  final sorted = nums.toList()..sort();
  for (var i = 0; i < sorted.length; i++) {
    if (sorted[i] != i + 1) return 'Number variables in order starting at {{1}}, with no gaps (missing {{${i + 1}}}).';
  }
  return null;
}
