import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../game/game_controller.dart';
import '../models/models.dart';
import 'widgets.dart';

/// Full mission flow: pick a target, assemble a fleet, launch.
Future<void> showMissionDialog(
  BuildContext context, {
  required Planet origin,
  Planet? presetTarget,
}) async {
  final game = context.read<GameController>();
  final s = game.state!;

  var target = presetTarget;
  target ??= await showDialog<Planet>(
    context: context,
    builder: (context) {
      final candidates = s.planets.where((p) => p.id != origin.id).toList()
        ..sort((a, b) => origin.distanceTo(a).compareTo(origin.distanceTo(b)));
      return SimpleDialog(
        title: const Text('Select target'),
        children: [
          SizedBox(
            width: double.maxFinite,
            height: 400,
            child: ListView.builder(
              itemCount: candidates.length,
              itemBuilder: (context, i) {
                final p = candidates[i];
                final owner = s.empireById(p.ownerId);
                return ListTile(
                  leading: Icon(Icons.circle,
                      size: 14,
                      color: owner == null
                          ? Colors.grey
                          : Color(owner.color)),
                  title: Text('${p.name} (${p.x},${p.y})'),
                  subtitle: Text(
                    '${owner?.name ?? 'Unclaimed'} · '
                    '${game.travelTicksBetween(origin, p)} ticks away'
                    '${p.ownerId == null || p.ownerId != s.player.id ? ' · defense ~${p.totalDefense}' : ''}',
                  ),
                  onTap: () => Navigator.pop(context, p),
                );
              },
            ),
          ),
        ],
      );
    },
  );
  if (target == null || !context.mounted) return;

  final selection = <ShipType, int>{};
  final chosenTarget = target;
  final isOwn = chosenTarget.ownerId == s.player.id;

  await showDialog<void>(
    context: context,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) {
        final fleet = Fleet(selection);
        final kind = isOwn ? MissionKind.transfer : MissionKind.attack;
        return AlertDialog(
          title: Text(isOwn
              ? 'Transfer to ${chosenTarget.name}'
              : 'Attack ${chosenTarget.name}'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Travel time: '
                  '${game.travelTicksBetween(origin, chosenTarget)} ticks\n'
                  'Fleet attack power: ${fleet.attackPower}'
                  '${isOwn ? '' : '\nEstimated defense: ~${chosenTarget.totalDefense + 40}'}',
                ),
                if (!isOwn)
                  const Padding(
                    padding: EdgeInsets.only(top: 4),
                    child: Text(
                      'Include at least one Transport to occupy the planet.',
                      style: TextStyle(fontSize: 12, color: Colors.amber),
                    ),
                  ),
                const Divider(),
                ShipPicker(
                  available: origin.garrison,
                  selection: selection,
                  onChanged: (t, v) => setState(() {
                    if (v <= 0) {
                      selection.remove(t);
                    } else {
                      selection[t] = v;
                    }
                  }),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                final error = game.launchMission(
                  origin: origin,
                  target: chosenTarget,
                  fleet: Fleet(selection),
                  kind: kind,
                );
                if (error != null) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(error)),
                  );
                } else {
                  Navigator.pop(context);
                }
              },
              child: Text(isOwn ? 'Send' : 'Launch attack'),
            ),
          ],
        );
      },
    ),
  );
}
