import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../game/game_controller.dart';
import 'planet_screen.dart';
import 'widgets.dart';

class EmpireScreen extends StatelessWidget {
  const EmpireScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final game = context.watch<GameController>();
    final s = game.state!;
    final planets = s.planetsOf(s.player.id).toList()
      ..sort((a, b) => b.population.compareTo(a.population));

    final standings = s.empires.where((e) => !e.defeated).toList()
      ..sort((a, b) =>
          s.planetsOf(b.id).length.compareTo(s.planetsOf(a.id).length));

    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Galactic standings',
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 6),
                for (final e in standings)
                  StatRow(
                    label: e.isPlayer ? '${e.name} (you)' : e.name,
                    value:
                        '${s.planetsOf(e.id).length} planets · tech ${e.techLevel}',
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text('Your planets (${planets.length})',
            style: Theme.of(context).textTheme.titleMedium),
        for (final p in planets)
          Card(
            child: ListTile(
              leading: const Icon(Icons.public),
              title: Text('${p.name} (${p.x},${p.y})'),
              subtitle: Text(
                  'Pop ${fmt(p.population)} · buildings ${p.totalBuildings}/${p.size} · '
                  'ships ${p.garrison.totalShips} · defense ${p.totalDefense}'),
              onTap: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => PlanetScreen(planetId: p.id),
              )),
            ),
          ),
      ],
    );
  }
}
