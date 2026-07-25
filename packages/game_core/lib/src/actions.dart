import 'models.dart';
import 'rules.dart';
import 'tick_engine.dart';

/// Validated player actions, shared by the local game and the multiplayer
/// server. Each returns null on success or a human-readable error.
class GameActions {
  static String? build(
      GameState s, Empire empire, Planet planet, BuildingType type) {
    if (planet.ownerId != empire.id) return 'Not your planet.';
    if (planet.freeSlots <= 0) return 'No free building slots left.';
    if (!GameRules.canAfford(empire, type)) {
      return 'Not enough credits or ore.';
    }
    final cost = GameRules.buildingCosts[type]!;
    empire.credits -= cost.credits;
    empire.ore -= cost.ore;
    planet.buildings[type] = planet.buildingCount(type) + 1;
    return null;
  }

  static String? trainShips(
      GameState s, Empire empire, Planet planet, ShipType type, int count) {
    if (planet.ownerId != empire.id) return 'Not your planet.';
    if (count <= 0) return 'Nothing to build.';
    if (!GameRules.canAffordShip(empire, type, count)) {
      return 'Not enough credits or ore.';
    }
    empire.credits -= type.cost * count;
    empire.ore -= type.oreCost * count;
    planet.garrison.add(type, count);
    return null;
  }

  static String? launchMission(
    GameState s,
    Empire empire, {
    required Planet origin,
    required Planet target,
    required Fleet fleet,
    required MissionKind kind,
  }) {
    if (origin.ownerId != empire.id) return 'Origin is not your planet.';
    if (origin.id == target.id) return 'Origin and target are the same.';
    if (fleet.isEmpty) return 'Select at least one ship.';
    if (!origin.garrison.contains(fleet)) {
      return 'The garrison does not have those ships.';
    }
    if (kind == MissionKind.attack && target.ownerId == empire.id) {
      return 'You cannot attack your own planet.';
    }
    if (kind == MissionKind.transfer && target.ownerId != empire.id) {
      return 'You can only transfer between your own planets.';
    }
    if (kind == MissionKind.attack && fleet.count(ShipType.transport) == 0) {
      return 'Attacks need at least one Transport to occupy the planet.';
    }

    origin.garrison.subtract(fleet);
    final travel = TickEngine.travelTicks(origin, target);
    s.missions.add(Mission(
      id: s.nextMissionId++,
      empireId: empire.id,
      kind: kind,
      originPlanetId: origin.id,
      targetPlanetId: target.id,
      fleet: fleet,
      arrivalTick: s.tick + travel,
    ));
    s.log(kind == MissionKind.attack
        ? '${empire.name} launched an attack fleet from ${origin.name} '
            'towards ${target.name}.'
        : '${empire.name} launched a transfer from ${origin.name} to '
            '${target.name}.');
    return null;
  }
}
