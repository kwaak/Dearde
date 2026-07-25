import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../game/game_controller.dart';
import '../models/models.dart';

/// Missions in flight, both yours and detected enemy movements.
class FleetScreen extends StatelessWidget {
  const FleetScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final game = context.watch<GameController>();
    final s = game.state!;
    final mine = s.missions.where((m) => m.empireId == s.player.id).toList()
      ..sort((a, b) => a.arrivalTick.compareTo(b.arrivalTick));
    final incoming = s.missions
        .where((m) =>
            m.empireId != s.player.id &&
            !m.returning &&
            s.planetById(m.targetPlanetId).ownerId == s.player.id)
        .toList()
      ..sort((a, b) => a.arrivalTick.compareTo(b.arrivalTick));

    if (mine.isEmpty && incoming.isEmpty) {
      return const Center(
          child: Text('No fleets in flight.\nLaunch missions from a planet.',
              textAlign: TextAlign.center));
    }

    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        if (incoming.isNotEmpty) ...[
          Text('⚠ Incoming hostiles',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(color: Colors.redAccent)),
          for (final m in incoming) _missionTile(context, s, m, hostile: true),
          const SizedBox(height: 12),
        ],
        Text('Your fleets', style: Theme.of(context).textTheme.titleMedium),
        for (final m in mine) _missionTile(context, s, m),
      ],
    );
  }

  Widget _missionTile(BuildContext context, GameState s, Mission m,
      {bool hostile = false}) {
    final origin = s.planetById(m.originPlanetId);
    final target = s.planetById(m.targetPlanetId);
    final eta = m.arrivalTick - s.tick;
    final what = hostile
        ? '${s.empireById(m.empireId)?.name ?? 'Unknown'} attack fleet'
        : m.returning
            ? 'Returning fleet (${m.fleet.totalShips} ships)'
            : '${m.kind == MissionKind.attack ? 'Attack' : 'Transfer'} fleet '
                '(${m.fleet.totalShips} ships)';
    return Card(
      child: ListTile(
        leading: Icon(
          hostile ? Icons.warning : Icons.rocket,
          color: hostile ? Colors.redAccent : null,
        ),
        title: Text(what),
        subtitle: Text(m.returning
            ? '${target.name} → ${origin.name} · arrives in $eta ticks'
            : '${origin.name} → ${target.name} · arrives in $eta ticks'),
      ),
    );
  }
}
