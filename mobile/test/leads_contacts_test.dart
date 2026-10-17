import 'package:broadzen/features/contacts/contacts_models.dart';
import 'package:broadzen/features/leads/leads_models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('phone validation', () {
    test('Indian numbers normalise and need a 6-9 mobile prefix', () {
      expect(cleanContactPhone('98765 43210'), '+919876543210');
      expect(cleanContactPhone('+91-98765-43210'), '+919876543210');
      expect(cleanContactPhone('09876543210'), '+919876543210');
      expect(cleanContactPhone('0091 9876543210'), '+919876543210');
      expect(cleanContactPhone('1234567890'), '');
      expect(cleanContactPhone('+911234567890'), '');
      expect(cleanContactPhone(''), '');
      expect(cleanContactPhone('abc'), '');
    });

    test('international numbers need a plausible length', () {
      expect(cleanContactPhone('+971 50 123 4567'), '+971501234567');
      expect(cleanContactPhone('1234567'), '');
      expect(cleanContactPhone('1234567890123456'), '');
    });
  });

  group('column detection', () {
    test('finds name/phone/email/tags headers', () {
      final c = detectColumns([
        ['Tags', 'E-mail', 'Mobile Number', 'Full Name'],
      ]);
      expect((c.name, c.phone, c.email, c.tags), (3, 2, 1, 0));
    });

    test('"contact" is a phone column, "Contact Name" is the name', () {
      expect(
        detectColumns([
          ['Contact Name', 'Contact'],
        ]),
        (name: 0, phone: 1, email: -1, tags: -1, headerRow: 0),
      );
      final c = detectColumns([
        ['names', 'phone', 'labels'],
      ]);
      expect((c.name, c.phone, c.tags), (0, 1, 2));
    });

    test('defaults to name=0 phone=1 without headers; skips title rows', () {
      final c = detectColumns([
        ['foo', 'bar'],
      ]);
      expect((c.name, c.phone), (0, 1));
      expect(
        detectColumns([
          ['My export'],
          ['Name', 'Phone'],
        ]).headerRow,
        1,
      );
    });
  });

  group('import parsing', () {
    const csvText =
        '﻿Name,Phone,Email,Tags\r\n'
        'Asha,9876543210,a@x.com,"vip; mumbai"\r\n'
        'Ravi,98765 43210,,\r\n' // duplicate within file
        ',9123456789,,\r\n' // missing name
        'Bad,12345,,\r\n' // invalid phone
        ',,,\r\n' // blank, ignored
        'Meera,+971501234567,,\r\n'
        'Old,9988776655,,\r\n';

    test('CSV → valid / invalid / duplicates', () {
      final rows = parseCsvRows(csvText);
      expect(rows.first.first, 'Name');
      final p = parseContactRows(rows, 'May batch');
      expect(p.valid.map((c) => c.name), ['Asha', 'Meera', 'Old']);
      expect(p.valid.first.phone, '+919876543210');
      expect(p.valid.first.tags, ['vip', 'mumbai']);
      expect(p.valid.first.email, 'a@x.com');
      expect(p.valid.first.dataName, 'May batch');
      expect(p.fileDuplicates, 1);
      expect(p.invalid.map((r) => (r.row, r.reason)), [(4, 'Missing name'), (5, 'Invalid or missing phone number')]);
    });

    test('duplicates against existing contacts', () {
      final p = parseContactRows(parseCsvRows(csvText), 'b');
      final existing = existingPhoneSet([
        const Contact(id: '1', name: 'x', phone: '919988776655'),
        const Contact(id: '2', name: 'y', phone: 'junk'),
      ]);
      final q = p.excluding(existing);
      expect(q.valid.map((c) => c.name), ['Asha', 'Meera']);
      expect(q.existingDuplicates, 1);
      expect(q.fileDuplicates, 1);
    });

    test('semicolon CSV and empty file', () {
      expect(parseCsvRows('name;phone\nA;9876543210\n')[1], ['A', '9876543210']);
      expect(parseCsvRows('  '), isEmpty);
      expect(chunk([1, 2, 3, 4, 5], 2), [
        [1, 2],
        [3, 4],
        [5],
      ]);
    });
  });

  group('contact filters', () {
    final now = DateTime(2026, 10, 17);
    final list = [
      Contact(id: '1', name: 'Asha Rao', phone: '+919876543210', tags: const ['vip'], dataName: 'A', addedAt: now),
      Contact(id: '2', name: 'Ravi', phone: '+919123456789', addedAt: DateTime(2026, 8, 1)),
      Contact.fromJson(const {'id': '3', 'name': 'Meera', 'phone': '971501234567', 'tags': 'x,y', 'dataName': 'B'}),
    ];

    test('view, search and batch', () {
      List<String> ids(List<Contact> l) => l.map((c) => c.id).toList();
      expect(ids(filterContacts(list, now: now)), ['1', '2', '3']);
      expect(ids(filterContacts(list, view: ContactView.tagged, now: now)), ['1', '3']);
      expect(ids(filterContacts(list, view: ContactView.recent, now: now)), ['1']);
      expect(ids(filterContacts(list, search: 'asha', now: now)), ['1']);
      expect(ids(filterContacts(list, search: '91234', now: now)), ['2']);
      expect(ids(filterContacts(list, search: '+91 98765', now: now)), ['1']);
      expect(ids(filterContacts(list, batch: uncategorized, now: now)), ['2']);
      expect(filterContacts(list, batch: 'B', view: ContactView.recent, now: now), isEmpty);
      expect(batchNames(list), ['A', 'B', uncategorized]);
    });
  });

  group('leads', () {
    final form = LeadForm.fromJson(const {
      'id': 'f1',
      'name': 'Godrej',
      'status': 'ACTIVE',
      'leadsCount': 2,
      'pageName': 'Realhubb',
      'pageAccessToken': 'secret',
    });
    final a = Lead.fromJson(const {
      'id': 'l1',
      'createdTime': '2026-10-01T10:00:00+0000',
      'fieldData': [
        {
          'name': 'full_name',
          'values': ['Asha Rao'],
        },
        {
          'name': 'phone_number',
          'values': ['+919876543210'],
        },
        {
          'name': 'budget',
          'values': ['1 Cr'],
        },
      ],
    });
    final b = Lead.fromJson(const {
      'id': 'l2',
      'fieldData': [
        {
          'name': 'first_name',
          'values': ['Ravi'],
        },
        {
          'name': 'last_name',
          'values': ['K'],
        },
        {
          'name': 'email',
          'values': ['r@x.com'],
        },
        {
          'name': 'city',
          'values': ['Pune, MH'],
        },
      ],
    });

    test('field extraction', () {
      expect((a.name, a.phone, a.email), ('Asha Rao', '+919876543210', ''));
      expect((b.name, b.email, b.city, b.phone), ('Ravi K', 'r@x.com', 'Pune, MH', ''));
      expect(const Lead(id: 'x').name, 'Unknown');
      expect(fieldLabel('phone_number'), 'Phone');
      expect(fieldLabel('preferred_budget'), 'Preferred budget');
    });

    test('CSV export rows union extra fields and quote commas', () {
      final rows = leadsCsvRows([(form, a), (form, b)]);
      expect(rows.first, [
        'Form Name',
        'Page/Business',
        'Name',
        'Email',
        'Phone',
        'City',
        'Submitted At',
        'full_name',
        'budget',
        'first_name',
        'last_name',
        'email',
        'city',
      ]);
      expect(rows[1].sublist(0, 5), ['Godrej', 'Realhubb', 'Asha Rao', '', '+919876543210']);
      expect(rows[1][8], '1 Cr');
      expect(rows[2][8], '');
      expect(leadsCsv([(form, b)]), contains('"Pune, MH"'));
    });

    test('save-to-contacts drops leads without a valid phone', () {
      final c = leadsToContacts(form, [a, b, a]);
      expect(c.length, 1);
      expect((c.single.phone, c.single.dataName), ('+919876543210', 'Godrej'));
      expect(c.single.tags, ['Realhubb']);
    });

    test('form filters and campaign rows', () {
      final forms = [
        form,
        LeadForm.fromJson(const {'id': 'f2', 'name': 'Lodha', 'status': 'INACTIVE', 'businessName': 'Biz'}),
        LeadForm.fromJson(const {'id': 'f3', 'name': 'Misc'}),
      ];
      expect(filterForms(forms, search: 'real').map((f) => f.id), ['f1']);
      expect(filterForms(forms, page: 'Biz').map((f) => f.id), ['f2']);
      expect(filterForms(forms, page: 'Other').map((f) => f.id), ['f3']);
      expect(formPages(forms), ['Biz', 'Other', 'Realhubb']);

      CampaignLeads camp(String id, String acc, int leads, Object spend) => CampaignLeads.fromJson({
        'id': id,
        'accountId': acc,
        'insights': {'leads': leads, 'spend': spend},
      });
      final all = [camp('a', '1', 2, 10), camp('b', '2', 5, 0), camp('c', '1', 0, 0), camp('d', '1', 9, '50')];
      expect(campaignLeadRows(all, 'all').map((c) => c.id), ['d', 'b', 'a']);
      expect(campaignLeadRows(all, '1').map((c) => c.id), ['d', 'a']);
    });
  });
}
