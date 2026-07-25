import 'dart:math';

import 'models.dart';

/// Outcome of a battle over a planet.
class BattleResult {
  BattleResult({
    required this.attackerWon,
    required this.captured,
    required this.survivingAttackers,
    required this.attackerLossRatio,
    required this.defenderLossRatio,
  });

  final bool attackerWon;
  final bool captured;
  final Fleet survivingAttackers;
  final double attackerLossRatio;
  final double defenderLossRatio;
}

/// Resolves fleet-vs-planet combat.
///
/// Attack power (scaled by the attacker's tech) is compared against the
/// planet's garrison defense plus structural defense (scaled by the
/// defender's tech). A small random swing keeps battles from being fully
/// predictable. Capturing requires winning AND having a transport survive.
class CombatEngine {
  CombatEngine(this._rng);

  final Random _rng;

  BattleResult resolve({
    required Fleet attackers,
    required Planet target,
    required double attackerTechBonus,
    required double defenderTechBonus,
  }) {
    final attackPower = attackers.attackPower * attackerTechBonus *
        (0.85 + _rng.nextDouble() * 0.3);
    final defensePower = (target.totalDefense + 40) * defenderTechBonus *
        (0.85 + _rng.nextDouble() * 0.3);

    final attackerWon = attackPower > defensePower;
    final ratio = attackPower / max(defensePower, 1.0);

    // Losses scale with how close the battle was.
    double attackerLossRatio;
    double defenderLossRatio;
    if (attackerWon) {
      attackerLossRatio = (0.65 / ratio).clamp(0.05, 0.65);
      defenderLossRatio = 1.0;
    } else {
      attackerLossRatio = 1.0;
      defenderLossRatio = (0.55 * ratio).clamp(0.05, 0.55);
    }

    final surviving = Fleet();
    if (attackerWon) {
      for (final e in attackers.ships.entries) {
        final losses = (e.value * attackerLossRatio).round();
        final left = e.value - losses;
        if (left > 0) surviving.add(e.key, left);
      }
    }

    // Apply defender losses to the garrison.
    final garrisonAfter = Fleet();
    if (!attackerWon) {
      for (final e in target.garrison.ships.entries) {
        final losses = (e.value * defenderLossRatio).round();
        final left = e.value - losses;
        if (left > 0) garrisonAfter.add(e.key, left);
      }
    }
    target.garrison = garrisonAfter;

    var captured = false;
    if (attackerWon) {
      if (surviving.count(ShipType.transport) > 0) {
        captured = true;
        // Bombardment and occupation cost the planet dearly.
        target.population = (target.population * 0.6).round();
        final stations = target.buildingCount(BuildingType.defenseStation);
        if (stations > 0) {
          target.buildings[BuildingType.defenseStation] =
              (stations * 0.4).floor();
          if (target.buildings[BuildingType.defenseStation] == 0) {
            target.buildings.remove(BuildingType.defenseStation);
          }
        }
      }
    }

    return BattleResult(
      attackerWon: attackerWon,
      captured: captured,
      survivingAttackers: surviving,
      attackerLossRatio: attackerLossRatio,
      defenderLossRatio: defenderLossRatio,
    );
  }
}
