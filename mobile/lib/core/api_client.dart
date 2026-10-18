import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'config.dart';

/// Error with the server's own message (routes return `{ error: "...", code: "..." }`).
class ApiException implements Exception {
  ApiException(this.message, [this.status, this.code]);
  final String message;
  final int? status;
  final String? code;
  @override
  String toString() => message;
}

/// Small key-value store for the session (tokens + cached /me). Never SharedPreferences.
abstract interface class TokenStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> clear();
}

/// Device secure storage (Android Keystore-backed), with an in-memory cache so
/// every request doesn't hit the platform channel.
class SecureTokenStore implements TokenStore {
  final _storage = const FlutterSecureStorage();
  final _cache = <String, String?>{};

  @override
  Future<String?> read(String key) async =>
      _cache.containsKey(key) ? _cache[key] : _cache[key] = await _storage.read(key: key);

  @override
  Future<void> write(String key, String value) async {
    _cache[key] = value;
    await _storage.write(key: key, value: value);
  }

  @override
  Future<void> clear() async {
    _cache.clear();
    await _storage.deleteAll();
  }
}

abstract final class TokenKeys {
  static const access = 'access_token', refresh = 'refresh_token';
}

/// Auth routes never trigger the refresh-and-retry path (they *are* the session).
const _noRetryPaths = {
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/google',
  '/api/auth/refresh',
  '/api/auth/logout',
};

class ApiClient {
  ApiClient({this.store, HttpClientAdapter? adapter, String? baseUrl})
    : _dio = Dio(
        BaseOptions(
          baseUrl: baseUrl ?? AppConfig.apiBase,
          connectTimeout: const Duration(seconds: 20),
          receiveTimeout: const Duration(seconds: 60),
          // Auth routes return tokens in the JSON body for the app (secure storage), not cookies.
          headers: {'X-Client': 'mobile'},
        ),
      ) {
    if (adapter != null) _dio.httpClientAdapter = adapter;
    _dio.interceptors.add(InterceptorsWrapper(onRequest: _onRequest, onError: _onError));
  }

  final Dio _dio;
  final TokenStore? store;

  /// Called when the refresh token is rejected: the session is over (sign out).
  void Function()? onSessionLost;

  Future<String?>? _refreshing;

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) =>
      _send(() => _dio.get(path, queryParameters: query));
  Future<dynamic> post(String path, {Object? body, Map<String, dynamic>? query}) =>
      _send(() => _dio.post(path, data: body, queryParameters: query));
  Future<dynamic> put(String path, {Object? body}) => _send(() => _dio.put(path, data: body));
  Future<dynamic> patch(String path, {Object? body}) => _send(() => _dio.patch(path, data: body));
  Future<dynamic> delete(String path, {Object? body, Map<String, dynamic>? query}) =>
      _send(() => _dio.delete(path, data: body, queryParameters: query));

  Future<void> _onRequest(RequestOptions o, RequestInterceptorHandler h) async {
    final t = await store?.read(TokenKeys.access);
    if (t != null) o.headers['Authorization'] = 'Bearer $t';
    o.extra['token'] = t;
    h.next(o);
  }

  /// 401 on a normal call → refresh once (shared by every concurrent caller) and retry once.
  Future<void> _onError(DioException e, ErrorInterceptorHandler h) async {
    final o = e.requestOptions;
    if (e.response?.statusCode != 401 ||
        store == null ||
        o.extra['retried'] == true ||
        _noRetryPaths.contains(o.path) ||
        o.extra['token'] == null) {
      return h.next(e);
    }
    final String? fresh;
    try {
      fresh = await _freshAccess(o.extra['token'] as String);
    } catch (_) {
      return h.next(e); // network trouble while refreshing: keep the session, surface the original error
    }
    if (fresh == null) {
      onSessionLost?.call();
      return h.next(e);
    }
    o.extra['retried'] = true;
    o.headers['Authorization'] = 'Bearer $fresh';
    try {
      h.resolve(await _dio.fetch(o));
    } on DioException catch (e2) {
      h.next(e2);
    }
  }

  /// A new access token, or null when the session is gone. If another request
  /// already refreshed since [used] was sent, reuse that token instead.
  Future<String?> _freshAccess(String used) async {
    final current = await store!.read(TokenKeys.access);
    if (current != null && current != used) return current;
    final f = _refreshing ??= _refresh();
    try {
      return await f;
    } finally {
      if (identical(_refreshing, f)) _refreshing = null;
    }
  }

  Future<String?> _refresh() async {
    final rt = await store!.read(TokenKeys.refresh);
    if (rt == null) return null;
    try {
      final r = await _dio.post('/api/auth/refresh', data: {'refreshToken': rt});
      await saveTokens(r.data);
      return r.data['accessToken'] as String;
    } on DioException catch (e) {
      final s = e.response?.statusCode;
      if (s == 401 || s == 403) {
        // Rotation: a rejected or replayed refresh token means the session is over.
        await store!.clear();
        return null;
      }
      rethrow;
    }
  }

  /// Stores the `{accessToken, refreshToken}` pair from an auth response.
  Future<void> saveTokens(Object? data) async {
    final d = data as Map;
    await store!.write(TokenKeys.access, d['accessToken'] as String);
    await store!.write(TokenKeys.refresh, d['refreshToken'] as String);
  }

  Future<dynamic> _send(Future<Response> Function() call) async {
    try {
      return (await call()).data;
    } on DioException catch (e) {
      final data = e.response?.data;
      final status = e.response?.statusCode;
      final msg = data is Map && data['error'] != null
          ? '${data['error']}'
          : status == 429
          ? 'Too many attempts. Please wait a minute and try again.'
          : e.type == DioExceptionType.connectionError || e.type == DioExceptionType.connectionTimeout
          ? 'No connection. Check your internet and try again.'
          : 'Request failed (${status ?? e.type.name})';
      throw ApiException(msg, status, data is Map ? data['code'] as String? : null);
    }
  }
}

final tokenStoreProvider = Provider<TokenStore>((ref) => SecureTokenStore());

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient(store: ref.watch(tokenStoreProvider)));
