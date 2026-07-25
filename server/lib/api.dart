import 'dart:convert';

import 'package:game_core/game_core.dart';
import 'package:shelf/shelf.dart';
import 'package:shelf_router/shelf_router.dart';

import 'world.dart';

/// REST API over the shared [World].
///
/// All game mutations happen synchronously on the single server isolate, so
/// no locking is needed.
class GameApi {
  GameApi(this.world, {required this.tickDuration});

  final World world;
  final Duration tickDuration;

  Handler get handler {
    final router = Router()
      ..get('/', _root)
      ..get('/health', _health)
      ..get('/api/info', _info)
      ..post('/api/register', _register)
      ..get('/api/state', _state)
      ..post('/api/build', _build)
      ..post('/api/train', _train)
      ..post('/api/mission', _mission);
    return router.call;
  }

  Response _root(Request request) => Response.ok(
        'Galactic Conflict server — tick ${world.state.tick}, '
        '${world.players.length} players, '
        '${world.state.planets.length} planets.\n'
        'API: POST /api/register, GET /api/state, POST /api/build, '
        'POST /api/train, POST /api/mission\n',
      );

  Response _health(Request request) =>
      _json({'ok': true, 'tick': world.state.tick});

  Response _info(Request request) => _json({
        'name': 'Galactic Conflict',
        'tick': world.state.tick,
        'tickSeconds': tickDuration.inSeconds,
        'players': world.players.length,
        'empires': world.state.empires.where((e) => !e.defeated).length,
        'planets': world.state.planets.length,
      });

  Future<Response> _register(Request request) async {
    final body = await _body(request);
    if (body == null) return _error('Invalid JSON body.');
    final name = (body['empireName'] as String? ?? '').trim();
    if (name.isEmpty) return _error('empireName is required.');
    if (name.length > 24) return _error('empireName is too long (max 24).');
    if (world.empireNameTaken(name)) {
      return _error('That empire name is already taken.');
    }
    final account = world.register(name);
    return _json({
      'token': account.token,
      'empireId': account.empireId,
      'state': _personalizedState(account),
    });
  }

  Response _state(Request request) {
    final account = _auth(request);
    if (account == null) return _unauthorized();
    return _json({'state': _personalizedState(account)});
  }

  Future<Response> _build(Request request) async {
    final account = _auth(request);
    if (account == null) return _unauthorized();
    final body = await _body(request);
    if (body == null) return _error('Invalid JSON body.');

    final planet = _planet(body['planetId']);
    if (planet == null) return _error('Unknown planet.');
    final BuildingType type;
    try {
      type = BuildingType.values.byName(body['building'] as String? ?? '');
    } catch (_) {
      return _error('Unknown building type.');
    }

    final empire = world.state.empireById(account.empireId)!;
    final error = GameActions.build(world.state, empire, planet, type);
    if (error != null) return _error(error);
    world.save();
    return _json({'state': _personalizedState(account)});
  }

  Future<Response> _train(Request request) async {
    final account = _auth(request);
    if (account == null) return _unauthorized();
    final body = await _body(request);
    if (body == null) return _error('Invalid JSON body.');

    final planet = _planet(body['planetId']);
    if (planet == null) return _error('Unknown planet.');
    final ShipType type;
    try {
      type = ShipType.values.byName(body['ship'] as String? ?? '');
    } catch (_) {
      return _error('Unknown ship type.');
    }
    final count = (body['count'] as num?)?.toInt() ?? 0;

    final empire = world.state.empireById(account.empireId)!;
    final error =
        GameActions.trainShips(world.state, empire, planet, type, count);
    if (error != null) return _error(error);
    world.save();
    return _json({'state': _personalizedState(account)});
  }

  Future<Response> _mission(Request request) async {
    final account = _auth(request);
    if (account == null) return _unauthorized();
    final body = await _body(request);
    if (body == null) return _error('Invalid JSON body.');

    final origin = _planet(body['originPlanetId']);
    final target = _planet(body['targetPlanetId']);
    if (origin == null || target == null) return _error('Unknown planet.');
    final MissionKind kind;
    try {
      kind = MissionKind.values.byName(body['kind'] as String? ?? '');
    } catch (_) {
      return _error('Unknown mission kind.');
    }
    final Fleet fleet;
    try {
      fleet = Fleet.fromJson(body['fleet'] as Map<String, dynamic>? ?? {});
    } catch (_) {
      return _error('Invalid fleet.');
    }

    final empire = world.state.empireById(account.empireId)!;
    final error = GameActions.launchMission(
      world.state,
      empire,
      origin: origin,
      target: target,
      fleet: fleet,
      kind: kind,
    );
    if (error != null) return _error(error);
    world.save();
    return _json({'state': _personalizedState(account)});
  }

  // -----------------------------------------------------------------------

  Map<String, dynamic> _personalizedState(PlayerAccount account) {
    final json = world.state.toJson();
    json['viewerEmpireId'] = account.empireId;
    return json;
  }

  PlayerAccount? _auth(Request request) {
    final header = request.headers['authorization'] ?? '';
    if (!header.startsWith('Bearer ')) return null;
    return world.accountByToken(header.substring(7).trim());
  }

  Planet? _planet(Object? id) {
    if (id is! num) return null;
    for (final p in world.state.planets) {
      if (p.id == id.toInt()) return p;
    }
    return null;
  }

  static Future<Map<String, dynamic>?> _body(Request request) async {
    try {
      final text = await request.readAsString();
      final decoded = jsonDecode(text);
      return decoded is Map<String, dynamic> ? decoded : null;
    } catch (_) {
      return null;
    }
  }

  static Response _json(Object body, {int status = 200}) => Response(
        status,
        body: jsonEncode(body),
        headers: {'content-type': 'application/json'},
      );

  static Response _error(String message) =>
      _json({'error': message}, status: 400);

  static Response _unauthorized() =>
      _json({'error': 'Missing or invalid token.'}, status: 401);
}
