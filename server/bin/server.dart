import 'dart:async';
import 'dart:io';

import 'package:dearde_server/api.dart';
import 'package:dearde_server/world.dart';
import 'package:shelf/shelf.dart';
import 'package:shelf/shelf_io.dart' as shelf_io;

Future<void> main() async {
  final port = int.parse(Platform.environment['PORT'] ?? '8080');
  final tickSeconds =
      int.parse(Platform.environment['TICK_SECONDS'] ?? '15');
  final worldFile =
      Platform.environment['WORLD_FILE'] ?? 'data/world.json';
  final seed = int.parse(Platform.environment['GALAXY_SEED'] ??
      '${DateTime.now().millisecondsSinceEpoch}');

  final tickDuration = Duration(seconds: tickSeconds);
  final world = World.load(filePath: worldFile, seed: seed);
  final caughtUp = world.catchUp(tickDuration);
  if (caughtUp > 0) {
    stdout.writeln('Caught up $caughtUp ticks of downtime.');
  }
  world.save();

  var ticksSinceSave = 0;
  final ticker = Timer.periodic(tickDuration, (_) {
    world.tick();
    ticksSinceSave++;
    if (ticksSinceSave >= 4) {
      ticksSinceSave = 0;
      world.save();
    }
  });

  final api = GameApi(world, tickDuration: tickDuration);
  final handler =
      const Pipeline().addMiddleware(logRequests()).addHandler(api.handler);
  final server = await shelf_io.serve(handler, InternetAddress.anyIPv4, port);
  stdout.writeln(
      'Galactic Conflict server on port ${server.port}, tick every '
      '${tickDuration.inSeconds}s, world at $worldFile '
      '(tick ${world.state.tick}, ${world.players.length} players).');

  Future<void> shutdown(String reason) async {
    stdout.writeln('Shutting down ($reason), saving world...');
    ticker.cancel();
    world.save();
    await server.close(force: true);
    exit(0);
  }

  ProcessSignal.sigint.watch().listen((_) => shutdown('SIGINT'));
  ProcessSignal.sigterm.watch().listen((_) => shutdown('SIGTERM'));
}
