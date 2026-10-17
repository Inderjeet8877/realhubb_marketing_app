import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/auth_controller.dart';
import '../features/auth/login_screen.dart';
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

/// Routes: /login outside the shell; five tab branches inside it.
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
    redirect: (context, state) {
      final signedIn = ref.read(authProvider).signedIn;
      final atLogin = state.matchedLocation == '/login';
      if (!signedIn) return atLogin ? null : '/login';
      return atLogin ? '/home' : null;
    },
    routes: [
      page('/login', const LoginScreen()),
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
