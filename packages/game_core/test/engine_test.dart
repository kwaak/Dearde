import 'dart:convert';
import 'dart:math';

import 'package:game_core/game_core.dart';
import 'package:test/test.dart';

void main() {
  group('GalaxyGenerator', () {
    test('creates a galaxy with 4 empires and homeworlds', () {
      final s = GalaxyGenerator.generate(seed: 42, playerName: 'Testers');
      expect(s.empires.length, 4);
      expect(s.empires.where((e) => e.isPlayer).length, 1);
      expect(s.player.name, 'Testers');
      for (final e in s.empires) {
        expect(s.planetsOf(e.id).length, 1,
            reason: 'each empire starts with one homeworld');
      }
      expect(s.planets.length, 4 + 32);
      // No two planets share coordinates.
      final coords = s.planets.map((p) => '${p.x},${p.y}').toSet();
      expect(coords.length, s.planets.length);
    });

    test('is deterministic for the same seed', () {
      final a = GalaxyGenerator.generate(seed: 7, playerName: 'A');
      final b = GalaxyGenerator.generate(seed: 7, playerName: 'A');
      expect(jsonEncode(a.toJson()), jsonEncode(b.toJson()));
    });

    test('spawnEmpire adds empires dynamically without collisions', () {
      final s = GalaxyGenerator.generateEmpty(seed: 3, neutralCount: 10);
      for (var i = 0; i < 6; i++) {
        GalaxyGenerator.spawnEmpire(s, name: 'Player $i', isHuman: true);
      }
      expect(s.empires.length, 6);
      expect(s.planets.length, 16);
      final coords = s.planets.map((p) => '${p.x},${p.y}').toSet();
      expect(coords.length, s.planets.length);
      final ids = s.empires.map((e) => e.id).toSet();
      expect(ids.length, 6);
    });
  });

  group('viewer perspective', () {
    test('player getter follows viewerEmpireId', () {
      final s = GalaxyGenerator.generateEmpty(seed: 9, neutralCount: 4);
      GalaxyGenerator.spawnEmpire(s, name: 'Alice', isHuman: true);
      final bob = GalaxyGenerator.spawnEmpire(s, name: 'Bob', isHuman: true);
      s.viewerEmpireId = bob.id;
      expect(s.player.name, 'Bob');

      final restored = GameState.fromJson(
          jsonDecode(jsonEncode(s.toJson())) as Map<String, dynamic>);
      expect(restored.player.name, 'Bob');
    });
  });

  group('TickEngine production', () {
    test('produces resources and grows population', () {
      final s = GalaxyGenerator.generate(seed: 1, playerName: 'P');
      final engine = TickEngine(seed: 1);
      final player = s.player;
      final home = s.planetsOf(player.id).first;

      final creditsBefore = player.credits;
      final oreBefore = player.ore;
      final popBefore = home.population;

      engine.advance(s);

      expect(s.tick, 1);
      expect(player.credits, greaterThan(creditsBefore));
      expect(player.ore, greaterThan(oreBefore));
      expect(home.population, greaterThan(popBefore));
    });

    test('starvation shrinks population when food runs out', () {
      final s = GalaxyGenerator.generate(seed: 1, playerName: 'P');
      final engine = TickEngine(seed: 1);
      final player = s.player;
      final home = s.planetsOf(player.id).first;
      player.food = 0;
      home.buildings.remove(BuildingType.farm);
      home.population = 5000;

      engine.advance(s);

      expect(home.population, lessThan(5000));
      expect(player.food, 0);
    });

    test('tech level rises when research accumulates', () {
      final s = GalaxyGenerator.generate(seed: 1, playerName: 'P');
      final engine = TickEngine(seed: 1);
      s.player.research = s.player.nextTechCost;
      engine.advance(s);
      expect(s.player.techLevel, 1);
    });
  });

  group('CombatEngine', () {
    test('overwhelming force with transports captures the planet', () {
      final combat = CombatEngine(Random(3));
      final target = Planet(
          id: 99, name: 'Target', x: 0, y: 0, size: 10, population: 200);
      target.garrison.add(ShipType.fighter, 2);

      final attackers = Fleet({
        ShipType.dreadnought: 20,
        ShipType.transport: 3,
      });

      final result = combat.resolve(
        attackers: attackers,
        target: target,
        attackerTechBonus: 1.0,
        defenderTechBonus: 1.0,
      );

      expect(result.attackerWon, isTrue);
      expect(result.captured, isTrue);
      expect(result.survivingAttackers.totalShips, greaterThan(0));
    });

    test('attack without transports cannot capture', () {
      final combat = CombatEngine(Random(3));
      final target = Planet(
          id: 99, name: 'Target', x: 0, y: 0, size: 10, population: 200);

      final result = combat.resolve(
        attackers: Fleet({ShipType.dreadnought: 20}),
        target: target,
        attackerTechBonus: 1.0,
        defenderTechBonus: 1.0,
      );

      expect(result.attackerWon, isTrue);
      expect(result.captured, isFalse);
    });

    test('tiny force loses against a defended planet', () {
      final combat = CombatEngine(Random(3));
      final target = Planet(
          id: 99, name: 'Target', x: 0, y: 0, size: 10, population: 200);
      target.buildings[BuildingType.defenseStation] = 5;
      target.garrison.add(ShipType.fighter, 50);

      final result = combat.resolve(
        attackers: Fleet({ShipType.fighter: 1, ShipType.transport: 1}),
        target: target,
        attackerTechBonus: 1.0,
        defenderTechBonus: 1.0,
      );

      expect(result.attackerWon, isFalse);
      expect(result.captured, isFalse);
    });
  });

  group('Missions', () {
    test('attack mission travels, resolves, and can capture', () {
      final s = GalaxyGenerator.generate(seed: 5, playerName: 'P');
      final engine = TickEngine(seed: 5);
      final player = s.player;
      final home = s.planetsOf(player.id).first;

      // A neutral target.
      final target = s.planets.firstWhere((p) => p.ownerId == null);
      target.garrison.ships.clear();
      target.buildings.remove(BuildingType.defenseStation);

      final force = Fleet({
        ShipType.dreadnought: 30,
        ShipType.transport: 5,
      });
      final travel = TickEngine.travelTicks(home, target);
      s.missions.add(Mission(
        id: s.nextMissionId++,
        empireId: player.id,
        kind: MissionKind.attack,
        originPlanetId: home.id,
        targetPlanetId: target.id,
        fleet: force,
        arrivalTick: s.tick + travel,
      ));

      for (var i = 0; i < travel; i++) {
        engine.advance(s);
      }

      expect(target.ownerId, player.id,
          reason: 'overwhelming fleet should capture an undefended planet');
    });
  });

  group('Persistence', () {
    test('GameState JSON roundtrip preserves the world', () {
      final s = GalaxyGenerator.generate(seed: 11, playerName: 'Saver');
      final engine = TickEngine(seed: 11);
      for (var i = 0; i < 10; i++) {
        engine.advance(s);
      }
      final encoded = jsonEncode(s.toJson());
      final restored =
          GameState.fromJson(jsonDecode(encoded) as Map<String, dynamic>);
      expect(jsonEncode(restored.toJson()), encoded);
      expect(restored.tick, s.tick);
      expect(restored.planets.length, s.planets.length);
      expect(restored.player.name, 'Saver');
    });
  });
}
