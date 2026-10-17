import 'package:broadzen/features/templates/template_logic.dart';
import 'package:broadzen/widgets/ui.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('analyzeContent', () {
    test('empty text is Excellent with no advice', () {
      final a = analyzeContent('   ');
      expect((a.score, a.label), (100, 'Excellent'));
      expect(a.warnings, isEmpty);
    });

    test('clean text with opt-out scores 100', () {
      final a = analyzeContent('Hi {{1}}, your order has shipped. Reply STOP to unsubscribe.');
      expect(a.score, 100);
      expect(a.warnings, isEmpty);
    });

    test('missing opt-out only: -15 → Good', () {
      final a = analyzeContent('Hi there, your order has shipped.');
      expect((a.score, a.label), (85, 'Good'));
      expect(a.warnings.single, startsWith('No opt-out instructions'));
    });

    test('thresholds: >5 emoji, >3 !, >2 caps words, urgency', () {
      expect(analyzeContent('😀😀😀😀😀 ok. stop').warnings, isEmpty);
      expect(analyzeContent('😀😀😀😀😀😀 ok. stop').warnings.single, startsWith('6 emojis used'));
      expect(analyzeContent('a!!! stop').warnings, isEmpty);
      expect(analyzeContent('a!!!! stop').warnings.single, startsWith('4 exclamation marks'));
      expect(analyzeContent('HUGE SALE stop').warnings, isEmpty);
      expect(analyzeContent('HUGE SALE TODAY stop').warnings.single, contains('"HUGE"'));
      expect(analyzeContent('Hurry up. stop').warnings.single, startsWith('Contains urgency'));
      expect(analyzeContent('Only 3 left. opt-out anytime').warnings.single, startsWith('Contains urgency'));
    });

    test('every rule tripped → 20, Bad', () {
      final a = analyzeContent('😀😀😀😀😀😀 HUGE MEGA SALE NOW!!!! Hurry, last chance');
      expect(a.warnings, hasLength(5));
      expect((a.score, a.label), (20, 'Bad'));
    });

    test('labels follow 90/75/55/35 cut-offs', () {
      expect(analyzeContent('Act now!!!! no way out').label, 'Poor'); // 100-15-20-15 = 50
      expect(analyzeContent('Act now').label, 'Fair'); // 100-20-15 = 65
    });
  });

  test('sanitizeName matches the API', () {
    expect(sanitizeName('Diwali Offer-2026'), 'diwali_offer_2026');
    expect(sanitizeName('12_promo'), 'promo');
    expect(sanitizeName('__x'), 'x');
    expect(sanitizeName('99'), '');
  });

  test('variables are detected and validated', () {
    expect(templateVariables('Hi {{1}}, code {{2}} and {{name}}'), ['{{1}}', '{{2}}', '{{name}}']);
    expect(variableIssue('no vars'), isNull);
    expect(variableIssue('{{1}} and {{2}} then {{1}}'), isNull);
    expect(variableIssue('Hi {{name}}'), contains('must be numbers'));
    expect(variableIssue('{{1}} {{3}}'), contains('missing {{2}}'));
    expect(variableIssue('{{2}}'), contains('missing {{1}}'));
  });

  test('status map', () {
    String label(String s) => templateStatus(s).label;
    Tone tone(String s) => templateStatus(s).tone;
    expect((label('approved'), tone('approved')), ('Approved', Tone.success));
    expect((label('pending'), tone('pending')), ('Pending review', Tone.info));
    expect(tone('rejected'), Tone.danger);
    expect((label('paused'), tone('paused')), ('Paused – quality issue', Tone.warning));
    expect(tone('disabled'), Tone.danger);
    expect(tone('in_appeal'), Tone.warning);
    expect(tone('limit_exceeded'), Tone.warning);
    expect(tone('pending_deletion'), Tone.neutral);
    expect((label('none'), tone('')), ('Not submitted', Tone.neutral));
  });

  test('statusExplanation includes quality score and reason', () {
    expect(
      statusExplanation(Template(id: '1', name: 'a', status: 'paused', qualityScore: 'RED')),
      contains('(quality rating: RED)'),
    );
    expect(
      statusExplanation(Template(id: '1', name: 'a', status: 'rejected', rejectedReason: 'SPAM')),
      "Meta's rejection reason: SPAM.",
    );
    expect(statusExplanation(Template(id: '1', name: 'a', status: 'rejected')), isNull);
    expect(statusExplanation(Template(id: '1', name: 'a', status: 'approved')), isNull);
  });

  test('buttons round-trip the API shape', () {
    final b = TemplateButton.fromJson({'type': 'PHONE', 'text': 'Call', 'phone_number': '+91'});
    expect(b.toJson(), {'type': 'PHONE', 'text': 'Call', 'phone_number': '+91'});
    expect(TemplateButton('QUICK_REPLY', 'Yes').toJson(), {'type': 'QUICK_REPLY', 'text': 'Yes'});
  });
}
