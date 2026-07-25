import 'dart:math';

import 'models.dart';

/// Creates galaxies and spawns empires into them. Used both by the local
/// single-player game (player + AI rivals) and by the multiplayer server
/// (empires join dynamically as players register).
class GalaxyGenerator {
  static const int mapSize = 20;

  static const List<String> planetNames = [
    'Aldera', 'Borealis', 'Cygnus', 'Draconis', 'Erebus', 'Fenrir',
    'Gorgon', 'Hyperion', 'Icarus', 'Juno', 'Kepler', 'Lyra',
    'Meridian', 'Nyx', 'Oberon', 'Proxima', 'Quasar', 'Rigel',
    'Sirius', 'Tethys', 'Umbra', 'Vega', 'Wraith', 'Xanadu',
    'Ymir', 'Zephyr', 'Antares', 'Bellatrix', 'Castor', 'Deneb',
    'Electra', 'Fomalhaut', 'Gemma', 'Helios', 'Izar', 'Jorund',
    'Kraken', 'Lucida', 'Mira', 'Naos', 'Orion', 'Polaris',
    'Rana', 'Spica', 'Talitha', 'Ursa', 'Vindemiatrix', 'Wezen',
  ];

  static const List<String> rivalNames = [
    'Zorn Dominion',
    'Krell Hegemony',
    'Vashta Collective',
  ];

  /// Color palette cycled through as empires are created.
  static const List<int> empireColors = [
    0xFF4FA8E8, // blue
    0xFFE05545, // red
    0xFFC98A2B, // amber
    0xFFAF5FD0, // purple
    0xFF3FBF7F, // green
    0xFFE86FA8, // pink
    0xFF5FD0C9, // teal
    0xFFB0B84F, // olive
  ];

  /// Local single-player galaxy: the player plus three AI rivals.
  static GameState generate({required int seed, required String playerName}) {
    final state = generateEmpty(seed: seed, neutralCount: 32);
    final player = spawnEmpire(state, name: playerName, isHuman: true);
    state.viewerEmpireId = player.id;
    for (final name in rivalNames) {
      spawnEmpire(state, name: name, isHuman: false);
    }
    state.log(
      'Your empire rises on ${state.planetsOf(player.id).first.name}. '
      'Expand, build, and rule the galaxy!',
      important: true,
    );
    return state;
  }

  /// A galaxy with only neutral worlds; empires join via [spawnEmpire].
  static GameState generateEmpty({required int seed, int neutralCount = 32}) {
    final rng = Random(seed);
    final names = List.of(planetNames)..shuffle(rng);
    final planets = <Planet>[];
    final used = <Point<int>>{};

    Point<int> freeSpot() {
      while (true) {
        final p = Point(rng.nextInt(mapSize), rng.nextInt(mapSize));
        if (used.add(p)) return p;
      }
    }

    for (var i = 0; i < neutralCount; i++) {
      final spot = freeSpot();
      final planet = Planet(
        id: i + 1,
        name: names[i % names.length],
        x: spot.x,
        y: spot.y,
        size: 10 + rng.nextInt(13),
      );
      planet.population = 100 + rng.nextInt(400);
      planet.buildings[BuildingType.livingQuarters] = 1 + rng.nextInt(2);
      if (rng.nextBool()) {
        planet.buildings[BuildingType.farm] = 1;
      }
      final stations = rng.nextInt(3);
      if (stations > 0) {
        planet.buildings[BuildingType.defenseStation] = stations;
      }
      planet.garrison.add(ShipType.fighter, rng.nextInt(12));
      planets.add(planet);
    }

    return GameState(
      seed: seed,
      tick: 0,
      lastTickWallClockMs: 0,
      empires: [],
      planets: planets,
      missions: [],
      events: [],
    );
  }

  /// Adds a new empire with a developed homeworld on a free map spot.
  ///
  /// [isHuman] marks empires controlled by people (the engine's AI only
  /// steers non-human empires).
  static Empire spawnEmpire(GameState state,
      {required String name, required bool isHuman}) {
    final id = state.empires.isEmpty
        ? 1
        : state.empires.map((e) => e.id).reduce(max) + 1;
    final empire = Empire(
      id: id,
      name: name,
      color: empireColors[(id - 1) % empireColors.length],
      isPlayer: isHuman,
      credits: 5000,
      food: 3000,
      ore: 1500,
    );
    state.empires.add(empire);

    // Deterministic-but-varied placement derived from the galaxy seed and
    // empire id, so repeated generation stays reproducible.
    final rng = Random(state.seed ^ (id * 7919));
    final used = state.planets.map((p) => Point(p.x, p.y)).toSet();
    Point<int> spot;
    do {
      spot = Point(rng.nextInt(mapSize), rng.nextInt(mapSize));
    } while (used.contains(spot));

    final planetId = state.planets.isEmpty
        ? 1
        : state.planets.map((p) => p.id).reduce(max) + 1;
    final home = Planet(
      id: planetId,
      name: planetNames[(planetId - 1) % planetNames.length],
      x: spot.x,
      y: spot.y,
      size: 24,
      ownerId: empire.id,
    );
    home.buildings[BuildingType.livingQuarters] = 4;
    home.buildings[BuildingType.farm] = 4;
    home.buildings[BuildingType.mine] = 2;
    home.buildings[BuildingType.bank] = 2;
    home.buildings[BuildingType.lab] = 1;
    home.buildings[BuildingType.defenseStation] = 2;
    home.population = 1200;
    home.garrison.add(ShipType.fighter, 20);
    home.garrison.add(ShipType.transport, 4);
    state.planets.add(home);

    state.log('$name has founded an empire on ${home.name} '
        '(${home.x},${home.y}).');
    return empire;
  }
}
