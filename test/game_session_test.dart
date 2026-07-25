import 'dart:convert';

import 'package:dearde/game/game_session.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:game_core/game_core.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

GameState makeServerState() {
  final state = GalaxyGenerator.generateEmpty(seed: 7, neutralCount: 4);
  final empire = GalaxyGenerator.spawnEmpire(state, name: 'Tester', isHuman: true);
  state.viewerEmpireId = empire.id;
  return state;
}

http.Response jsonResponse(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status,
        headers: {'content-type': 'application/json'});

void main() {
  test('normalizeUrl adds scheme and strips trailing slashes', () {
    expect(GameSession.normalizeUrl('my-galaxy.fly.dev/'),
        'https://my-galaxy.fly.dev');
    expect(GameSession.normalizeUrl('http://10.0.0.5:8080'),
        'http://10.0.0.5:8080');
    expect(GameSession.normalizeUrl('  https://x.dev//  '), 'https://x.dev');
  });

  test('init fetches state and exposes the viewer empire', () async {
    final state = makeServerState();
    final client = MockClient((request) async {
      if (request.url.path == '/api/state' &&
          request.headers['authorization'] == 'Bearer good-token') {
        return jsonResponse({'state': state.toJson()});
      }
      return jsonResponse({'error': 'Missing or invalid token.'}, 401);
    });

    final session = GameSession(
        baseUrl: 'https://test', token: 'good-token', client: client);
    await session.init();

    expect(session.hasGame, isTrue);
    expect(session.player.name, 'Tester');
    expect(session.connectionError, isNull);
    session.dispose();
  });

  test('rejected token throws a readable ServerException', () async {
    final client = MockClient(
        (request) async => jsonResponse({'error': 'nope'}, 401));
    final session =
        GameSession(baseUrl: 'https://test', token: 'bad', client: client);

    await expectLater(
      session.init(),
      throwsA(isA<ServerException>().having(
          (e) => e.message, 'message', contains('token'))),
    );
    session.dispose();
  });

  test('build posts the action and applies the returned state', () async {
    final state = makeServerState();
    final home = state.planetsOf(state.player.id).first;
    Map<String, dynamic>? lastBody;

    final client = MockClient((request) async {
      if (request.url.path == '/api/state') {
        return jsonResponse({'state': state.toJson()});
      }
      if (request.url.path == '/api/build') {
        lastBody = jsonDecode(request.body) as Map<String, dynamic>;
        state.planetById(home.id).buildings[BuildingType.farm] =
            home.buildingCount(BuildingType.farm) + 1;
        return jsonResponse({'state': state.toJson()});
      }
      return jsonResponse({'error': 'not found'}, 404);
    });

    final session =
        GameSession(baseUrl: 'https://test', token: 't', client: client);
    await session.init();
    final farmsBefore =
        session.state!.planetById(home.id).buildingCount(BuildingType.farm);

    final error = await session.build(home, BuildingType.farm);

    expect(error, isNull);
    expect(lastBody, {'planetId': home.id, 'building': 'farm'});
    expect(
        session.state!.planetById(home.id).buildingCount(BuildingType.farm),
        farmsBefore + 1);
    session.dispose();
  });

  test('server-side rejection comes back as an error string', () async {
    final state = makeServerState();
    final client = MockClient((request) async {
      if (request.url.path == '/api/state') {
        return jsonResponse({'state': state.toJson()});
      }
      return jsonResponse({'error': 'Not enough credits or ore.'}, 400);
    });

    final session =
        GameSession(baseUrl: 'https://test', token: 't', client: client);
    await session.init();
    final home = state.planetsOf(state.player.id).first;

    final error = await session.build(home, BuildingType.lab);

    expect(error, 'Not enough credits or ore.');
    session.dispose();
  });
}
