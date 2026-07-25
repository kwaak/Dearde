import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../game/game_controller.dart';

class NewGameScreen extends StatefulWidget {
  const NewGameScreen({super.key});

  @override
  State<NewGameScreen> createState() => _NewGameScreenState();
}

class _NewGameScreenState extends State<NewGameScreen> {
  final _nameController = TextEditingController(text: 'Terran Empire');

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Icon(Icons.blur_on, size: 72, color: Colors.lightBlueAccent),
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
                  'A tribute to the classic persistent browser empire games.\n'
                  'Build planets, raise fleets, conquer the galaxy — the world '
                  'keeps ticking even while you are away.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 32),
                TextField(
                  controller: _nameController,
                  decoration: const InputDecoration(
                    labelText: 'Name your empire',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 16),
                FilledButton.icon(
                  icon: const Icon(Icons.rocket_launch),
                  label: const Text('Found your empire'),
                  onPressed: () => context
                      .read<GameController>()
                      .newGame(playerName: _nameController.text),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
