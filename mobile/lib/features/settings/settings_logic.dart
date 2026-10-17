import 'package:intl/intl.dart';

import '../../core/format.dart';
import '../../widgets/ui.dart';

/// One Meta account slot from GET /api/meta/status.
class MetaSlot {
  const MetaSlot({required this.slot, this.connected = false, this.label, this.daysUntilExpiry});

  factory MetaSlot.fromJson(Map<String, dynamic> j) => MetaSlot(
    slot: '${j['slot']}',
    connected: j['connected'] == true,
    label: j['label'] as String?,
    daysUntilExpiry: (j['daysUntilExpiry'] as num?)?.toInt(),
  );

  final String slot;
  final bool connected;
  final String? label;
  final int? daysUntilExpiry;

  /// DESIGN_PLAN §5.4 Connection: Connected → success · Expiring (≤7d) → warning · Not connected → neutral.
  (String, Tone) get status {
    if (!connected) return ('Not connected', Tone.neutral);
    final d = daysUntilExpiry;
    if (d != null && d <= 7) return (d < 0 ? 'Expired' : 'Expiring soon', Tone.warning);
    return ('Connected', Tone.success);
  }

  String? get expiryText {
    final d = daysUntilExpiry;
    if (!connected || d == null) return null;
    return d < 0 ? 'expired ${-d}d ago' : 'expires in ${d}d';
  }
}

/// One device from GET /api/notifications/register.
class Device {
  const Device({
    required this.token,
    required this.platform,
    required this.label,
    this.osVersion,
    this.registeredAt,
    this.updatedAt,
  });

  factory Device.fromJson(Map<String, dynamic> j) => Device(
    token: '${j['token']}',
    platform: '${j['platform'] ?? 'unknown'}',
    label: '${j['label'] ?? 'Unknown device'}',
    osVersion: j['osVersion'] as String?,
    registeredAt: parseDate(j['registeredAt']),
    updatedAt: parseDate(j['updatedAt']),
  );

  final String token, platform, label;
  final String? osVersion;
  final DateTime? registeredAt, updatedAt;

  bool get isWeb => platform == 'web';

  /// "Android 14", "Web", "iOS 17.2".
  String get platformLine {
    final p = switch (platform) {
      'android' => 'Android',
      'ios' => 'iOS',
      'web' => 'Web',
      _ => platform.isEmpty ? 'Unknown' : platform[0].toUpperCase() + platform.substring(1),
    };
    return osVersion == null || osVersion!.isEmpty ? p : '$p $osVersion';
  }

  String lastActive({DateTime? now}) => 'Last active ${updatedAt == null ? 'unknown' : timeAgo(updatedAt, now: now)}';

  String get installed => registeredAt == null
      ? 'Installed before device tracking was added'
      : 'Installed ${DateFormat('d MMM yyyy').format(registeredAt!.toLocal())}';
}
