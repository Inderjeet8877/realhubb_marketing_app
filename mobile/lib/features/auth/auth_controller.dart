import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';

/// `GET /api/auth/me`: the signed-in user and their workspace.
class Me {
  const Me({
    required this.id,
    required this.email,
    required this.name,
    required this.role,
    required this.isPlatformAdmin,
    this.workspaceName,
    this.workspaceStatus,
  });

  final String id, email, name, role;
  final bool isPlatformAdmin;
  final String? workspaceName, workspaceStatus;

  factory Me.fromJson(Map<String, dynamic> j) {
    final u = Map<String, dynamic>.from(j['user'] as Map);
    final w = j['workspace'] is Map ? Map<String, dynamic>.from(j['workspace'] as Map) : const <String, dynamic>{};
    return Me(
      id: '${u['id']}',
      email: '${u['email']}',
      name: '${u['name']}',
      role: '${u['role']}',
      isPlatformAdmin: u['isPlatformAdmin'] == true,
      workspaceName: w['name'] as String?,
      workspaceStatus: w['status'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    'user': {'id': id, 'email': email, 'name': name, 'role': role, 'isPlatformAdmin': isPlatformAdmin},
    'workspace': {'name': workspaceName, 'status': workspaceStatus},
  };
}

enum AuthStatus { loading, signedOut, signedIn }

class AuthState {
  const AuthState._(this.status, [this.me]);
  const AuthState.loading() : this._(AuthStatus.loading);
  const AuthState.signedOut() : this._(AuthStatus.signedOut);
  const AuthState.signedIn(Me me) : this._(AuthStatus.signedIn, me);

  final AuthStatus status;
  final Me? me;
  bool get signedIn => status == AuthStatus.signedIn;
  bool get isAdmin => me?.isPlatformAdmin ?? false;
}

/// Server answered with a known auth error (`pending`, `rejected`, `locked`, ...).
class AuthFailure implements Exception {
  const AuthFailure(this.message, [this.code]);
  final String message;
  final String? code;
  @override
  String toString() => message;
}

/// The session: tokens live in secure storage (via [ApiClient.store]); the
/// ApiClient refreshes them on 401 and calls back here when the session is gone.
class AuthController extends Notifier<AuthState> {
  static const _meKey = 'me';

  ApiClient get _api => ref.read(apiClientProvider);
  TokenStore get _store => ref.read(tokenStoreProvider);

  @override
  AuthState build() {
    _api.onSessionLost = () => state = const AuthState.signedOut();
    Future.microtask(restore);
    return const AuthState.loading();
  }

  /// App start: stored tokens → `GET /me` (the client refreshes once on 401).
  /// Offline → the cached profile, so a signed-in user isn't bounced to login.
  Future<void> restore() async {
    try {
      if (await _store.read(TokenKeys.refresh) == null) {
        state = const AuthState.signedOut();
        return;
      }
      await _loadMe();
    } on ApiException catch (e) {
      if (e.status == null) {
        final cached = await _store.read(_meKey);
        if (cached != null) {
          state = AuthState.signedIn(Me.fromJson(jsonDecode(cached) as Map<String, dynamic>));
          return;
        }
      } else {
        await _store.clear();
      }
      state = const AuthState.signedOut();
    } catch (_) {
      state = const AuthState.signedOut();
    }
  }

  Future<void> _loadMe() async {
    final me = Me.fromJson(Map<String, dynamic>.from(await _api.get('/api/auth/me') as Map));
    await _store.write(_meKey, jsonEncode(me.toJson()));
    state = AuthState.signedIn(me);
  }

  /// Runs an auth call and turns server errors into [AuthFailure] (keeps the code).
  Future<T> _auth<T>(Future<T> Function() call) async {
    try {
      return await call();
    } on ApiException catch (e) {
      throw AuthFailure(e.message, e.code);
    }
  }

  Future<void> signInWithEmail(String email, String password) => _auth(() async {
    final r = await _api.post('/api/auth/login', body: {'email': email, 'password': password});
    await _api.saveTokens(r);
    await _loadMe();
  });

  /// Creates a pending account request (202). Nobody is signed in until an admin approves.
  Future<void> signUp({
    required String name,
    required String email,
    required String workspace,
    required String password,
  }) => _auth(
    () => _api.post(
      '/api/auth/signup',
      body: {'name': name, 'email': email, 'workspace': workspace, 'password': password},
    ),
  );

  /// Needs a Google Cloud OAuth client + `google_sign_in` (B4 follow-up); the
  /// server also answers 503 `google_disabled` until GOOGLE_CLIENT_IDS is set.
  Future<void> signInWithGoogle() async =>
      throw const AuthFailure("Google sign-in isn't set up yet. Use your email and password.", 'google_disabled');

  Future<void> changePassword(String current, String next) => _auth(() async {
    final r = await _api.post('/api/auth/change-password', body: {'currentPassword': current, 'newPassword': next});
    await _api.saveTokens(r); // every other device was signed out; this one gets a fresh pair
  });

  Future<void> signOut() async {
    final rt = await _store.read(TokenKeys.refresh);
    if (rt != null) {
      try {
        await _api.post('/api/auth/logout', body: {'refreshToken': rt});
      } catch (_) {
        // Best effort: the local session ends either way.
      }
    }
    await _store.clear();
    state = const AuthState.signedOut();
  }
}

final authProvider = NotifierProvider<AuthController, AuthState>(AuthController.new);
