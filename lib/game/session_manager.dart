import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'game_session.dart';
import 'local_game_session.dart';
import 'remote_game_session.dart';

/// Chooses and owns the active [GameSession] (local or online) and remembers
/// the choice — including server credentials — across app launches.
class SessionManager extends ChangeNotifier {
  static const _modeKey = 'dearde_mode';
  static const _serverUrlKey = 'dearde_server_url';
  static const _serverTokenKey = 'dearde_server_token';

  GameSession? _session;

  GameSession? get session => _session;

  String? _serverUrl;
  String? get serverUrl => _serverUrl;

  String? _serverToken;
  String? get serverToken => _serverToken;

  /// Restores the previous session on app start, if any.
  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    final mode = prefs.getString(_modeKey);
    _serverUrl = prefs.getString(_serverUrlKey);
    _serverToken = prefs.getString(_serverTokenKey);

    if (mode == 'local') {
      final local = LocalGameSession();
      await local.init();
      if (local.hasGame) {
        _adopt(local);
      } else {
        local.dispose();
        await prefs.remove(_modeKey);
      }
    } else if (mode == 'remote' &&
        _serverUrl != null &&
        _serverToken != null) {
      final remote =
          RemoteGameSession(baseUrl: _serverUrl!, token: _serverToken!);
      try {
        await remote.init();
        _adopt(remote);
      } on ServerException catch (e) {
        // Keep the credentials; the start screen offers a reconnect.
        debugPrint('Reconnect failed: ${e.message}');
        remote.dispose();
      }
    }
    notifyListeners();
  }

  Future<void> startLocalGame(String empireName) async {
    final local = LocalGameSession();
    await local.init();
    if (!local.hasGame) {
      local.newGame(playerName: empireName);
    }
    _adopt(local);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_modeKey, 'local');
    notifyListeners();
  }

  /// Registers a fresh empire on [url] and connects to it.
  Future<void> registerOnline({
    required String url,
    required String empireName,
  }) async {
    final baseUrl = RemoteGameSession.normalizeUrl(url);
    final token = await RemoteGameSession.register(
        baseUrl: baseUrl, empireName: empireName);
    await connectOnline(url: baseUrl, token: token);
  }

  /// Connects with an existing token (login from another device).
  Future<void> connectOnline({
    required String url,
    required String token,
  }) async {
    final baseUrl = RemoteGameSession.normalizeUrl(url);
    final remote = RemoteGameSession(baseUrl: baseUrl, token: token.trim());
    await remote.init(); // throws ServerException on failure
    _adopt(remote);
    _serverUrl = baseUrl;
    _serverToken = token.trim();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_modeKey, 'remote');
    await prefs.setString(_serverUrlKey, baseUrl);
    await prefs.setString(_serverTokenKey, token.trim());
    notifyListeners();
  }

  /// Abandons a local game (deletes the save) and returns to the start
  /// screen.
  Future<void> abandonLocalGame() async {
    final s = _session;
    if (s is LocalGameSession) {
      await s.deleteSave();
    }
    await _clearSession(clearCredentials: false);
  }

  /// Disconnects from the server. The empire lives on server-side; with the
  /// token the player can log back in. [forgetCredentials] also wipes the
  /// stored token.
  Future<void> disconnectOnline({bool forgetCredentials = false}) async {
    await _clearSession(clearCredentials: forgetCredentials);
  }

  Future<void> _clearSession({required bool clearCredentials}) async {
    _session?.dispose();
    _session = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_modeKey);
    if (clearCredentials) {
      _serverUrl = null;
      _serverToken = null;
      await prefs.remove(_serverUrlKey);
      await prefs.remove(_serverTokenKey);
    }
    notifyListeners();
  }

  void _adopt(GameSession session) {
    _session?.dispose();
    _session = session;
  }

  Future<void> persist() async => _session?.persist();

  @override
  void dispose() {
    _session?.dispose();
    super.dispose();
  }
}
