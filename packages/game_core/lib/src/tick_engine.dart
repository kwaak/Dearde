import 'dart:math';

import 'models.dart';
import 'ai.dart';
import 'combat.dart';

/// Advances the game world one tick at a time: production, population,
/// mission arrivals, battles, AI turns, and victory/defeat checks.
class TickEngine {
  TickEngine({required int seed}) : _rng = Random(seed) {
    _combat = CombatEngine(_rng);
    _ai = AiPlayer(_rng);
  }

  final Random _rng;
  late final CombatEngine _combat;
  late final AiPlayer _ai;

  static const int foodPerFarm = 90;
  static const int orePerMine = 60;
  static const int creditsPerBank = 120;
  static const int researchPerLab = 25;
  static const int taxPerPop = 1; // credits per 10 pop, see below
  static const double popGrowthRate = 0.02;
  static const double popStarveRate = 0.05;
  static const int foodPerPop100 = 4; // food eaten per 100 population

  /// Ticks a fleet needs per map-distance unit.
  static const double ticksPerDistance = 1.0;

  CombatEngine get combat => _combat;

  void advance(GameState s) {
    s.tick++;

    for (final empire in s.empires.where((e) => !e.defeated)) {
      _produce(s, empire);
    }
    _arriveMissions(s);
    for (final empire in s.empires.where((e) => !e.defeated && !e.isPlayer)) {
      _ai.act(s, empire);
    }
    _checkEliminations(s);
  }

  void _produce(GameState s, Empire empire) {
    var credits = 0;
    var food = 0;
    var ore = 0;
    var research = 0;
    var upkeep = 0;

    for (final planet in s.planetsOf(empire.id)) {
      food += (planet.buildingCount(BuildingType.farm) *
              foodPerFarm *
              empire.techBonus)
          .round();
      ore += (planet.buildingCount(BuildingType.mine) *
              orePerMine *
              empire.techBonus)
          .round();
      credits += (planet.buildingCount(BuildingType.bank) *
              creditsPerBank *
              empire.techBonus)
          .round();
      research += (planet.buildingCount(BuildingType.lab) *
              researchPerLab *
              empire.techBonus)
          .round();
      credits += planet.population ~/ 10 * taxPerPop;
      food -= planet.population * foodPerPop100 ~/ 100;
      upkeep += planet.garrison.upkeep;
    }
    for (final m in s.missions.where((m) => m.empireId == empire.id)) {
      upkeep += m.fleet.upkeep;
    }

    empire.credits = max(0, empire.credits + credits - upkeep);
    empire.ore += ore;
    empire.food += food;
    empire.research += research;

    // Population grows when fed, starves when the granary is empty.
    final starving = empire.food < 0;
    if (starving) empire.food = 0;
    for (final planet in s.planetsOf(empire.id)) {
      if (starving) {
        planet.population =
            max(0, (planet.population * (1 - popStarveRate)).floor());
      } else if (planet.population < planet.maxPopulation) {
        final growth = max(1, (planet.population * popGrowthRate).floor());
        planet.population =
            min(planet.maxPopulation, planet.population + growth);
      }
    }
    // Throttled so an ongoing famine doesn't flood the news feed.
    if (starving && empire.isPlayer && s.tick % 5 == 0) {
      s.log('Famine strikes ${empire.name} — the population is starving!',
          important: true);
    }

    // Automatic tech progression.
    while (empire.research >= empire.nextTechCost) {
      empire.research -= empire.nextTechCost;
      empire.techLevel++;
      if (empire.isPlayer) {
        s.log(
            '${empire.name} achieved a research breakthrough: technology '
            'level ${empire.techLevel}.',
            important: true);
      }
    }
  }

  void _arriveMissions(GameState s) {
    final arrived = s.missions.where((m) => m.arrivalTick <= s.tick).toList();
    for (final mission in arrived) {
      s.missions.remove(mission);
      final empire = s.empireById(mission.empireId);
      if (empire == null || empire.defeated) continue;

      if (mission.returning) {
        _landFleet(s, mission, mission.originPlanetId);
        continue;
      }

      final target = s.planetById(mission.targetPlanetId);
      switch (mission.kind) {
        case MissionKind.transfer:
          if (target.ownerId == mission.empireId) {
            target.garrison.merge(mission.fleet);
          } else {
            // Destination lost while in transit: head home.
            _sendBack(s, mission);
          }
        case MissionKind.attack:
          if (target.ownerId == mission.empireId) {
            target.garrison.merge(mission.fleet);
            break;
          }
          _resolveAttack(s, mission, empire, target);
      }
    }
  }

  void _resolveAttack(
      GameState s, Mission mission, Empire attacker, Planet target) {
    final defender = s.empireById(target.ownerId);
    final result = _combat.resolve(
      attackers: mission.fleet,
      target: target,
      attackerTechBonus: attacker.techBonus,
      defenderTechBonus: defender?.techBonus ?? 1.0,
    );

    final targetLabel = '${target.name} (${target.x},${target.y})';
    final anyHuman = attacker.isPlayer || (defender?.isPlayer ?? false);
    if (result.captured) {
      target.ownerId = attacker.id;
      target.garrison = result.survivingAttackers;
      s.log(
          '${attacker.name} captured $targetLabel'
          '${defender != null ? ' from ${defender.name}' : ''}!',
          important: anyHuman);
    } else if (result.attackerWon) {
      // Won the battle but no transports left to occupy: survivors return.
      mission.fleet
        ..ships.clear()
        ..merge(result.survivingAttackers);
      if (mission.fleet.isEmpty) {
        return;
      }
      _sendBack(s, mission);
      if (attacker.isPlayer) {
        s.log(
            "${attacker.name}'s fleet won at $targetLabel but had no "
            'transports left to occupy it. Survivors are returning.',
            important: true);
      }
    } else {
      s.log(
          "${attacker.name}'s attack on $targetLabel was repelled"
          '${defender != null ? ' by ${defender.name}' : ''}.',
          important: anyHuman);
    }
  }

  void _sendBack(GameState s, Mission mission) {
    final origin = s.planetById(mission.originPlanetId);
    final target = s.planetById(mission.targetPlanetId);
    final travel = travelTicks(origin, target);
    s.missions.add(Mission(
      id: s.nextMissionId++,
      empireId: mission.empireId,
      kind: mission.kind,
      originPlanetId: mission.originPlanetId,
      targetPlanetId: mission.targetPlanetId,
      fleet: mission.fleet,
      arrivalTick: s.tick + travel,
      returning: true,
    ));
  }

  void _landFleet(GameState s, Mission mission, int planetId) {
    final planet = s.planetById(planetId);
    if (planet.ownerId == mission.empireId) {
      planet.garrison.merge(mission.fleet);
      return;
    }
    // Home planet lost too: land at any owned planet, or disband.
    final fallback = s.planetsOf(mission.empireId).toList();
    if (fallback.isNotEmpty) {
      fallback.first.garrison.merge(mission.fleet);
    }
  }

  void _checkEliminations(GameState s) {
    for (final empire in s.empires.where((e) => !e.defeated)) {
      final hasPlanets = s.planetsOf(empire.id).isNotEmpty;
      final hasMissions = s.missions.any((m) => m.empireId == empire.id);
      if (!hasPlanets && !hasMissions) {
        empire.defeated = true;
        s.log('${empire.name} has been eliminated from the galaxy!',
            important: true);
      }
    }
  }

  /// Static so clients can compute travel times without an engine instance.
  static int travelTicks(Planet a, Planet b) =>
      max(1, (a.distanceTo(b) * ticksPerDistance).ceil());
}
