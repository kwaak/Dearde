import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../game/game_controller.dart';

class NewsScreen extends StatelessWidget {
  const NewsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final game = context.watch<GameController>();
    final events = game.state!.events;
    if (events.isEmpty) {
      return const Center(child: Text('Nothing has happened yet.'));
    }
    return ListView.builder(
      padding: const EdgeInsets.all(12),
      itemCount: events.length,
      itemBuilder: (context, i) {
        final e = events[i];
        return Card(
          child: ListTile(
            leading: Icon(
              e.important ? Icons.priority_high : Icons.info_outline,
              color: e.important ? Colors.amber : Colors.grey,
            ),
            title: Text(e.message),
            subtitle: Text('Tick ${e.tick}'),
          ),
        );
      },
    );
  }
}
