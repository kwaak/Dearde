import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../game/game_session.dart';
import '../game/session_manager.dart';
import 'empire_screen.dart';
import 'fleet_screen.dart';
import 'galaxy_screen.dart';
import 'news_screen.dart';
import 'widgets.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  static const _titles = ['Empire', 'Galaxy', 'Fleets', 'News'];

  @override
  Widget build(BuildContext context) {
    final game = context.watch<GameSession>();
    final s = game.state!;
    final victor = game.victor;

    return Scaffold(
      appBar: AppBar(
        title: Text(_titles[_index]),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 4),
            child: Icon(
              game.connectionError == null ? Icons.cloud_done : Icons.cloud_off,
              color: game.connectionError == null
                  ? Colors.lightGreenAccent
                  : Colors.redAccent,
            ),
          ),
          PopupMenuButton<String>(
            onSelected: (v) => _onMenu(context, v),
            itemBuilder: (context) => const [
              PopupMenuItem(value: 'token', child: Text('Show login token')),
              PopupMenuItem(value: 'disconnect', child: Text('Disconnect')),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          ResourceBar(empire: s.player, tick: s.tick),
          if (game.connectionError != null)
            MaterialBanner(
              backgroundColor: Colors.orange.shade900,
              content: Text('Connection problem: ${game.connectionError}'),
              actions: const [SizedBox.shrink()],
            ),
          if (victor != null)
            MaterialBanner(
              backgroundColor: victor.id == s.player.id
                  ? Colors.green.shade900
                  : Colors.red.shade900,
              content: Text(victor.id == s.player.id
                  ? '🏆 You rule the galaxy! You control most known planets.'
                  : '${victor.name} now rules the galaxy. Fight on!'),
              actions: const [SizedBox.shrink()],
            )
          else if (game.playerDefeated)
            MaterialBanner(
              backgroundColor: Colors.red.shade900,
              content: const Text('💀 Your empire has been destroyed.'),
              actions: const [SizedBox.shrink()],
            ),
          Expanded(
            child: IndexedStack(
              index: _index,
              children: const [
                EmpireScreen(),
                GalaxyScreen(),
                FleetScreen(),
                NewsScreen(),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(
              icon: Icon(Icons.account_balance), label: 'Empire'),
          NavigationDestination(icon: Icon(Icons.blur_on), label: 'Galaxy'),
          NavigationDestination(icon: Icon(Icons.rocket), label: 'Fleets'),
          NavigationDestination(icon: Icon(Icons.newspaper), label: 'News'),
        ],
      ),
    );
  }

  Future<void> _onMenu(BuildContext context, String value) async {
    final manager = context.read<SessionManager>();
    switch (value) {
      case 'token':
        final token = manager.serverToken ?? '';
        await showDialog<void>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Your login token'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Anyone with this token controls your empire. Store it '
                  'somewhere safe to log in from another device.',
                  style: TextStyle(fontSize: 13),
                ),
                const SizedBox(height: 12),
                SelectableText(token,
                    style: const TextStyle(fontFamily: 'monospace')),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: token));
                  if (context.mounted) Navigator.pop(context);
                },
                child: const Text('Copy & close'),
              ),
            ],
          ),
        );
      case 'disconnect':
        final forget = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Disconnect from server?'),
            content: const Text(
                'Your empire keeps playing on the server. Keep the login '
                'token stored on this phone so you can reconnect?'),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(context, null),
                  child: const Text('Cancel')),
              TextButton(
                  onPressed: () => Navigator.pop(context, true),
                  child: const Text('Forget token')),
              FilledButton(
                  onPressed: () => Navigator.pop(context, false),
                  child: const Text('Keep token')),
            ],
          ),
        );
        if (forget == null) return;
        await manager.disconnect(forgetCredentials: forget);
    }
  }
}
