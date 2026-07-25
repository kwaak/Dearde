import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../engine/galaxy_generator.dart';
import '../game/game_controller.dart';
import '../models/models.dart';
import 'planet_screen.dart';

/// Pan-and-zoom starmap. Tap a planet to inspect it.
class GalaxyScreen extends StatelessWidget {
  const GalaxyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final game = context.watch<GameController>();
    final s = game.state!;
    return LayoutBuilder(
      builder: (context, constraints) {
        const mapUnits = GalaxyGenerator.mapSize + 1;
        final side = constraints.biggest.shortestSide;
        final scale = side / mapUnits;
        return InteractiveViewer(
          maxScale: 5,
          minScale: 0.8,
          child: Center(
            child: SizedBox(
              width: side,
              height: side,
              child: GestureDetector(
                onTapUp: (details) {
                  final planet =
                      _hitTest(s, details.localPosition, scale);
                  if (planet != null) {
                    Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => PlanetScreen(planetId: planet.id),
                    ));
                  }
                },
                child: CustomPaint(
                  painter: _GalaxyPainter(state: s, scale: scale),
                  size: Size.square(side),
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Planet? _hitTest(GameState s, Offset pos, double scale) {
    Planet? best;
    var bestDist = 22.0; // px tap tolerance
    for (final p in s.planets) {
      final center = Offset((p.x + 0.5) * scale, (p.y + 0.5) * scale);
      final d = (center - pos).distance;
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }
}

class _GalaxyPainter extends CustomPainter {
  _GalaxyPainter({required this.state, required this.scale});

  final GameState state;
  final double scale;

  @override
  void paint(Canvas canvas, Size size) {
    final bg = Paint()..color = const Color(0xFF060A14);
    canvas.drawRect(Offset.zero & size, bg);

    // Sparse starfield derived from the map seed for a stable backdrop.
    final starPaint = Paint()..color = Colors.white.withValues(alpha: 0.25);
    var h = state.seed;
    for (var i = 0; i < 120; i++) {
      h = (h * 48271) % 0x7fffffff;
      final x = (h % 1000) / 1000 * size.width;
      h = (h * 48271) % 0x7fffffff;
      final y = (h % 1000) / 1000 * size.height;
      canvas.drawCircle(Offset(x, y), 0.7, starPaint);
    }

    // Mission trails.
    final trailPaint = Paint()
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke;
    for (final m in state.missions) {
      final a = state.planetById(
          m.returning ? m.targetPlanetId : m.originPlanetId);
      final b = state.planetById(
          m.returning ? m.originPlanetId : m.targetPlanetId);
      final owner = state.empireById(m.empireId);
      trailPaint.color =
          Color(owner?.color ?? 0xFFFFFFFF).withValues(alpha: 0.5);
      canvas.drawLine(_center(a), _center(b), trailPaint);
    }

    for (final p in state.planets) {
      final owner = state.empireById(p.ownerId);
      final color = owner == null ? Colors.grey : Color(owner.color);
      final center = _center(p);
      final radius = 3.0 + p.size / 8.0;
      canvas.drawCircle(
          center,
          radius + 2,
          Paint()
            ..color = color.withValues(alpha: 0.25)
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3));
      canvas.drawCircle(center, radius, Paint()..color = color);
      if (owner?.isPlayer ?? false) {
        canvas.drawCircle(
            center,
            radius + 3,
            Paint()
              ..color = Colors.white
              ..style = PaintingStyle.stroke
              ..strokeWidth = 1);
      }
    }
  }

  Offset _center(Planet p) =>
      Offset((p.x + 0.5) * scale, (p.y + 0.5) * scale);

  @override
  bool shouldRepaint(covariant _GalaxyPainter oldDelegate) => true;
}
