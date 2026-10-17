import 'package:broadzen/features/enquiries/enquiry.dart';
import 'package:broadzen/features/rcs/rcs_logic.dart';
import 'package:broadzen/features/settings/settings_logic.dart';
import 'package:broadzen/widgets/ui.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Meta slot status: connected / expiring (<=7d) / not connected', () {
    expect(const MetaSlot(slot: '1').status, ('Not connected', Tone.neutral));
    expect(const MetaSlot(slot: '1', connected: true, daysUntilExpiry: 30).status, ('Connected', Tone.success));
    expect(const MetaSlot(slot: '1', connected: true).status, ('Connected', Tone.success));
    expect(const MetaSlot(slot: '1', connected: true, daysUntilExpiry: 8).status.$2, Tone.success);
    expect(const MetaSlot(slot: '1', connected: true, daysUntilExpiry: 7).status, ('Expiring soon', Tone.warning));
    expect(const MetaSlot(slot: '1', connected: true, daysUntilExpiry: -2).status, ('Expired', Tone.warning));
    expect(const MetaSlot(slot: '1', connected: true, daysUntilExpiry: 5).expiryText, 'expires in 5d');
    expect(const MetaSlot(slot: '1').expiryText, isNull);
  });

  test('Device labels', () {
    final now = DateTime.utc(2026, 10, 17, 12);
    final d = Device.fromJson({
      'token': 't',
      'platform': 'android',
      'label': 'Samsung SM-A515F',
      'osVersion': '14',
      'registeredAt': '2026-10-01T10:00:00.000Z',
      'updatedAt': '2026-10-17T09:00:00.000Z',
    });
    expect(d.platformLine, 'Android 14');
    expect(d.lastActive(now: now), 'Last active 3h ago');
    expect(d.installed, startsWith('Installed 1 Oct 2026'));
    expect(d.isWeb, isFalse);

    final old = Device.fromJson({'token': 'w', 'platform': 'web', 'label': 'Chrome on Windows'});
    expect(old.platformLine, 'Web');
    expect(old.isWeb, isTrue);
    expect(old.lastActive(now: now), 'Last active unknown');
    expect(old.installed, 'Installed before device tracking was added');
  });

  test('Enquiry status mapping and search', () {
    expect(enquiryStatus('new'), ('New', Tone.info));
    expect(enquiryStatus(''), ('New', Tone.info));
    expect(enquiryStatus('Contacted'), ('Contacted', Tone.warning));
    expect(enquiryStatus('closed'), ('Closed', Tone.success));
    expect(enquiryStatus('spam'), ('Spam', Tone.neutral));

    final e = Enquiry.fromJson({'id': '1', 'name': 'Asha Rao', 'email': 'a@x.in', 'phone': '9876543210'});
    expect(e.status, 'new');
    expect(e.matches('asha'), isTrue);
    expect(e.matches('98765'), isTrue);
    expect(e.matches('nobody'), isFalse);
  });

  test('RCS recipients merge selected contacts + one-off, deduped by phone', () {
    const contacts = [
      (name: 'Asha', phone: '919876543210'),
      (name: 'Ravi', phone: '919999988888'),
      (name: 'Meena', phone: '918888877777'),
    ];
    final r = buildRecipients(
      contacts: contacts,
      selectedPhones: {'919876543210', '918888877777'},
      quickName: 'Dup',
      quickPhone: '98765 43210', // same as Asha once normalized
    );
    expect(r.map((x) => x.name), ['Asha', 'Meena']);

    final withQuick = buildRecipients(contacts: contacts, selectedPhones: {}, quickPhone: ' 9123456789 ');
    expect(withQuick, [(name: '9123456789', phone: '9123456789')]);

    expect(buildRecipients(contacts: contacts, selectedPhones: {}), isEmpty);
    expect(filterContacts(contacts, 'ra').map((x) => x.name), ['Ravi']);
    expect(filterContacts(List.generate(300, (i) => (name: 'c$i', phone: '$i')), '').length, 200);
  });
}
