import 'models.dart';

/// Static price list and shared game rules.
class GameRules {
  static const Map<BuildingType, ({int credits, int ore})> buildingCosts = {
    BuildingType.livingQuarters: (credits: 600, ore: 100),
    BuildingType.farm: (credits: 400, ore: 80),
    BuildingType.mine: (credits: 500, ore: 60),
    BuildingType.bank: (credits: 800, ore: 150),
    BuildingType.lab: (credits: 1000, ore: 200),
    BuildingType.defenseStation: (credits: 700, ore: 250),
  };

  static bool canAfford(Empire e, BuildingType t) {
    final cost = buildingCosts[t]!;
    return e.credits >= cost.credits && e.ore >= cost.ore;
  }

  static bool canAffordShip(Empire e, ShipType t, int count) =>
      e.credits >= t.cost * count && e.ore >= t.oreCost * count;

  /// Fraction of all planets one empire must own to win.
  static const double victoryShare = 0.6;
}
