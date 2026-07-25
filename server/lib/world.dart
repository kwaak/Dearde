import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:game_core/game_core.dart';

/// A registered player account: an auth token bound to an empire.
class PlayerAccount {
  PlayerAccount({required this.token, required this.empireId});

  final String token;
  final int empireId;

  Map<String, dynamic> toJson() => {'token': token, 'empireId': empireId};

  static PlayerAccount fromJson(Map<String, dynamic> json) => PlayerAccount(
        token: json['token'] as String,
        empireId: (json['empireId'] as num).toInt(),
      );
}

/// The server's world: one shared galaxy plus player accounts, persisted as
/// a JSON file so a container restart (or free-tier sleep) loses nothing.
class World {
  World({required this.state, required this.players, required this.filePath}) {
    engine = TickEngine(seed: state.seed ^ state.tick);
  }

  final GameState state;
  final List<PlayerAccount> players;
  final String filePath;
  late final TickEngine engine;

  /// Ticks simulated at boot to cover downtime, mirroring the app's
  /// offline catch-up cap.
  static const int maxCatchUpTicks = 2000;

  factory World.load({required String filePath, required int seed}) {
    final file = File(filePath);
    if (file.existsSync()) {
      final json = jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
      return World(
        state: GameState.fromJson(json['state'] as Map<String, dynamic>),
        players: (json['players'] as List)
            .map((p) => PlayerAccount.fromJson(p as Map<String, dynamic>))
            .toList(),
        filePath: filePath,
      );
    }
    final state = GalaxyGenerator.generateEmpty(seed: seed, neutralCount: 48);
    state.log('A new galaxy coalesces. Who will claim it?', important: true);
    return World(state: state, players: [], filePath: filePath);
  }

  void save() {
    final file = File(filePath);
    file.parent.createSync(recursive: true);
    final tmp = File('$filePath.tmp');
    tmp.writeAsStringSync(jsonEncode({
      'state': state.toJson(),
      'players': players.map((p) => p.toJson()).toList(),
    }));
    tmp.renameSync(filePath);
  }

  void tick() {
    engine.advance(state);
    state.lastTickWallClockMs = DateTime.now().millisecondsSinceEpoch;
  }

  /// Simulates ticks missed while the server was down.
  int catchUp(Duration tickDuration) {
    if (state.lastTickWallClockMs == 0) {
      state.lastTickWallClockMs = DateTime.now().millisecondsSinceEpoch;
      return 0;
    }
    final now = DateTime.now().millisecondsSinceEpoch;
    var due = (now - state.lastTickWallClockMs) ~/ tickDuration.inMilliseconds;
    if (due <= 0) return 0;
    if (due > maxCatchUpTicks) due = maxCatchUpTicks;
    for (var i = 0; i < due; i++) {
      engine.advance(state);
    }
    state.lastTickWallClockMs = now;
    return due;
  }

  PlayerAccount? accountByToken(String token) {
    for (final p in players) {
      if (p.token == token) return p;
    }
    return null;
  }

  bool empireNameTaken(String name) => state.empires
      .any((e) => e.name.toLowerCase() == name.trim().toLowerCase());

  /// Registers a new player: spawns an empire and mints a token.
  PlayerAccount register(String empireName) {
    final empire = GalaxyGenerator.spawnEmpire(
      state,
      name: empireName.trim(),
      isHuman: true,
    );
    final account = PlayerAccount(token: _newToken(), empireId: empire.id);
    players.add(account);
    save();
    return account;
  }

  static String _newToken() {
    final rng = Random.secure();
    final bytes = List<int>.generate(32, (_) => rng.nextInt(256));
    return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }
}
