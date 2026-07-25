import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'game/game_controller.dart';
import 'ui/home_shell.dart';
import 'ui/new_game_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const GalacticConflictApp());
}

class GalacticConflictApp extends StatefulWidget {
  const GalacticConflictApp({super.key});

  @override
  State<GalacticConflictApp> createState() => _GalacticConflictAppState();
}

class _GalacticConflictAppState extends State<GalacticConflictApp>
    with WidgetsBindingObserver {
  late final GameController _game;
  late final Future<void> _initFuture;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _game = GameController();
    _initFuture = _game.init();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _game.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Persist the world whenever the app goes to the background.
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive) {
      _game.save();
    }
  }

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider.value(
      value: _game,
      child: MaterialApp(
        title: 'Galactic Conflict',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          brightness: Brightness.dark,
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFF4FA8E8),
            brightness: Brightness.dark,
          ),
          scaffoldBackgroundColor: const Color(0xFF0A0E1A),
          useMaterial3: true,
        ),
        home: FutureBuilder<void>(
          future: _initFuture,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Scaffold(
                body: Center(child: CircularProgressIndicator()),
              );
            }
            return Consumer<GameController>(
              builder: (context, game, _) =>
                  game.hasGame ? const HomeShell() : const NewGameScreen(),
            );
          },
        ),
      ),
    );
  }
}
