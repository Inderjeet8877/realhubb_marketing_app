/// Build-time config. Override with `--dart-define=API_BASE=https://...`.
/// Points at the current Next.js backend until the Postgres backend exists
/// (mobile/PLAN.md §2).
abstract final class AppConfig {
  static const apiBase = String.fromEnvironment('API_BASE', defaultValue: 'https://www.realhubb.co.in');
}
