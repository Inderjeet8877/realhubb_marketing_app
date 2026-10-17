import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Loaded once in main() and injected via override.
final prefsProvider = Provider<SharedPreferences>((ref) => throw UnimplementedError('override in main'));

/// System / Light / Dark — set in Settings → Appearance, persisted.
class ThemeModeController extends Notifier<ThemeMode> {
  static const _key = 'theme_mode';

  @override
  ThemeMode build() => ThemeMode.values.byName(ref.read(prefsProvider).getString(_key) ?? ThemeMode.system.name);

  void set(ThemeMode mode) {
    state = mode;
    ref.read(prefsProvider).setString(_key, mode.name);
  }
}

final themeModeProvider = NotifierProvider<ThemeModeController, ThemeMode>(ThemeModeController.new);

/// Which Meta ad account the screens show: 'all' or '1' | '2' | '3'
/// (backend slots in meta_credentials). Persisted like the web's localStorage.
class AccountController extends Notifier<String> {
  static const _key = 'meta_account';

  @override
  String build() => ref.read(prefsProvider).getString(_key) ?? 'all';

  void set(String account) {
    state = account;
    ref.read(prefsProvider).setString(_key, account);
  }
}

final accountProvider = NotifierProvider<AccountController, String>(AccountController.new);
