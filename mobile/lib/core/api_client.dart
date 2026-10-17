import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'config.dart';

/// Error with the server's own message (routes return `{ error: "..." }`).
class ApiException implements Exception {
  ApiException(this.message, [this.status]);
  final String message;
  final int? status;
  @override
  String toString() => message;
}

/// Supplies the Bearer token. Set by the auth layer once Firebase is wired;
/// returns null until then (most current routes don't check it yet).
typedef TokenSource = Future<String?> Function();

class ApiClient {
  ApiClient({TokenSource? token})
    : _dio = Dio(
        BaseOptions(
          baseUrl: AppConfig.apiBase,
          connectTimeout: const Duration(seconds: 20),
          receiveTimeout: const Duration(seconds: 60),
        ),
      ) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (o, h) async {
          final t = await token?.call();
          if (t != null) o.headers['Authorization'] = 'Bearer $t';
          h.next(o);
        },
      ),
    );
  }

  final Dio _dio;

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) =>
      _send(() => _dio.get(path, queryParameters: query));
  Future<dynamic> post(String path, {Object? body, Map<String, dynamic>? query}) =>
      _send(() => _dio.post(path, data: body, queryParameters: query));
  Future<dynamic> put(String path, {Object? body}) => _send(() => _dio.put(path, data: body));
  Future<dynamic> delete(String path, {Object? body, Map<String, dynamic>? query}) =>
      _send(() => _dio.delete(path, data: body, queryParameters: query));

  Future<dynamic> _send(Future<Response> Function() call) async {
    try {
      return (await call()).data;
    } on DioException catch (e) {
      final data = e.response?.data;
      final msg = data is Map && data['error'] != null
          ? '${data['error']}'
          : e.type == DioExceptionType.connectionError || e.type == DioExceptionType.connectionTimeout
          ? 'No connection. Check your internet and try again.'
          : 'Request failed (${e.response?.statusCode ?? e.type.name})';
      throw ApiException(msg, e.response?.statusCode);
    }
  }
}

/// Overridden in main() once auth provides a token source.
final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());
