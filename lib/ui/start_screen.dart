import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../game/remote_game_session.dart';
import '../game/session_manager.dart';

/// Entry screen: found a local empire or join an online galaxy.
class StartScreen extends StatefulWidget {
  const StartScreen({super.key});

  @override
  State<StartScreen> createState() => _StartScreenState();
}

class _StartScreenState extends State<StartScreen> {
  final _localName = TextEditingController(text: 'Terran Empire');
  final _serverUrl = TextEditingController();
  final _onlineName = TextEditingController();
  final _loginToken = TextEditingController();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final manager = context.read<SessionManager>();
    if (manager.serverUrl != null) {
      _serverUrl.text = manager.serverUrl!;
    }
  }

  @override
  void dispose() {
    _localName.dispose();
    _serverUrl.dispose();
    _onlineName.dispose();
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
                  'Build planets, raise fleets, conquer the galaxy.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 24),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text('Local empire',
                            style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 4),
                        Text(
                          'Play offline against three AI rivals. The galaxy '
                          'lives on this phone.',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: _localName,
                          decoration: const InputDecoration(
                            labelText: 'Name your empire',
                            border: OutlineInputBorder(),
                          ),
                        ),
                        const SizedBox(height: 12),
                        FilledButton.icon(
                          icon: const Icon(Icons.rocket_launch),
                          label: const Text('Found your empire'),
                          onPressed: _busy
                              ? null
                              : () => _run(() => context
                                  .read<SessionManager>()
                                  .startLocalGame(_localName.text)),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text('Online galaxy',
                            style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 4),
                        Text(
                          'Join a shared galaxy on a Galactic Conflict '
                          'server and compete with other players.',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        const SizedBox(height: 12),
                        if (canReconnect) ...[
                          FilledButton.tonalIcon(
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
                          controller: _onlineName,
                          decoration: const InputDecoration(
                            labelText: 'New empire name',
                            border: OutlineInputBorder(),
                          ),
                        ),
                        const SizedBox(height: 12),
                        FilledButton.icon(
                          icon: const Icon(Icons.public),
                          label: const Text('Join the galaxy'),
                          onPressed: _busy
                              ? null
                              : () => _run(() => context
                                  .read<SessionManager>()
                                  .registerOnline(
                                      url: _serverUrl.text,
                                      empireName: _onlineName.text)),
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
