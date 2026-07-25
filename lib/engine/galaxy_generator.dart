import 'dart:math';

import '../models/models.dart';

/// Creates a fresh galaxy with the player, AI rivals, and neutral worlds.
class GalaxyGenerator {
  static const int mapSize = 20;

  static const List<String> _planetNames = [
    'Aldera', 'Borealis', 'Cygnus', 'Draconis', 'Erebus', 'Fenrir',
    'Gorgon', 'Hyperion', 'Icarus', 'Juno', 'Kepler', 'Lyra',
    'Meridian', 'Nyx', 'Oberon', 'Proxima', 'Quasar', 'Rigel',
    'Sirius', 'Tethys', 'Umbra', 'Vega', 'Wraith', 'Xanadu',
    'Ymir', 'Zephyr', 'Antares', 'Bellatrix', 'Castor', 'Deneb',
    'Electra', 'Fomalhaut', 'Gemma', 'Helios', 'Izar', 'Jorund',
    'Kraken', 'Lucida', 'Mira', 'Naos', 'Orion', 'Polaris',
    'Rana', 'Spica', 'Talitha', 'Ursa', 'Vindemiatrix', 'Wezen',
  ];

  static const List<String> _rivalNames = [
    'Zorn Dominion',
    'Krell Hegemony',
    'Vashta Collective',
  ];

  static const List<int> _rivalColors = [
    0xFFE05545, // red
    0xFFC98A2B, // amber
    0xFFAF5FD0, // purple
  ];

  static GameState generate({required int seed, required String playerName}) {
    final rng = Random(seed);

    final empires = <Empire>[
      Empire(
        id: 1,
        name: playerName,
        color: 0xFF4FA8E8,
        isPlayer: true,
        credits: 5000,
        food: 3000,
        ore: 1500,
      ),
      for (var i = 0; i < _rivalNames.length; i++)
        Empire(
          id: 2 + i,
          name: _rivalNames[i],
          color: _rivalColors[i],
          credits: 5000,
          food: 3000,
          ore: 1500,
        ),
    ];

    final names = List.of(_planetNames)..shuffle(rng);
    final planets = <Planet>[];
    final used = <Point<int>>{};

    Point<int> freeSpot() {
      while (true) {
        final p = Point(rng.nextInt(mapSize), rng.nextInt(mapSize));
        if (used.add(p)) return p;
      }
    }

    var id = 1;
    Planet makePlanet({int? ownerId, required int size}) {
      final spot = freeSpot();
      final planet = Planet(
        id: id,
        name: names[(id - 1) % names.length],
        x: spot.x,
        y: spot.y,
        size: size,
        ownerId: ownerId,
      );
      id++;
      planets.add(planet);
      return planet;
    }

    // One developed homeworld per empire.
    for (final empire in empires) {
      final home = makePlanet(ownerId: empire.id, size: 24);
      home.buildings[BuildingType.livingQuarters] = 4;
      home.buildings[BuildingType.farm] = 4;
      home.buildings[BuildingType.mine] = 2;
      home.buildings[BuildingType.bank] = 2;
      home.buildings[BuildingType.lab] = 1;
      home.buildings[BuildingType.defenseStation] = 2;
      home.population = 1200;
      home.garrison.add(ShipType.fighter, 20);
      home.garrison.add(ShipType.transport, 4);
    }

    // Neutral worlds with light defenses, ripe for conquest.
    const neutralCount = 32;
    for (var i = 0; i < neutralCount; i++) {
      final planet = makePlanet(size: 10 + rng.nextInt(13));
      planet.population = 100 + rng.nextInt(400);
      planet.buildings[BuildingType.livingQuarters] = 1 + rng.nextInt(2);
      if (rng.nextBool()) {
        planet.buildings[BuildingType.farm] = 1;
      }
      planet.buildings[BuildingType.defenseStation] = rng.nextInt(3);
      planet.garrison.add(ShipType.fighter, rng.nextInt(12));
    }

    final state = GameState(
      seed: seed,
      tick: 0,
      lastTickWallClockMs: 0,
      empires: empires,
      planets: planets,
      missions: [],
      events: [],
    );
    state.log(
      'Your empire rises on ${planets.first.name}. Expand, build, and rule the galaxy!',
      important: true,
    );
    return state;
  }
}
