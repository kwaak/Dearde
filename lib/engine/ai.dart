import 'dart:math';

import '../models/models.dart';
import 'rules.dart';
import 'tick_engine.dart';

/// Simple rival empire brain: builds up its planets, trains fleets, and
/// periodically raids neutral worlds or the weakest enemy planet in range.
class AiPlayer {
  AiPlayer(this._rng);

  final Random _rng;

  void act(GameState s, Empire empire, TickEngine engine) {
    final owned = s.planetsOf(empire.id).toList();
    if (owned.isEmpty) return;

    _build(s, empire, owned);
    _train(empire, owned);

    // Roughly one raid consideration every 12 ticks per empire.
    if (_rng.nextInt(12) == 0) {
      _raid(s, empire, owned, engine);
    }
  }

  void _build(GameState s, Empire empire, List<Planet> owned) {
    for (final planet in owned) {
      if (planet.freeSlots <= 0) continue;

      final farms = planet.buildingCount(BuildingType.farm);
      final needFood = empire.food < 500 ||
          farms * TickEngine.foodPerFarm <
              planet.population * TickEngine.foodPerPop100 ~/ 100;
      final needHousing = planet.population >= planet.maxPopulation * 0.9;

      BuildingType choice;
      if (needFood) {
        choice = BuildingType.farm;
      } else if (needHousing) {
        choice = BuildingType.livingQuarters;
      } else {
        const options = [
          BuildingType.bank,
          BuildingType.mine,
          BuildingType.bank,
          BuildingType.lab,
          BuildingType.defenseStation,
        ];
        choice = options[_rng.nextInt(options.length)];
      }

      if (GameRules.canAfford(empire, choice)) {
        final cost = GameRules.buildingCosts[choice]!;
        empire.credits -= cost.credits;
        empire.ore -= cost.ore;
        planet.buildings[choice] = planet.buildingCount(choice) + 1;
      }
    }
  }

  void _train(Empire empire, List<Planet> owned) {
    // Keep a war chest, spend the surplus on ships at the biggest planet.
    if (empire.credits < 2500) return;
    final home = owned.reduce((a, b) => a.size >= b.size ? a : b);

    final wantTransports = home.garrison.count(ShipType.transport) < 4;
    final type = wantTransports
        ? ShipType.transport
        : [
            ShipType.fighter,
            ShipType.fighter,
            ShipType.bomber,
            if (empire.credits > 8000) ShipType.dreadnought,
          ][_rng.nextInt(empire.credits > 8000 ? 4 : 3)];

    final affordable = min(
      (empire.credits - 1500) ~/ type.cost,
      type.oreCost == 0 ? 99 : empire.ore ~/ type.oreCost,
    );
    if (affordable <= 0) return;
    final count = min(affordable, 5);
    empire.credits -= type.cost * count;
    empire.ore -= type.oreCost * count;
    home.garrison.add(type, count);
  }

  void _raid(
      GameState s, Empire empire, List<Planet> owned, TickEngine engine) {
    final staging = owned.reduce(
        (a, b) => a.garrison.attackPower >= b.garrison.attackPower ? a : b);
    final strength = staging.garrison.attackPower;
    if (strength < 150 || staging.garrison.count(ShipType.transport) < 1) {
      return;
    }

    // Prefer nearby neutral planets; hit rivals only with clear superiority.
    Planet? best;
    var bestScore = double.negativeInfinity;
    for (final p in s.planets) {
      if (p.ownerId == empire.id) continue;
      final defense = p.totalDefense + 40;
      if (defense > strength * 0.7) continue;
      final distance = staging.distanceTo(p);
      final neutralBonus = p.ownerId == null ? 30.0 : 0.0;
      final score = neutralBonus - distance - defense / 50.0;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best == null) return;

    // Send most of the garrison, keep a token home guard.
    final force = Fleet();
    for (final e in staging.garrison.ships.entries) {
      final send = e.key == ShipType.transport
          ? min(e.value, 2)
          : (e.value * 0.8).floor();
      if (send > 0) force.add(e.key, send);
    }
    if (force.isEmpty || force.count(ShipType.transport) == 0) return;

    staging.garrison.subtract(force);
    s.missions.add(Mission(
      id: s.nextMissionId++,
      empireId: empire.id,
      kind: MissionKind.attack,
      originPlanetId: staging.id,
      targetPlanetId: best.id,
      fleet: force,
      arrivalTick: s.tick + engine.travelTicks(staging, best),
    ));
    if (best.ownerId == s.player.id) {
      s.log(
        'Long-range sensors detect a ${empire.name} fleet heading for '
        '${best.name} (${best.x},${best.y})!',
        important: true,
      );
    }
  }
}
