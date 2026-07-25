import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../game/game_session.dart';
import '../game/session_manager.dart';

/// Server address baked in at build time, e.g.
/// `flutter build apk --dart-define=SERVER_URL=https://my-galaxy.fly.dev`.
/// CI passes the repository variable SERVER_URL here; when unset, the
/// default galaxy below is used so APKs work out of the box.
const String _envServerUrl = String.fromEnvironment('SERVER_URL');
const String kDefaultServerUrl = _envServerUrl != ''
    ? _envServerUrl
    : 'http://h2945746.stratoserver.net:8080';

/// Entry screen: join an online galaxy by founding a new empire or logging
/// in with an existing token.
class StartScreen extends StatefulWidget {
  const StartScreen({super.key});

  @override
  State<StartScreen> createState() => _StartScreenState();
}

class _StartScreenState extends State<StartScreen> {
  final _serverUrl = TextEditingController();
  final _empireName = TextEditingController();
  final _loginToken = TextEditingController();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final manager = context.read<SessionManager>();
    _serverUrl.text = manager.serverUrl ?? kDefaultServerUrl;
  }

  @override
  void dispose() {
    _serverUrl.dispose();
    _empireName.dispose();
    _loginToken.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } on ServerException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final manager = context.watch<SessionManager>();
    final canReconnect =
        manager.serverUrl != null && manager.serverToken != null;

    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Icon(Icons.blur_on,
                    size: 72, color: Colors.lightBlueAccent),
                const SizedBox(height: 12),
                Text(
                  'GALACTIC CONFLICT',
                  textAlign: TextAlign.center,
                  style: Theme.of(context)
                      .textTheme
                      .headlineMedium
                      ?.copyWith(letterSpacing: 4),
                ),
                const SizedBox(height: 4),
                Text(
                  'A tribute to the classic persistent browser empire games. '
                  'Join a shared galaxy, build planets, raise fleets, and '
                  'outgrow the other players — the world keeps ticking even '
                  'while you are away.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 24),
                if (canReconnect) ...[
                  FilledButton.icon(
                    icon: const Icon(Icons.sync),
                    label: Text('Reconnect to ${manager.serverUrl}'),
                    onPressed: _busy
                        ? null
                        : () => _run(() => context
                            .read<SessionManager>()
                            .connectOnline(
                                url: manager.serverUrl!,
                                token: manager.serverToken!)),
                  ),
                  const SizedBox(height: 12),
                ],
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        TextField(
                          controller: _serverUrl,
                          decoration: const InputDecoration(
                            labelText: 'Server address',
                            hintText: 'https://my-galaxy.fly.dev',
                            border: OutlineInputBorder(),
                          ),
                          keyboardType: TextInputType.url,
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: _empireName,
                          decoration: const InputDecoration(
                            labelText: 'New empire name',
                            border: OutlineInputBorder(),
                          ),
                        ),
                        const SizedBox(height: 12),
                        FilledButton.icon(
                          icon: const Icon(Icons.rocket_launch),
                          label: const Text('Join the galaxy'),
                          onPressed: _busy
                              ? null
                              : () => _run(() => context
                                  .read<SessionManager>()
                                  .registerOnline(
                                      url: _serverUrl.text,
                                      empireName: _empireName.text)),
                        ),
                        ExpansionTile(
                          title: const Text('Log in with an existing token'),
                          tilePadding: EdgeInsets.zero,
                          children: [
                            TextField(
                              controller: _loginToken,
                              decoration: const InputDecoration(
                                labelText: 'Login token',
                                border: OutlineInputBorder(),
                              ),
                            ),
                            const SizedBox(height: 12),
                            FilledButton.tonal(
                              onPressed: _busy
                                  ? null
                                  : () => _run(() => context
                                      .read<SessionManager>()
                                      .connectOnline(
                                          url: _serverUrl.text,
                                          token: _loginToken.text)),
                              child: const Text('Log in'),
                            ),
                            const SizedBox(height: 12),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'No server yet? Hosting one is free — see server/README.md '
                  'in the repository.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                if (_busy) ...[
                  const SizedBox(height: 16),
                  const Center(child: CircularProgressIndicator()),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
