import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/config.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';

const contactEmail = 'realhubbmktg@gmail.com';

Future<void> openLink(BuildContext context, Uri uri) async {
  final external = uri.scheme.startsWith('http') ? LaunchMode.externalApplication : LaunchMode.platformDefault;
  if (!await launchUrl(uri, mode: external) && context.mounted) {
    showSnack(context, 'No app found to open this.', tone: Tone.danger);
  }
}

/// Legal text block: headings (h), paragraphs (p) and bullets (b).
sealed class _Block {
  const _Block(this.text);
  final String text;
}

class _H extends _Block {
  const _H(super.text);
}

class _P extends _Block {
  const _P(super.text);
}

class _B extends _Block {
  const _B(super.text);
}

class _LegalPage extends StatelessWidget {
  const _LegalPage({
    required this.title,
    required this.subtitle,
    required this.blocks,
    required this.webPath,
    this.footer,
  });
  final String title, subtitle, webPath;
  final List<_Block> blocks;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: ListView(
              padding: const EdgeInsets.all(Space.s4),
              children: [
                Text(subtitle, style: AppText.caption.copyWith(color: c.textTertiary)),
                const SizedBox(height: Space.s4),
                for (final b in blocks)
                  switch (b) {
                    _H() => Padding(
                      padding: const EdgeInsets.only(top: Space.s4, bottom: Space.s2),
                      child: Text(b.text, style: AppText.h3.copyWith(color: c.textPrimary)),
                    ),
                    _P() => Padding(
                      padding: const EdgeInsets.only(bottom: Space.s3),
                      child: Text(b.text, style: AppText.bodyL.copyWith(color: c.textSecondary)),
                    ),
                    _B() => Padding(
                      padding: const EdgeInsets.only(left: Space.s2, bottom: Space.s2),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('•  ', style: AppText.bodyL.copyWith(color: c.textSecondary)),
                          Expanded(
                            child: Text(b.text, style: AppText.bodyL.copyWith(color: c.textSecondary)),
                          ),
                        ],
                      ),
                    ),
                  },
                if (footer != null) ...[const SizedBox(height: Space.s4), footer!],
                const SizedBox(height: Space.s2),
                OutlinedButton.icon(
                  onPressed: () => openLink(context, Uri.parse('${AppConfig.apiBase}$webPath')),
                  icon: const Icon(LucideIcons.externalLink, size: 18),
                  label: const Text('Open web version'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Ported from src/app/privacy/page.tsx.
class PrivacyScreen extends StatelessWidget {
  const PrivacyScreen({super.key});

  @override
  Widget build(BuildContext context) => _LegalPage(
    title: 'Privacy policy',
    subtitle: 'Last updated: 18 July 2026',
    webPath: '/privacy',
    footer: TextButton.icon(
      onPressed: () => openLink(context, Uri(scheme: 'mailto', path: contactEmail)),
      icon: const Icon(LucideIcons.mail, size: 18),
      label: const Text(contactEmail),
    ),
    blocks: const [
      _P(
        'Realhubb Ventures ("Realhubb", "we", "us") operates the Realhubb marketing automation platform, available as a '
        'web application at realhubb.co.in and as an Android application (together, the "Service"). This Service is an '
        "internal business tool used by authorised Realhubb team members to manage WhatsApp messaging, Meta advertising "
        "accounts, and contact lists on behalf of Realhubb's clients and prospects. It is not available for public "
        'sign-up — access is restricted to individually authorised users.',
      ),
      _P('This policy explains what information the Service collects, why, and how it is handled.'),
      _H('1. Information we collect'),
      _H('1.1 Account information'),
      _P(
        'When an authorised user signs in, we collect their name and email address via Firebase Authentication (Google '
        'sign-in or email/password). Access is checked against an internal allow-list; unauthorised accounts are signed '
        'out immediately and no further data is processed for them.',
      ),
      _H('1.2 Contact and lead information'),
      _P(
        'The Service is used to manage contact lists (name, phone number, email, tags) uploaded by authorised users, '
        'typically from CSV/Excel exports of leads or customers. This data is provided by the user operating the '
        'Service, not collected directly from the individuals themselves by us.',
      ),
      _H('1.3 WhatsApp message content'),
      _P(
        'The Service integrates with the Meta WhatsApp Business Platform to send and receive WhatsApp messages on behalf '
        "of Realhubb's connected business phone number(s). This includes message text, sender/recipient phone numbers, "
        'message timestamps, and delivery/read status, which are stored so that the authorised user can view '
        'conversation history and manage replies.',
      ),
      _H('1.4 Meta advertising account data'),
      _P(
        'If an authorised user connects a Meta Ads account, we access ad account, campaign, and performance data via the '
        'Meta Graph API (through an OAuth connection the user explicitly authorises) to display analytics inside the '
        'Service.',
      ),
      _H('1.5 Device and push notification data'),
      _P(
        'To deliver notifications when a new WhatsApp reply arrives, the Service registers a device push token (via '
        "Firebase Cloud Messaging) for the authorised user's device or browser. No other device identifiers are "
        'collected.',
      ),
      _H('1.6 Uploaded media'),
      _P(
        'Images uploaded for use as WhatsApp message template headers are stored with our media hosting provider '
        '(Cloudinary) and referenced by URL from the Service.',
      ),
      _H('2. How we use information'),
      _B('To authenticate and authorise access to the Service'),
      _B('To send, receive, and display WhatsApp messages and conversation history'),
      _B('To manage contact lists and bulk messaging campaigns'),
      _B('To display Meta advertising performance analytics'),
      _B('To deliver push notifications for new WhatsApp replies'),
      _B('To diagnose and fix technical issues with message delivery'),
      _P('We do not sell any data collected through the Service, to anyone, for any purpose.'),
      _H('3. Third parties we share data with'),
      _P('Data passes through the following third-party infrastructure providers as part of normal Service operation:'),
      _B(
        'Meta Platforms, Inc. — WhatsApp Business Platform (message sending/receiving) and Meta Graph API (advertising '
        "analytics). Use of Meta's platforms is additionally governed by Meta's own terms and policies.",
      ),
      _B(
        'Google Firebase (Google LLC) — authentication, application database (Firestore), and push notification '
        'delivery (Cloud Messaging).',
      ),
      _B('Cloudinary — hosting for uploaded template header images.'),
      _B('Google Sheets / Google Apps Script — storage for uploaded contact lists.'),
      _P('We do not share data with any party for their own independent marketing or advertising purposes.'),
      _H('4. Data storage and security'),
      _P(
        'Data is transmitted over encrypted (HTTPS/TLS) connections. Application data is stored in Google Firebase '
        'infrastructure with access-controlled security rules restricting reads and writes to authorised, authenticated '
        'requests. Access to the Service itself requires authentication and is further restricted to an internal '
        'allow-list of authorised users.',
      ),
      _H('5. Data retention'),
      _P(
        'Conversation history, contact lists, and template data are retained for as long as the associated Realhubb '
        'account remains active, or until deletion is requested (see Section 7). Push notification tokens are '
        'automatically removed once they become invalid (e.g. after an app is uninstalled).',
      ),
      _H("6. Children's privacy"),
      _P(
        'The Service is a business tool intended for use by adult, authorised personnel only. It is not directed at, and '
        'we do not knowingly collect information from, children under 13.',
      ),
      _H('7. Your rights / requesting deletion'),
      _P(
        'Authorised users, or any individual whose contact information or message history is held within the Service, '
        'may request access to, correction of, or deletion of their data by contacting us at the address below. We will '
        'respond to verified requests within a reasonable time.',
      ),
      _H('8. Changes to this policy'),
      _P(
        'We may update this policy from time to time. Material changes will be reflected by updating the "Last updated" '
        'date above.',
      ),
      _H('9. Contact us'),
      _P('For any question about this policy or to make a data request, contact:'),
    ],
  );
}

/// Ported from src/app/data-deletion/page.tsx (Play User Data policy path).
class DataDeletionScreen extends StatelessWidget {
  const DataDeletionScreen({super.key, this.email});
  final String? email;

  @override
  Widget build(BuildContext context) => _LegalPage(
    title: 'Data deletion',
    subtitle: 'Applies to accounts and data associated with the Realhubb marketing automation platform (web and Android app).',
    webPath: '/data-deletion',
    footer: FilledButton.icon(
      onPressed: () => openLink(
        context,
        Uri(
          scheme: 'mailto',
          path: contactEmail,
          // Uri's queryParameters encodes spaces as '+', which some mail apps show literally.
          query:
              'subject=Data%20Deletion%20Request${email == null ? '' : '&body=${Uri.encodeComponent('Account email: $email\n')}'}',
        ),
      ),
      icon: const Icon(LucideIcons.mail, size: 18),
      label: const Text('Email deletion request'),
    ),
    blocks: const [
      _P(
        'If you are an authorised Realhubb user, or an individual whose contact information or WhatsApp message history '
        'is held within the Realhubb platform, you may request deletion of that data at any time.',
      ),
      _H('How to request deletion'),
      _P('Send an email to $contactEmail with the subject line "Data Deletion Request", including:'),
      _B('Your name and, if applicable, the email address associated with your Realhubb account'),
      _B(
        'The phone number(s) or contact record(s) you want removed, if requesting deletion of contact/message data '
        'rather than an account',
      ),
      _B('Whether you want your full account deleted, or specific data removed while keeping the account active'),
      _H('What gets deleted'),
      _B(
        'Account deletion: your Firebase authentication account, access authorisation, and any registered push '
        'notification tokens.',
      ),
      _B(
        'Contact/message data deletion: the specific contact record(s) and associated WhatsApp conversation history '
        'you identify.',
      ),
      _H('Timeline'),
      _P('We will process verified deletion requests within 30 days and confirm completion by email.'),
      _H('What is retained'),
      _P(
        'Some records may be retained where required for legal, accounting, or fraud-prevention purposes (for example, '
        'records of a completed broadcast campaign for billing reconciliation), for a limited period after which they '
        'are permanently deleted.',
      ),
    ],
  );
}
