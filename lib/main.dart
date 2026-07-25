import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'game/game_session.dart';
import 'game/session_manager.dart';
import 'ui/home_shell.dart';
import 'ui/start_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const GalacticConflictApp());
}

class GalacticConflictApp extends StatefulWidget {
  const GalacticConflictApp({super.key});

  @override
  State<GalacticConflictApp> createState() => _GalacticConflictAppState();
}

class _GalacticConflictAppState extends State<GalacticConflictApp> {
  late final SessionManager _manager;
  late final Future<void> _initFuture;

  @override
  void initState() {
    super.initState();
    _manager = SessionManager();
    _initFuture = _manager.init();
  }

  @override
  void dispose() {
    _manager.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider.value(
      value: _manager,
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
            return Consumer<SessionManager>(
              builder: (context, manager, _) {
                final session = manager.session;
                if (session == null || !session.hasGame) {
                  return const StartScreen();
                }
                return ChangeNotifierProvider<GameSession>.value(
                  value: session,
                  child: const HomeShell(),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
