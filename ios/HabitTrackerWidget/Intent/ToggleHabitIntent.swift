import AppIntents
import WidgetKit

/// Model A: Directly updates the widget snapshot in App Group UserDefaults (flip isCompletedToday), then reloads timelines.
struct ToggleHabitIntent: AppIntent {
    static var title: LocalizedStringResource = "Toggle habit"
    static var description = IntentDescription("Mark habit complete or incomplete for today.")

    @Parameter(title: "Habit ID")
    var habitId: String

    init(habitId: String) {
        self.habitId = habitId
    }

    init() {
        self.habitId = ""
    }

    func perform() async throws -> some IntentResult {
        guard var payload = WidgetPayloadStorage.read() else { return .result() }
        if let index = payload.habits.firstIndex(where: { $0.id == habitId }) {
            payload.habits[index].isCompletedToday.toggle()
            WidgetPayloadStorage.write(payload)
            WidgetCenter.shared.reloadTimelines(ofKind: "HabitWidget")
        }
        return .result()
    }
}
