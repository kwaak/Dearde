import 'dart:async';
import 'dart:convert';

import 'package:game_core/game_core.dart';
import 'package:http/http.dart' as http;

import 'game_session.dart';

/// Thrown when the server rejects a request with a readable message.
class ServerException implements Exception {
  ServerException(this.message);
  final String message;

  @override
  String toString() => message;
}

/// A game mirrored from a multiplayer server: state is polled periodically
/// and actions are POSTed to the REST API.
class RemoteGameSession extends GameSession {
  RemoteGameSession({
    required this.baseUrl,
    required this.token,
    this.pollInterval = const Duration(seconds: 4),
    http.Client? client,
  }) : _client = client ?? http.Client();

  /// Server root, e.g. `https://my-galaxy.fly.dev`.
  final String baseUrl;
  final String token;
  final Duration pollInterval;
  final http.Client _client;

  GameState? _state;
  Timer? _timer;
  String? _connectionError;
  bool _requestInFlight = false;

  @override
  GameState? get state => _state;

  @override
  bool get isRemote => true;

  @override
  String? get connectionError => _connectionError;

  /// Normalizes user-typed server addresses: adds https:// when no scheme
  /// is given and strips trailing slashes.
  static String normalizeUrl(String raw) {
    var url = raw.trim();
    if (url.isEmpty) return url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://$url';
    }
    while (url.endsWith('/')) {
      url = url.substring(0, url.length - 1);
    }
    return url;
  }

  /// Registers a new empire on [baseUrl]; returns the auth token.
  static Future<String> register({
    required String baseUrl,
    required String empireName,
    http.Client? client,
  }) async {
    final c = client ?? http.Client();
    try {
      final response = await c
          .post(
            Uri.parse('$baseUrl/api/register'),
            headers: {'content-type': 'application/json'},
            body: jsonEncode({'empireName': empireName}),
          )
          .timeout(const Duration(seconds: 15));
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode != 200) {
        throw ServerException(
            body['error'] as String? ?? 'Registration failed.');
      }
      return body['token'] as String;
    } on ServerException {
      rethrow;
    } catch (e) {
      throw ServerException('Could not reach the server: $e');
    } finally {
      if (client == null) c.close();
    }
  }

  /// Fetches state once and starts polling. Throws [ServerException] if the
  /// server is unreachable or the token is rejected.
  Future<void> init() async {
    await _refresh(throwOnError: true);
    _timer = Timer.periodic(pollInterval, (_) => _refresh());
  }

  Future<void> _refresh({bool throwOnError = false}) async {
    if (_requestInFlight) return;
    _requestInFlight = true;
    try {
      final response = await _client.get(
        Uri.parse('$baseUrl/api/state'),
        headers: {'authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 15));
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode == 401) {
        throw ServerException('This login token was not accepted.');
      }
      if (response.statusCode != 200) {
        throw ServerException(body['error'] as String? ?? 'Server error.');
      }
      _applyState(body['state'] as Map<String, dynamic>);
      _connectionError = null;
    } on ServerException catch (e) {
      _connectionError = e.message;
      if (throwOnError) rethrow;
    } catch (e) {
      _connectionError = 'Connection lost: $e';
      if (throwOnError) throw ServerException(_connectionError!);
    } finally {
      _requestInFlight = false;
      notifyListeners();
    }
  }

  void _applyState(Map<String, dynamic> json) {
    _state = GameState.fromJson(json);
  }

  Future<String?> _post(String path, Map<String, dynamic> body) async {
    try {
      final response = await _client
          .post(
            Uri.parse('$baseUrl$path'),
            headers: {
              'content-type': 'application/json',
              'authorization': 'Bearer $token',
            },
            body: jsonEncode(body),
          )
          .timeout(const Duration(seconds: 15));
      final decoded = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode != 200) {
        return decoded['error'] as String? ?? 'Server error.';
      }
      _applyState(decoded['state'] as Map<String, dynamic>);
      _connectionError = null;
      notifyListeners();
      return null;
    } catch (e) {
      return 'Could not reach the server: $e';
    }
  }

  @override
  Future<String?> build(Planet planet, BuildingType type) =>
      _post('/api/build', {'planetId': planet.id, 'building': type.name});

  @override
  Future<String?> trainShips(Planet planet, ShipType type, int count) =>
      _post('/api/train',
          {'planetId': planet.id, 'ship': type.name, 'count': count});

  @override
  Future<String?> launchMission({
    required Planet origin,
    required Planet target,
    required Fleet fleet,
    required MissionKind kind,
  }) =>
      _post('/api/mission', {
        'originPlanetId': origin.id,
        'targetPlanetId': target.id,
        'kind': kind.name,
        'fleet': fleet.toJson(),
      });

  @override
  void dispose() {
    _timer?.cancel();
    _client.close();
    super.dispose();
  }
}
