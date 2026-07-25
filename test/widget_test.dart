import 'package:dearde/main.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('shows the join-a-galaxy start screen', (tester) async {
    await tester.pumpWidget(const GalacticConflictApp());
    await tester.pumpAndSettle();

    expect(find.text('GALACTIC CONFLICT'), findsOneWidget);
    expect(find.text('Server address'), findsOneWidget);
    expect(find.text('Join the galaxy'), findsOneWidget);
    expect(find.text('Log in with an existing token'), findsOneWidget);
  });
}
