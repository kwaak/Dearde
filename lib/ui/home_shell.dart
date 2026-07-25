import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../game/game_controller.dart';
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
    final game = context.watch<GameController>();
    final s = game.state!;
    final victor = game.victor;

    return Scaffold(
      appBar: AppBar(
        title: Text(_titles[_index]),
        actions: [
          PopupMenuButton<String>(
            onSelected: (v) async {
              if (v == 'abandon') {
                final sure = await showDialog<bool>(
                  context: context,
                  builder: (context) => AlertDialog(
                    title: const Text('Abandon empire?'),
                    content: const Text(
                        'This deletes your current game permanently.'),
                    actions: [
                      TextButton(
                          onPressed: () => Navigator.pop(context, false),
                          child: const Text('Cancel')),
                      FilledButton(
                          onPressed: () => Navigator.pop(context, true),
                          child: const Text('Abandon')),
                    ],
                  ),
                );
                if (sure ?? false) {
                  await game.abandonGame();
                }
              }
            },
            itemBuilder: (context) => const [
              PopupMenuItem(value: 'abandon', child: Text('Abandon game')),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          ResourceBar(empire: s.player, tick: s.tick),
          if (victor != null)
            MaterialBanner(
              backgroundColor:
                  victor.isPlayer ? Colors.green.shade900 : Colors.red.shade900,
              content: Text(victor.isPlayer
                  ? '🏆 You rule the galaxy! You control most known planets.'
                  : '${victor.name} now rules the galaxy. Fight on or start over.'),
              actions: [
                TextButton(
                  onPressed: () => game.abandonGame(),
                  child: const Text('New game'),
                ),
              ],
            )
          else if (game.playerDefeated)
            MaterialBanner(
              backgroundColor: Colors.red.shade900,
              content: const Text('💀 Your empire has been destroyed.'),
              actions: [
                TextButton(
                  onPressed: () => game.abandonGame(),
                  child: const Text('New game'),
                ),
              ],
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
          NavigationDestination(icon: Icon(Icons.account_balance), label: 'Empire'),
          NavigationDestination(icon: Icon(Icons.blur_on), label: 'Galaxy'),
          NavigationDestination(icon: Icon(Icons.rocket), label: 'Fleets'),
          NavigationDestination(icon: Icon(Icons.newspaper), label: 'News'),
        ],
      ),
    );
  }
}
