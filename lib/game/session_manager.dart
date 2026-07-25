import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'game_session.dart';

/// Owns the active [GameSession] and remembers the server credentials
/// across app launches.
class SessionManager extends ChangeNotifier {
  static const _serverUrlKey = 'dearde_server_url';
  static const _serverTokenKey = 'dearde_server_token';

  GameSession? _session;

  GameSession? get session => _session;

  String? _serverUrl;
  String? get serverUrl => _serverUrl;

  String? _serverToken;
  String? get serverToken => _serverToken;

  /// Reconnects to the previous galaxy on app start, if credentials exist.
  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _serverUrl = prefs.getString(_serverUrlKey);
    _serverToken = prefs.getString(_serverTokenKey);

    if (_serverUrl != null && _serverToken != null) {
      final session = GameSession(baseUrl: _serverUrl!, token: _serverToken!);
      try {
        await session.init();
        _adopt(session);
      } on ServerException catch (e) {
        // Keep the credentials; the start screen offers a reconnect.
        debugPrint('Reconnect failed: ${e.message}');
        session.dispose();
      }
    }
    notifyListeners();
  }

  /// Registers a fresh empire on [url] and connects to it.
  Future<void> registerOnline({
    required String url,
    required String empireName,
  }) async {
    final baseUrl = GameSession.normalizeUrl(url);
    final token =
        await GameSession.register(baseUrl: baseUrl, empireName: empireName);
    await connectOnline(url: baseUrl, token: token);
  }

  /// Connects with an existing token (login from another device).
  Future<void> connectOnline({
    required String url,
    required String token,
  }) async {
    final baseUrl = GameSession.normalizeUrl(url);
    final session = GameSession(baseUrl: baseUrl, token: token.trim());
    await session.init(); // throws ServerException on failure
    _adopt(session);
    _serverUrl = baseUrl;
    _serverToken = token.trim();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_serverUrlKey, baseUrl);
    await prefs.setString(_serverTokenKey, token.trim());
    notifyListeners();
  }

  /// Disconnects from the server. The empire lives on server-side; with the
  /// token the player can log back in. [forgetCredentials] also wipes the
  /// stored token.
  Future<void> disconnect({bool forgetCredentials = false}) async {
    _session?.dispose();
    _session = null;
    if (forgetCredentials) {
      _serverUrl = null;
      _serverToken = null;
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_serverUrlKey);
      await prefs.remove(_serverTokenKey);
    }
    notifyListeners();
  }

  void _adopt(GameSession session) {
    _session?.dispose();
    _session = session;
  }

  @override
  void dispose() {
    _session?.dispose();
    super.dispose();
  }
}
