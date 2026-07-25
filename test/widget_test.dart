import 'package:dearde/main.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('shows new game screen, then the empire after founding',
      (tester) async {
    await tester.pumpWidget(const GalacticConflictApp());
    await tester.pumpAndSettle();

    expect(find.text('GALACTIC CONFLICT'), findsOneWidget);
    expect(find.text('Found your empire'), findsOneWidget);

    await tester.tap(find.text('Found your empire'));
    await tester.pump();

    // Home shell with bottom navigation appears.
    expect(find.text('Galaxy'), findsOneWidget);
    expect(find.text('Fleets'), findsOneWidget);
    expect(find.text('Terran Empire (you)'), findsOneWidget);
  });
}
