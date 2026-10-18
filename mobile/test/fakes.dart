import 'dart:convert';
import 'dart:typed_data';

import 'package:broadzen/core/api_client.dart';
import 'package:dio/dio.dart';

class MemoryTokenStore implements TokenStore {
  MemoryTokenStore([Map<String, String>? initial]) : data = {...?initial};
  final Map<String, String> data;

  @override
  Future<String?> read(String key) async => data[key];
  @override
  Future<void> write(String key, String value) async => data[key] = value;
  @override
  Future<void> clear() async => data.clear();
}

/// Dio adapter that answers from a handler: (request) → (status, json body).
class FakeAdapter implements HttpClientAdapter {
  FakeAdapter(this.handler);
  final Future<(int, Object?)> Function(RequestOptions o) handler;
  final calls = <String>[];

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    calls.add(o.path);
    final (status, body) = await handler(o);
    return ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}
