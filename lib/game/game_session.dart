import 'package:flutter/foundation.dart';
import 'package:game_core/game_core.dart';

/// A running game the UI can display and act on — either simulated locally
/// on the device or mirrored from a multiplayer server.
abstract class GameSession extends ChangeNotifier {
  GameState? get state;

  bool get hasGame => state != null;

  /// The empire this session plays as.
  Empire get player => state!.player;

  bool get isRemote;

  /// Last connection problem, for remote sessions; null when healthy.
  String? get connectionError => null;

  /// True once one empire owns [GameRules.victoryShare] of the galaxy.
  Empire? get victor {
    final s = state;
    if (s == null) return null;
    final needed = (s.planets.length * GameRules.victoryShare).ceil();
    for (final e in s.empires) {
      if (!e.defeated && s.planetsOf(e.id).length >= needed) return e;
    }
    return null;
  }

  bool get playerDefeated => state?.player.defeated ?? false;

  int travelTicksBetween(Planet a, Planet b) => TickEngine.travelTicks(a, b);

  Future<String?> build(Planet planet, BuildingType type);

  Future<String?> trainShips(Planet planet, ShipType type, int count);

  Future<String?> launchMission({
    required Planet origin,
    required Planet target,
    required Fleet fleet,
    required MissionKind kind,
  });

  /// Persist state if applicable (called when the app is backgrounded).
  Future<void> persist() async {}
}
