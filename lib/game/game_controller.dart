import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../engine/galaxy_generator.dart';
import '../engine/rules.dart';
import '../engine/tick_engine.dart';
import '../models/models.dart';

/// Drives the live game: a real-time tick loop with offline catch-up,
/// exposes player actions, and persists the world to local storage.
class GameController extends ChangeNotifier {
  GameController({this.tickDuration = const Duration(seconds: 5)});

  static const String saveKey = 'dearde_save_v1';

  /// Real time per game tick while the app is running.
  final Duration tickDuration;

  /// Cap on how many ticks are simulated when returning after time away.
  static const int maxOfflineTicks = 2000;

  GameState? _state;
  TickEngine? _engine;
  Timer? _timer;
  int _ticksSinceSave = 0;

  GameState? get state => _state;
  bool get hasGame => _state != null;
  Empire get player => _state!.player;

  /// True once one empire owns [GameRules.victoryShare] of the galaxy.
  Empire? get victor {
    final s = _state;
    if (s == null) return null;
    final needed = (s.planets.length * GameRules.victoryShare).ceil();
    for (final e in s.empires) {
      if (!e.defeated && s.planetsOf(e.id).length >= needed) return e;
    }
    return null;
  }

  bool get playerDefeated => _state?.player.defeated ?? false;

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(saveKey);
    if (raw != null) {
      try {
        _attach(GameState.fromJson(jsonDecode(raw) as Map<String, dynamic>));
        _catchUp();
      } catch (e) {
        debugPrint('Save corrupted, starting fresh: $e');
        _state = null;
      }
    }
    notifyListeners();
  }

  void newGame({required String playerName, int? seed}) {
    final s = GalaxyGenerator.generate(
      seed: seed ?? DateTime.now().millisecondsSinceEpoch,
      playerName: playerName.trim().isEmpty ? 'Terran Empire' : playerName.trim(),
    );
    s.lastTickWallClockMs = DateTime.now().millisecondsSinceEpoch;
    _attach(s);
    unawaited(save());
    notifyListeners();
  }

  Future<void> abandonGame() async {
    _timer?.cancel();
    _timer = null;
    _state = null;
    _engine = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(saveKey);
    notifyListeners();
  }

  void _attach(GameState s) {
    _state = s;
    _engine = TickEngine(seed: s.seed ^ s.tick);
    _timer?.cancel();
    _timer = Timer.periodic(tickDuration, (_) => _onTimer());
  }

  /// Simulate the ticks that elapsed while the app was closed.
  void _catchUp() {
    final s = _state;
    final engine = _engine;
    if (s == null || engine == null || s.lastTickWallClockMs == 0) return;
    final now = DateTime.now().millisecondsSinceEpoch;
    final elapsed = now - s.lastTickWallClockMs;
    var due = elapsed ~/ tickDuration.inMilliseconds;
    if (due <= 0) return;
    if (due > maxOfflineTicks) due = maxOfflineTicks;
    for (var i = 0; i < due; i++) {
      engine.advance(s);
    }
    s.lastTickWallClockMs = now;
    s.log('While you were away, $due ticks passed.');
  }

  void _onTimer() {
    final s = _state;
    final engine = _engine;
    if (s == null || engine == null) return;
    engine.advance(s);
    s.lastTickWallClockMs = DateTime.now().millisecondsSinceEpoch;
    _ticksSinceSave++;
    if (_ticksSinceSave >= 6) {
      _ticksSinceSave = 0;
      unawaited(save());
    }
    notifyListeners();
  }

  /// Manually advance one tick (also used by tests and a debug button).
  void debugTick() {
    _onTimer();
  }

  Future<void> save() async {
    final s = _state;
    if (s == null) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(saveKey, jsonEncode(s.toJson()));
  }

  // ---------------------------------------------------------------------
  // Player actions
  // ---------------------------------------------------------------------

  String? build(Planet planet, BuildingType type) {
    final s = _state!;
    if (planet.ownerId != s.player.id) return 'Not your planet.';
    if (planet.freeSlots <= 0) return 'No free building slots left.';
    if (!GameRules.canAfford(s.player, type)) {
      return 'Not enough credits or ore.';
    }
    final cost = GameRules.buildingCosts[type]!;
    s.player.credits -= cost.credits;
    s.player.ore -= cost.ore;
    planet.buildings[type] = planet.buildingCount(type) + 1;
    unawaited(save());
    notifyListeners();
    return null;
  }

  String? trainShips(Planet planet, ShipType type, int count) {
    final s = _state!;
    if (planet.ownerId != s.player.id) return 'Not your planet.';
    if (count <= 0) return 'Nothing to build.';
    if (!GameRules.canAffordShip(s.player, type, count)) {
      return 'Not enough credits or ore.';
    }
    s.player.credits -= type.cost * count;
    s.player.ore -= type.oreCost * count;
    planet.garrison.add(type, count);
    unawaited(save());
    notifyListeners();
    return null;
  }

  String? launchMission({
    required Planet origin,
    required Planet target,
    required Fleet fleet,
    required MissionKind kind,
  }) {
    final s = _state!;
    if (origin.ownerId != s.player.id) return 'Origin is not your planet.';
    if (fleet.isEmpty) return 'Select at least one ship.';
    if (!origin.garrison.contains(fleet)) {
      return 'The garrison does not have those ships.';
    }
    if (kind == MissionKind.attack && target.ownerId == s.player.id) {
      return 'You cannot attack your own planet.';
    }
    if (kind == MissionKind.transfer && target.ownerId != s.player.id) {
      return 'You can only transfer between your own planets.';
    }
    if (kind == MissionKind.attack &&
        fleet.count(ShipType.transport) == 0) {
      return 'Attacks need at least one Transport to occupy the planet.';
    }

    origin.garrison.subtract(fleet);
    final travel = _engine!.travelTicks(origin, target);
    s.missions.add(Mission(
      id: s.nextMissionId++,
      empireId: s.player.id,
      kind: kind,
      originPlanetId: origin.id,
      targetPlanetId: target.id,
      fleet: fleet,
      arrivalTick: s.tick + travel,
    ));
    s.log(kind == MissionKind.attack
        ? 'Attack fleet launched from ${origin.name} to ${target.name}, '
            'arriving in $travel ticks.'
        : 'Transfer launched from ${origin.name} to ${target.name}, '
            'arriving in $travel ticks.');
    unawaited(save());
    notifyListeners();
    return null;
  }

  int travelTicksBetween(Planet a, Planet b) => _engine!.travelTicks(a, b);

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}
