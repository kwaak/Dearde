import 'dart:math';

/// Building types available on a planet.
enum BuildingType {
  livingQuarters('Living Quarters', 'Houses 500 population each.'),
  farm('Farm', 'Feeds your people. Produces 90 food per tick.'),
  mine('Ore Mine', 'Extracts 60 ore per tick.'),
  bank('Cash Factory', 'Generates 120 credits per tick.'),
  lab('Research Lab', 'Produces 25 research points per tick.'),
  defenseStation('Defense Station', 'Adds 150 defense power to the planet.');

  const BuildingType(this.label, this.blurb);
  final String label;
  final String blurb;
}

/// Ship classes, loosely modeled on classic persistent browser war games.
enum ShipType {
  fighter('Fighter', attack: 10, defense: 6, cost: 180, oreCost: 40, upkeep: 1),
  bomber('Bomber', attack: 25, defense: 8, cost: 450, oreCost: 120, upkeep: 2),
  transport('Transport', attack: 1, defense: 12, cost: 300, oreCost: 80, upkeep: 1),
  dreadnought('Dreadnought',
      attack: 90, defense: 70, cost: 2200, oreCost: 700, upkeep: 6);

  const ShipType(this.label,
      {required this.attack,
      required this.defense,
      required this.cost,
      required this.oreCost,
      required this.upkeep});

  final String label;
  final int attack;
  final int defense;
  final int cost; // credits
  final int oreCost;
  final int upkeep; // credits per tick
}

/// A fleet composition: ship type -> count.
class Fleet {
  Fleet([Map<ShipType, int>? ships]) : ships = Map.of(ships ?? {});

  final Map<ShipType, int> ships;

  int count(ShipType t) => ships[t] ?? 0;

  void add(ShipType t, int n) {
    if (n == 0) return;
    ships[t] = (ships[t] ?? 0) + n;
    if (ships[t]! <= 0) ships.remove(t);
  }

  bool get isEmpty => totalShips == 0;

  int get totalShips => ships.values.fold(0, (a, b) => a + b);

  int get attackPower =>
      ships.entries.fold(0, (a, e) => a + e.key.attack * e.value);

  int get defensePower =>
      ships.entries.fold(0, (a, e) => a + e.key.defense * e.value);

  int get upkeep => ships.entries.fold(0, (a, e) => a + e.key.upkeep * e.value);

  bool contains(Fleet other) =>
      other.ships.entries.every((e) => count(e.key) >= e.value);

  void subtract(Fleet other) {
    for (final e in other.ships.entries) {
      add(e.key, -e.value);
    }
  }

  void merge(Fleet other) {
    for (final e in other.ships.entries) {
      add(e.key, e.value);
    }
  }

  Fleet copy() => Fleet(ships);

  Map<String, dynamic> toJson() =>
      ships.map((k, v) => MapEntry(k.name, v));

  static Fleet fromJson(Map<String, dynamic> json) => Fleet({
        for (final e in json.entries)
          ShipType.values.byName(e.key): (e.value as num).toInt()
      });
}

/// A planet on the galaxy map.
class Planet {
  Planet({
    required this.id,
    required this.name,
    required this.x,
    required this.y,
    required this.size,
    this.ownerId,
    Map<BuildingType, int>? buildings,
    this.population = 0,
    Fleet? garrison,
  })  : buildings = Map.of(buildings ?? {}),
        garrison = garrison ?? Fleet();

  final int id;
  final String name;
  final int x;
  final int y;

  /// Maximum total number of buildings.
  final int size;

  int? ownerId;
  final Map<BuildingType, int> buildings;
  int population;
  Fleet garrison;

  int buildingCount(BuildingType t) => buildings[t] ?? 0;

  int get totalBuildings => buildings.values.fold(0, (a, b) => a + b);

  int get freeSlots => size - totalBuildings;

  int get maxPopulation => buildingCount(BuildingType.livingQuarters) * 500;

  int get structuralDefense =>
      buildingCount(BuildingType.defenseStation) * 150;

  int get totalDefense => structuralDefense + garrison.defensePower;

  double distanceTo(Planet other) {
    final dx = (x - other.x).toDouble();
    final dy = (y - other.y).toDouble();
    return sqrt(dx * dx + dy * dy);
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'x': x,
        'y': y,
        'size': size,
        'ownerId': ownerId,
        'buildings': buildings.map((k, v) => MapEntry(k.name, v)),
        'population': population,
        'garrison': garrison.toJson(),
      };

  static Planet fromJson(Map<String, dynamic> json) => Planet(
        id: json['id'] as int,
        name: json['name'] as String,
        x: json['x'] as int,
        y: json['y'] as int,
        size: json['size'] as int,
        ownerId: json['ownerId'] as int?,
        buildings: {
          for (final e in (json['buildings'] as Map<String, dynamic>).entries)
            BuildingType.values.byName(e.key): (e.value as num).toInt()
        },
        population: (json['population'] as num).toInt(),
        garrison: Fleet.fromJson(json['garrison'] as Map<String, dynamic>),
      );
}

/// An empire: the player or an AI rival.
class Empire {
  Empire({
    required this.id,
    required this.name,
    required this.color,
    this.isPlayer = false,
    this.credits = 0,
    this.food = 0,
    this.ore = 0,
    this.research = 0,
    this.techLevel = 0,
    this.defeated = false,
  });

  final int id;
  final String name;

  /// ARGB color value used on the map.
  final int color;
  final bool isPlayer;

