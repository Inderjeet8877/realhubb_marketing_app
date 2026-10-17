import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';

class AuthState {
  const AuthState({this.email, this.devPreview = false});
  final String? email;
  final bool devPreview;
  bool get signedIn => email != null || devPreview;
}

/// Sign-in state. Firebase Auth (email/password + Google, then the
/// /api/auth/verify allow-list) is wired once google-services.json for
/// com.broadzen.app exists — until then only the debug-only dev preview works.
class AuthController extends Notifier<AuthState> {
  static const _devKey = 'dev_preview';

  @override
  AuthState build() => AuthState(devPreview: ref.read(prefsProvider).getBool(_devKey) ?? false);

  static const firebaseConfigured = false; // flips to true in M1 (Firebase)

  Future<void> signInWithEmail(String email, String password) async {
    throw StateError('Sign-in needs Firebase: add google-services.json for com.broadzen.app.');
  }

  Future<void> signInWithGoogle() async {
    throw StateError('Sign-in needs Firebase: add google-services.json for com.broadzen.app.');
  }

  /// Debug builds only — explore the app before Firebase is configured.
  void enterDevPreview() {
    ref.read(prefsProvider).setBool(_devKey, true);
    state = const AuthState(devPreview: true);
  }

  Future<void> signOut() async {
    await ref.read(prefsProvider).remove(_devKey);
    state = const AuthState();
  }
}

final authProvider = NotifierProvider<AuthController, AuthState>(AuthController.new);
