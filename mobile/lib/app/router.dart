import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/admin/admin_screen.dart';
import '../features/auth/auth_controller.dart';
import '../features/auth/auth_pages.dart';
import '../features/auth/login_screen.dart';
import '../features/auth/signup_screen.dart';
import '../features/broadcasts/broadcasts_screen.dart';
import '../features/campaigns/campaigns_screen.dart';
import '../features/contacts/contacts_screen.dart';
import '../features/dashboard/dashboard_screen.dart';
import '../features/enquiries/enquiries_screen.dart';
import '../features/inbox/inbox_screen.dart';
import '../features/leads/leads_screen.dart';
import '../features/more/more_screen.dart';
import '../features/rcs/rcs_screen.dart';
import '../features/send/send_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/shell/app_shell.dart';
import '../features/templates/templates_screen.dart';
import '../features/workspace/workspace_screen.dart';

const _public = {'/login', '/signup', '/pending'};

/// Who may be where:
/// - restoring the session → /splash only (no login flash for signed-in users)
/// - signed out → /login, /signup, /pending
/// - signed-in normal user → /workspace only (the legacy screens show shared Realhubb data)
/// - signed-in platform admin → the shell (incl. /more/admin), never the auth pages or /workspace
String? authRedirect(AuthState auth, String location) {
  switch (auth.status) {
    case AuthStatus.loading:
      return location == '/splash' ? null : '/splash';
    case AuthStatus.signedOut:
      return _public.contains(location) ? null : '/login';
    case AuthStatus.signedIn when !auth.isAdmin:
      return location == '/workspace' ? null : '/workspace';
    case AuthStatus.signedIn:
      return _public.contains(location) || location == '/splash' || location == '/workspace' ? '/home' : null;
  }
}

/// Routes: auth pages + /workspace outside the shell; five tab branches inside it.
/// Each feature handles its own sub-pages with Navigator.push, so this file
/// only lists entry points.
final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier(0);
  ref.listen(authProvider, (_, _) => refresh.value++);
  ref.onDispose(refresh.dispose);

  GoRoute page(String path, Widget screen, [List<RouteBase> routes = const []]) =>
      GoRoute(path: path, builder: (_, _) => screen, routes: routes);

  return GoRouter(
    initialLocation: '/home',
    refreshListenable: refresh,
    redirect: (context, state) => authRedirect(ref.read(authProvider), state.matchedLocation),
    routes: [
      page('/splash', const SplashScreen()),
      page('/login', const LoginScreen()),
      page('/signup', const SignUpScreen()),
      GoRoute(
        path: '/pending',
        builder: (_, s) => PendingScreen(message: s.extra as String?),
      ),
      page('/workspace', const WorkspaceScreen()),
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => AppShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [page('/home', const DashboardScreen())]),
          StatefulShellBranch(routes: [page('/inbox', const InboxScreen())]),
          StatefulShellBranch(routes: [page('/leads', const LeadsScreen())]),
          StatefulShellBranch(routes: [page('/contacts', const ContactsScreen())]),
          StatefulShellBranch(
            routes: [
              page('/more', const MoreScreen(), [
                page('admin', const AdminHubScreen()),
                page('campaigns', const CampaignsScreen()),
                page('send', const SendScreen()),
                page('broadcasts', const BroadcastsScreen()),
                page('templates', const TemplatesScreen()),
                page('rcs', const RcsScreen()),
                page('enquiries', const EnquiriesScreen()),
                page('settings', const SettingsScreen()),
              ]),
            ],
          ),
        ],
      ),
    ],
  );
});