  int credits;
  int food;
  int ore;
  int research;
  int techLevel;
  bool defeated;

  /// Production/combat multiplier from technology: +5% per level.
  double get techBonus => 1.0 + techLevel * 0.05;

  /// Research points needed for the next tech level.
  int get nextTechCost => 500 * (techLevel + 1) * (techLevel + 1);

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'color': color,
        'isPlayer': isPlayer,
        'credits': credits,
        'food': food,
        'ore': ore,
        'research': research,
        'techLevel': techLevel,
        'defeated': defeated,
      };

  static Empire fromJson(Map<String, dynamic> json) => Empire(
        id: json['id'] as int,
        name: json['name'] as String,
        color: json['color'] as int,
        isPlayer: json['isPlayer'] as bool,
        credits: (json['credits'] as num).toInt(),
        food: (json['food'] as num).toInt(),
        ore: (json['ore'] as num).toInt(),
        research: (json['research'] as num).toInt(),
        techLevel: (json['techLevel'] as num).toInt(),
        defeated: json['defeated'] as bool? ?? false,
      );
}

enum MissionKind { attack, transfer }

/// A fleet in transit between planets.
class Mission {
  Mission({
    required this.id,
    required this.empireId,
    required this.kind,
    required this.originPlanetId,
    required this.targetPlanetId,
    required this.fleet,
    required this.arrivalTick,
    this.returning = false,
  });

  final int id;
  final int empireId;
  final MissionKind kind;
  final int originPlanetId;
  final int targetPlanetId;
  final Fleet fleet;
  int arrivalTick;
  bool returning;

  Map<String, dynamic> toJson() => {
        'id': id,
        'empireId': empireId,
        'kind': kind.name,
        'originPlanetId': originPlanetId,
        'targetPlanetId': targetPlanetId,
        'fleet': fleet.toJson(),
        'arrivalTick': arrivalTick,
        'returning': returning,
      };

  static Mission fromJson(Map<String, dynamic> json) => Mission(
        id: json['id'] as int,
        empireId: json['empireId'] as int,
        kind: MissionKind.values.byName(json['kind'] as String),
        originPlanetId: json['originPlanetId'] as int,
        targetPlanetId: json['targetPlanetId'] as int,
        fleet: Fleet.fromJson(json['fleet'] as Map<String, dynamic>),
        arrivalTick: (json['arrivalTick'] as num).toInt(),
        returning: json['returning'] as bool? ?? false,
      );
}

/// A news/event log entry.
class GameEvent {
  GameEvent({required this.tick, required this.message, this.important = false});

  final int tick;
  final String message;
  final bool important;

  Map<String, dynamic> toJson() =>
      {'tick': tick, 'message': message, 'important': important};

  static GameEvent fromJson(Map<String, dynamic> json) => GameEvent(
        tick: (json['tick'] as num).toInt(),
        message: json['message'] as String,
        important: json['important'] as bool? ?? false,
      );
}

/// The whole game world.
class GameState {
  GameState({
    required this.seed,
    required this.tick,
    required this.lastTickWallClockMs,
    required this.empires,
    required this.planets,
    required this.missions,
    required this.events,
    this.nextMissionId = 1,
  });

  final int seed;
  int tick;

  /// Wall-clock time (ms since epoch) of the last processed tick, used for
  /// offline catch-up.
  int lastTickWallClockMs;

  final List<Empire> empires;
  final List<Planet> planets;
  final List<Mission> missions;
  final List<GameEvent> events;
  int nextMissionId;

  Empire get player => empires.firstWhere((e) => e.isPlayer);

  Empire? empireById(int? id) {
    if (id == null) return null;
    for (final e in empires) {
      if (e.id == id) return e;
    }
    return null;
  }

  Planet planetById(int id) => planets.firstWhere((p) => p.id == id);

  Iterable<Planet> planetsOf(int empireId) =>
      planets.where((p) => p.ownerId == empireId);

  void log(String message, {bool important = false}) {
    events.insert(0, GameEvent(tick: tick, message: message, important: important));
    if (events.length > 200) {
      events.removeRange(200, events.length);
    }
  }

  Map<String, dynamic> toJson() => {
        'version': 1,
        'seed': seed,
        'tick': tick,
        'lastTickWallClockMs': lastTickWallClockMs,
        'empires': empires.map((e) => e.toJson()).toList(),
        'planets': planets.map((p) => p.toJson()).toList(),
        'missions': missions.map((m) => m.toJson()).toList(),
        'events': events.map((e) => e.toJson()).toList(),
        'nextMissionId': nextMissionId,
      };

  static GameState fromJson(Map<String, dynamic> json) => GameState(
        seed: (json['seed'] as num).toInt(),
        tick: (json['tick'] as num).toInt(),
        lastTickWallClockMs: (json['lastTickWallClockMs'] as num).toInt(),
        empires: (json['empires'] as List)
            .map((e) => Empire.fromJson(e as Map<String, dynamic>))
            .toList(),
        planets: (json['planets'] as List)
            .map((p) => Planet.fromJson(p as Map<String, dynamic>))
            .toList(),
        missions: (json['missions'] as List)
            .map((m) => Mission.fromJson(m as Map<String, dynamic>))
            .toList(),
        events: (json['events'] as List)
            .map((e) => GameEvent.fromJson(e as Map<String, dynamic>))
            .toList(),
        nextMissionId: (json['nextMissionId'] as num?)?.toInt() ?? 1,
      );
}
