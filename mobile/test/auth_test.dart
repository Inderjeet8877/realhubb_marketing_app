import 'package:broadzen/app/router.dart';
import 'package:broadzen/features/auth/auth_controller.dart';
import 'package:broadzen/features/auth/signup_screen.dart';
import 'package:flutter_test/flutter_test.dart';

Me me({required bool admin}) =>
    Me(id: '1', email: 'a@b.co', name: 'A', role: 'owner', isPlatformAdmin: admin, workspaceName: 'Acme');

void main() {
  group('authRedirect', () {
    test('restoring → splash only', () {
      const s = AuthState.loading();
      expect(authRedirect(s, '/home'), '/splash');
      expect(authRedirect(s, '/login'), '/splash');
      expect(authRedirect(s, '/splash'), isNull);
    });

    test('signed out → login, but sign-up and pending stay reachable', () {
      const s = AuthState.signedOut();
      for (final p in ['/home', '/workspace', '/more/admin', '/splash']) {
        expect(authRedirect(s, p), '/login', reason: p);
      }
      for (final p in ['/login', '/signup', '/pending']) {
        expect(authRedirect(s, p), isNull, reason: p);
      }
    });

    test('normal user → workspace only, never the legacy screens or admin', () {
      final s = AuthState.signedIn(me(admin: false));
      for (final p in ['/home', '/inbox', '/more', '/more/admin', '/more/enquiries', '/login', '/splash']) {
        expect(authRedirect(s, p), '/workspace', reason: p);
      }
      expect(authRedirect(s, '/workspace'), isNull);
    });

    test('platform admin → shell (incl. admin), never auth pages or workspace', () {
      final s = AuthState.signedIn(me(admin: true));
      for (final p in ['/home', '/inbox', '/more', '/more/admin', '/more/settings']) {
        expect(authRedirect(s, p), isNull, reason: p);
      }
      for (final p in ['/login', '/signup', '/pending', '/splash', '/workspace']) {
        expect(authRedirect(s, p), '/home', reason: p);
      }
    });
  });

  group('SignUpRules', () {
    test('required fields', () {
      expect(SignUpRules.name(' '), isNotNull);
      expect(SignUpRules.name('Jo'), isNull);
      expect(SignUpRules.workspace('A'), isNotNull);
      expect(SignUpRules.workspace('Acme'), isNull);
    });

    test('email', () {
      for (final bad in ['', 'a', 'a@b', 'a b@c.co', '@c.co']) {
        expect(SignUpRules.email(bad), isNotNull, reason: bad);
      }
      expect(SignUpRules.email(' sam@acme.in '), isNull);
    });

    test('password is at least 10 characters and must match confirm', () {
      expect(SignUpRules.password('123456789'), contains('10'));
      expect(SignUpRules.password('1234567890'), isNull);
      expect(SignUpRules.confirm('Correct-Horse-9', 'Correct-Horse-8'), isNotNull);
      expect(SignUpRules.confirm('Correct-Horse-9', 'Correct-Horse-9'), isNull);
    });

    test('strength hint', () {
      expect(SignUpRules.strength('short'), 0);
      expect(SignUpRules.strength('aaaaaaaaaa'), 1);
      expect(SignUpRules.strength('Correct-Horse'), 2);
      expect(SignUpRules.strength('Correct-Horse-9'), 3);
    });
  });
}
