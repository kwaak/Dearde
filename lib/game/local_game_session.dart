import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:game_core/game_core.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'game_session.dart';

/// Single-player game simulated on the device: a real-time tick loop with
/// offline catch-up, persisted to local storage.
class LocalGameSession extends GameSession {
  LocalGameSession({this.tickDuration = const Duration(seconds: 5)});

  static const String saveKey = 'dearde_save_v1';

  /// Real time per game tick while the app is running.
  final Duration tickDuration;

  /// Cap on how many ticks are simulated when returning after time away.
  static const int maxOfflineTicks = 2000;

  GameState? _state;
  TickEngine? _engine;
  Timer? _timer;
  int _ticksSinceSave = 0;

  @override
  GameState? get state => _state;

  @override
  bool get isRemote => false;

  /// Loads a previous save if one exists.
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

  static Future<bool> hasSave() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.containsKey(saveKey);
  }

  void newGame({required String playerName, int? seed}) {
    final s = GalaxyGenerator.generate(
      seed: seed ?? DateTime.now().millisecondsSinceEpoch,
      playerName:
          playerName.trim().isEmpty ? 'Terran Empire' : playerName.trim(),
    );
    s.lastTickWallClockMs = DateTime.now().millisecondsSinceEpoch;
    _attach(s);
    unawaited(persist());
    notifyListeners();
  }

  Future<void> deleteSave() async {
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
      unawaited(persist());
    }
    notifyListeners();
  }

  @override
  Future<void> persist() async {
    final s = _state;
    if (s == null) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(saveKey, jsonEncode(s.toJson()));
  }

  @override
  Future<String?> build(Planet planet, BuildingType type) async {
    final error = GameActions.build(_state!, player, planet, type);
    if (error == null) {
      unawaited(persist());
      notifyListeners();
    }
    return error;
  }

  @override
  Future<String?> trainShips(Planet planet, ShipType type, int count) async {
    final error = GameActions.trainShips(_state!, player, planet, type, count);
    if (error == null) {
      unawaited(persist());
      notifyListeners();
    }
    return error;
  }

  @override
  Future<String?> launchMission({
    required Planet origin,
    required Planet target,
    required Fleet fleet,
    required MissionKind kind,
  }) async {
    final error = GameActions.launchMission(
      _state!,
      player,
      origin: origin,
      target: target,
      fleet: fleet,
      kind: kind,
    );
    if (error == null) {
      unawaited(persist());
      notifyListeners();
    }
    return error;
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}
