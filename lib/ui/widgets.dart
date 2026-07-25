import 'package:flutter/material.dart';

import 'package:game_core/game_core.dart';

/// Compact number formatting: 12.3k, 4.5M.
String fmt(int n) {
  if (n.abs() >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
  if (n.abs() >= 10000) return '${(n / 1000).toStringAsFixed(1)}k';
  return '$n';
}

class ResourceBar extends StatelessWidget {
  const ResourceBar({super.key, required this.empire, required this.tick});

  final Empire empire;
  final int tick;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            _chip(Icons.paid, fmt(empire.credits), Colors.amber),
            _chip(Icons.grass, fmt(empire.food), Colors.lightGreen),
            _chip(Icons.terrain, fmt(empire.ore), Colors.orangeAccent),
            _chip(Icons.science, fmt(empire.research), Colors.lightBlueAccent),
            _chip(Icons.military_tech, 'T${empire.techLevel}', Colors.purpleAccent),
            _chip(Icons.timer, '$tick', Colors.white70),
          ],
        ),
      ),
    );
  }

  Widget _chip(IconData icon, String text, Color color) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 3),
          Text(text, style: const TextStyle(fontSize: 13)),
        ],
      );
}

class StatRow extends StatelessWidget {
  const StatRow({super.key, required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: TextStyle(color: Colors.grey.shade400)),
            Text(value),
          ],
        ),
      );
}

/// Ship count selector used when assembling a fleet.
class ShipPicker extends StatelessWidget {
  const ShipPicker({
    super.key,
    required this.available,
    required this.selection,
    required this.onChanged,
  });

  final Fleet available;
  final Map<ShipType, int> selection;
  final void Function(ShipType, int) onChanged;

  @override
  Widget build(BuildContext context) {
    final types =
        ShipType.values.where((t) => available.count(t) > 0).toList();
    if (types.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(8),
        child: Text('No ships stationed here.'),
      );
    }
    return Column(
      children: [
        for (final t in types)
          Row(
            children: [
              Expanded(
                child: Text('${t.label} (${available.count(t)})'),
              ),
              IconButton(
                icon: const Icon(Icons.remove),
                onPressed: (selection[t] ?? 0) > 0
                    ? () => onChanged(t, (selection[t] ?? 0) - 1)
                    : null,
              ),
              SizedBox(
                width: 36,
                child: Text('${selection[t] ?? 0}',
                    textAlign: TextAlign.center),
              ),
              IconButton(
                icon: const Icon(Icons.add),
                onPressed: (selection[t] ?? 0) < available.count(t)
                    ? () => onChanged(t, (selection[t] ?? 0) + 1)
                    : null,
              ),
              TextButton(
                onPressed: () => onChanged(t, available.count(t)),
                child: const Text('All'),
              ),
            ],
          ),
      ],
    );
  }
}
