import 'dart:convert';
import 'dart:io';

import 'package:dearde_server/api.dart';
import 'package:dearde_server/world.dart';
import 'package:game_core/game_core.dart';
import 'package:shelf/shelf.dart';
import 'package:test/test.dart';

void main() {
  late Directory tmp;
  late World world;
  late Handler handler;

  setUp(() {
    tmp = Directory.systemTemp.createTempSync('dearde_test');
    world = World.load(filePath: '${tmp.path}/world.json', seed: 1234);
    handler =
        GameApi(world, tickDuration: const Duration(seconds: 15)).handler;
  });

  tearDown(() {
    tmp.deleteSync(recursive: true);
  });

  Future<Map<String, dynamic>> call(
    String method,
    String path, {
    Map<String, dynamic>? body,
    String? token,
    int expectStatus = 200,
  }) async {
    final request = Request(
      method,
      Uri.parse('http://localhost$path'),
      headers: {
        if (token != null) 'authorization': 'Bearer $token',
        'content-type': 'application/json',
      },
      body: body == null ? null : jsonEncode(body),
    );
    final response = await handler(request);
    expect(response.statusCode, expectStatus,
        reason: '$method $path returned ${response.statusCode}');
    final text = await response.readAsString();
    return jsonDecode(text) as Map<String, dynamic>;
  }

  group('registration', () {
    test('creates an empire with a homeworld and token', () async {
      final result = await call('POST', '/api/register',
          body: {'empireName': 'Ternair Empire'});
      expect(result['token'], isA<String>());
      expect((result['token'] as String).length, 64);

      final state = GameState.fromJson(
          result['state'] as Map<String, dynamic>);
      expect(state.player.name, 'Ternair Empire');
      expect(state.planetsOf(state.player.id).length, 1);
      expect(world.players.length, 1);
    });

    test('rejects duplicate empire names', () async {
      await call('POST', '/api/register', body: {'empireName': 'Dup'});
      final result = await call('POST', '/api/register',
          body: {'empireName': 'dup'}, expectStatus: 400);
      expect(result['error'], contains('taken'));
    });

    test('rejects empty names', () async {
      await call('POST', '/api/register',
          body: {'empireName': '  '}, expectStatus: 400);
    });
  });

  group('auth', () {
    test('state requires a valid token', () async {
      await call('GET', '/api/state', expectStatus: 401);
      await call('GET', '/api/state', token: 'bogus', expectStatus: 401);
    });

    test('two players each see themselves as the viewer', () async {
      final a = await call('POST', '/api/register',
          body: {'empireName': 'Alpha'});
      final b = await call('POST', '/api/register',
          body: {'empireName': 'Beta'});

      final stateA = GameState.fromJson((await call('GET', '/api/state',
          token: a['token'] as String))['state'] as Map<String, dynamic>);
      final stateB = GameState.fromJson((await call('GET', '/api/state',
          token: b['token'] as String))['state'] as Map<String, dynamic>);

      expect(stateA.player.name, 'Alpha');
      expect(stateB.player.name, 'Beta');
      expect(stateA.planets.length, stateB.planets.length);
    });
  });

  group('actions', () {
    test('build constructs a farm on an owned planet', () async {
      final reg = await call('POST', '/api/register',
          body: {'empireName': 'Builder'});
      final token = reg['token'] as String;
      final state =
          GameState.fromJson(reg['state'] as Map<String, dynamic>);
      final home = state.planetsOf(state.player.id).first;
      final farmsBefore = home.buildingCount(BuildingType.farm);

      final result = await call('POST', '/api/build',
          token: token,
          body: {'planetId': home.id, 'building': 'farm'});
      final after =
          GameState.fromJson(result['state'] as Map<String, dynamic>);
      expect(
          after.planetById(home.id).buildingCount(BuildingType.farm),
          farmsBefore + 1);
    });

    test('cannot build on someone else\'s planet', () async {
      final a = await call('POST', '/api/register',
          body: {'empireName': 'OwnerA'});
      final b = await call('POST', '/api/register',
          body: {'empireName': 'OwnerB'});
      final stateA =
          GameState.fromJson(a['state'] as Map<String, dynamic>);
      final homeA = stateA.planetsOf(stateA.player.id).first;

      final result = await call('POST', '/api/build',
          token: b['token'] as String,
          body: {'planetId': homeA.id, 'building': 'farm'},
          expectStatus: 400);
      expect(result['error'], 'Not your planet.');
    });

    test('train and launch an attack mission', () async {
      final reg = await call('POST', '/api/register',
          body: {'empireName': 'Warlord'});
      final token = reg['token'] as String;
      var state = GameState.fromJson(reg['state'] as Map<String, dynamic>);
      final home = state.planetsOf(state.player.id).first;
      final neutral = state.planets.firstWhere((p) => p.ownerId == null);

      await call('POST', '/api/train',
          token: token,
          body: {'planetId': home.id, 'ship': 'fighter', 'count': 5});

      final result = await call('POST', '/api/mission', token: token, body: {
        'originPlanetId': home.id,
        'targetPlanetId': neutral.id,
        'kind': 'attack',
        'fleet': {'fighter': 10, 'transport': 2},
      });
      state = GameState.fromJson(result['state'] as Map<String, dynamic>);
      expect(state.missions.length, 1);
      expect(state.missions.first.empireId, state.player.id);
    });

    test('attack without transports is rejected', () async {
      final reg = await call('POST', '/api/register',
          body: {'empireName': 'NoTransport'});
      final token = reg['token'] as String;
      final state =
          GameState.fromJson(reg['state'] as Map<String, dynamic>);
      final home = state.planetsOf(state.player.id).first;
      final neutral = state.planets.firstWhere((p) => p.ownerId == null);

      final result = await call('POST', '/api/mission',
          token: token,
          body: {
            'originPlanetId': home.id,
            'targetPlanetId': neutral.id,
            'kind': 'attack',
            'fleet': {'fighter': 5},
          },
          expectStatus: 400);
      expect(result['error'], contains('Transport'));
    });
  });

  group('world persistence and ticks', () {
    test('save/load roundtrip keeps players and state', () async {
      await call('POST', '/api/register', body: {'empireName': 'Keeper'});
      world.tick();
      world.save();

      final reloaded =
          World.load(filePath: '${tmp.path}/world.json', seed: 999);
      expect(reloaded.players.length, 1);
      expect(reloaded.state.tick, world.state.tick);
      expect(reloaded.state.empires.any((e) => e.name == 'Keeper'), isTrue);
      // Seed of existing world wins over the requested one.
      expect(reloaded.state.seed, world.state.seed);
    });

    test('catchUp simulates downtime ticks', () {
      world.state.lastTickWallClockMs = DateTime.now()
          .subtract(const Duration(minutes: 5))
          .millisecondsSinceEpoch;
      final ticked = world.catchUp(const Duration(seconds: 15));
      expect(ticked, inInclusiveRange(19, 20));
      expect(world.state.tick, ticked);
    });

    test('health and info endpoints work without auth', () async {
      final health = await call('GET', '/health');
      expect(health['ok'], isTrue);
      final info = await call('GET', '/api/info');
      expect(info['tickSeconds'], 15);
    });
  });
}
