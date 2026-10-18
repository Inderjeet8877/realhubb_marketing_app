import 'dart:convert';

import 'package:broadzen/core/api_client.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

void main() {
  /// Server where only `good` is a valid access token and `r1` the valid refresh token.
  (ApiClient, FakeAdapter, MemoryTokenStore) setup({bool refreshOk = true, bool alwaysExpired = false}) {
    final store = MemoryTokenStore({TokenKeys.access: 'stale', TokenKeys.refresh: 'r1'});
    late FakeAdapter adapter;
    adapter = FakeAdapter((o) async {
      if (o.path == '/api/auth/refresh') {
        await Future<void>.delayed(const Duration(milliseconds: 20)); // let concurrent 401s pile up
        final rt = (o.data is String ? jsonDecode(o.data as String) : o.data)['refreshToken'];
        if (!refreshOk || rt != 'r1') return (401, {'error': 'Your session has expired.', 'code': 'session_expired'});
        return (200, {'user': {}, 'accessToken': 'good', 'refreshToken': 'r2'});
      }
      expect(o.headers['X-Client'], 'mobile');
      if (!alwaysExpired && o.headers['Authorization'] == 'Bearer good') return (200, {'ok': o.path});
      return (401, {'error': 'Your session has expired.', 'code': 'session_expired'});
    });
    return (ApiClient(store: store, adapter: adapter, baseUrl: 'http://test'), adapter, store);
  }

  test('concurrent 401s share one refresh, then every request is retried', () async {
    final (api, adapter, store) = setup();
    final results = await Future.wait([api.get('/api/a'), api.get('/api/b'), api.get('/api/c')]);
    expect(results.map((r) => r['ok']), ['/api/a', '/api/b', '/api/c']);
    expect(adapter.calls.where((p) => p == '/api/auth/refresh').length, 1);
    expect(store.data[TokenKeys.access], 'good');
    expect(store.data[TokenKeys.refresh], 'r2', reason: 'rotated refresh token is stored');
  });

  test('a request sent with a token that was already refreshed retries without another refresh', () async {
    final (api, adapter, store) = setup();
    await api.get('/api/a'); // refresh #1
    store.data[TokenKeys.access] = 'good';
    adapter.calls.clear();
    final r = await api.get('/api/b');
    expect(r['ok'], '/api/b');
    expect(adapter.calls, ['/api/b']);
  });

  test('rejected refresh → session lost, tokens cleared, original 401 surfaces', () async {
    final (api, _, store) = setup(refreshOk: false);
    var lost = 0;
    api.onSessionLost = () => lost++;
    await expectLater(
      api.get('/api/a'),
      throwsA(
        isA<ApiException>().having((e) => e.status, 'status', 401).having((e) => e.code, 'code', 'session_expired'),
      ),
    );
    expect(lost, 1);
    expect(store.data, isEmpty);
  });

  test('retries only once: a second 401 after refreshing is returned, not looped', () async {
    final (api, adapter, _) = setup(alwaysExpired: true);
    await expectLater(api.get('/api/a'), throwsA(isA<ApiException>()));
    expect(adapter.calls, ['/api/a', '/api/auth/refresh', '/api/a']);
  });

  test('auth routes never trigger a refresh', () async {
    final (api, adapter, _) = setup();
    await expectLater(api.post('/api/auth/login', body: {}), throwsA(isA<ApiException>()));
    expect(adapter.calls, ['/api/auth/login']);
  });
}
