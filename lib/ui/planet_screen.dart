import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../engine/rules.dart';
import '../game/game_controller.dart';
import '../models/models.dart';
import 'mission_dialog.dart';
import 'widgets.dart';

class PlanetScreen extends StatelessWidget {
  const PlanetScreen({super.key, required this.planetId});

  final int planetId;

  @override
  Widget build(BuildContext context) {
    final game = context.watch<GameController>();
    final s = game.state!;
    final planet = s.planetById(planetId);
    final owner = s.empireById(planet.ownerId);
    final mine = planet.ownerId == s.player.id;

    return Scaffold(
      appBar: AppBar(title: Text('${planet.name} (${planet.x},${planet.y})')),
      body: Column(
        children: [
          ResourceBar(empire: s.player, tick: s.tick),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(12),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      children: [
                        StatRow(
                            label: 'Owner',
                            value: owner?.name ?? 'Unclaimed'),
                        StatRow(
                            label: 'Population',
                            value:
                                '${fmt(planet.population)} / ${fmt(planet.maxPopulation)}'),
                        StatRow(
                            label: 'Building slots',
                            value:
                                '${planet.totalBuildings} / ${planet.size}'),
                        StatRow(
                            label: 'Defense power',
                            value: '${planet.totalDefense}'),
                      ],
                    ),
                  ),
                ),
                if (mine) ...[
                  const SizedBox(height: 8),
                  Text('Construction',
                      style: Theme.of(context).textTheme.titleMedium),
                  for (final t in BuildingType.values)
                    _buildingTile(context, game, planet, t),
                  const SizedBox(height: 8),
                  Text('Shipyard',
                      style: Theme.of(context).textTheme.titleMedium),
                  for (final t in ShipType.values)
                    _shipTile(context, game, planet, t),
                  const SizedBox(height: 8),
                  Text('Garrison',
                      style: Theme.of(context).textTheme.titleMedium),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: planet.garrison.isEmpty
                          ? const Text('No ships stationed here.')
                          : Column(
                              children: [
                                for (final e
                                    in planet.garrison.ships.entries)
                                  StatRow(
                                      label: e.key.label,
                                      value: '${e.value}'),
                                StatRow(
                                    label: 'Attack / Defense power',
                                    value:
                                        '${planet.garrison.attackPower} / ${planet.garrison.defensePower}'),
                              ],
                            ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    icon: const Icon(Icons.rocket_launch),
                    label: const Text('Launch mission from here'),
                    onPressed: planet.garrison.isEmpty
                        ? null
                        : () => showMissionDialog(context, origin: planet),
                  ),
                  const SizedBox(height: 24),
                ] else ...[
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    icon: const Icon(Icons.gps_fixed),
                    label: const Text('Plan attack on this planet'),
                    onPressed: () => _attackFromPicker(context, game, planet),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildingTile(BuildContext context, GameController game,
      Planet planet, BuildingType t) {
    final cost = GameRules.buildingCosts[t]!;
    final affordable = GameRules.canAfford(game.player, t) &&
        planet.freeSlots > 0;
    return Card(
      child: ListTile(
        title: Text('${t.label} × ${planet.buildingCount(t)}'),
        subtitle: Text(
            '${t.blurb}\nCost: ${fmt(cost.credits)} credits, ${fmt(cost.ore)} ore'),
        isThreeLine: true,
        trailing: FilledButton.tonal(
          onPressed: affordable
              ? () {
                  final error = game.build(planet, t);
                  if (error != null) {
                    ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(error)));
                  }
                }
              : null,
          child: const Text('Build'),
        ),
      ),
    );
  }

  Widget _shipTile(
      BuildContext context, GameController game, Planet planet, ShipType t) {
    final affordable = GameRules.canAffordShip(game.player, t, 1);
    return Card(
      child: ListTile(
        title: Text(t.label),
        subtitle: Text('Attack ${t.attack} · Defense ${t.defense} · '
            'Cost ${fmt(t.cost)} credits, ${fmt(t.oreCost)} ore'),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            FilledButton.tonal(
              onPressed: affordable
                  ? () => _train(context, game, planet, t, 1)
                  : null,
              child: const Text('+1'),
            ),
            const SizedBox(width: 6),
            FilledButton.tonal(
              onPressed: GameRules.canAffordShip(game.player, t, 5)
                  ? () => _train(context, game, planet, t, 5)
                  : null,
              child: const Text('+5'),
            ),
          ],
        ),
      ),
    );
  }

  void _train(BuildContext context, GameController game, Planet planet,
      ShipType t, int count) {
    final error = game.trainShips(planet, t, count);
    if (error != null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error)));
    }
  }

  Future<void> _attackFromPicker(
      BuildContext context, GameController game, Planet target) async {
    final s = game.state!;
    final origins = s
        .planetsOf(s.player.id)
        .where((p) => !p.garrison.isEmpty)
        .toList()
      ..sort((a, b) => a.distanceTo(target).compareTo(b.distanceTo(target)));
    if (origins.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('You have no planets with ships to attack from.')));
      return;
    }
    final origin = await showDialog<Planet>(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text('Attack from which planet?'),
        children: [
          for (final p in origins)
            SimpleDialogOption(
              onPressed: () => Navigator.pop(context, p),
              child: Text(
                  '${p.name} · ${p.garrison.totalShips} ships · '
                  '${game.travelTicksBetween(p, target)} ticks away'),
            ),
        ],
      ),
    );
    if (origin == null || !context.mounted) return;
    await showMissionDialog(context, origin: origin, presetTarget: target);
  }
}
