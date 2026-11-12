# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

Shared product truth (users, purpose, positioning, brand, evidence, principles, accessibility) lives in the root [../PRODUCT.md](../PRODUCT.md). This file records only what is specific to the Flutter app.

## Operating Context
- **Who and when:** the main surface for the busy owner or agency user. They reply in the inbox, send broadcasts and check today's leads, one-handed, between calls and site visits, often on mid-range Android phones and patchy mobile data.
- **Platform admin:** approves account requests from the app's Admin section.

## Capabilities and Constraints
- **Stack:** Flutter (Material 3), Android first, app ID `com.broadzen.app`. Phone navigation uses a bottom navigation bar; tablets use a navigation rail.
- **Supporting tech:** tokens in `lib/theme/tokens.dart` (light and dark). Sessions are stored in secure storage. The app talks to the same API as the web.
- **Required:** System / Light / Dark appearance, the reduce-motion setting respected, 48dp tap targets, and system text scaling.
