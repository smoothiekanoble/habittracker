import Foundation
import SwiftData
import WidgetKit

/// Builds the denormalized widget snapshot from SwiftData and writes it to App Group.
struct WidgetPayloadBuilder {

    static func refreshSnapshot(modelContext: ModelContext) {
        let payload = buildPayload(modelContext: modelContext)
        WidgetPayloadStorage.write(payload)
        WidgetCenter.shared.reloadAllTimelines()
    }

    static func buildPayload(modelContext: ModelContext) -> WidgetPayload {
        let descriptor = FetchDescriptor<Habit>(sortBy: [SortDescriptor(\.createdAt)])
        let habits = (try? modelContext.fetch(descriptor)) ?? []
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let todayYmd = Habit.localDayString(for: today)

        let activeToday = habits.filter { $0.applies(onLocalDay: todayYmd) }

        var entries: [WidgetPayload.WidgetHabitEntry] = []
        for (index, habit) in activeToday.enumerated() {
            let logDescriptor = FetchDescriptor<HabitLog>(
                predicate: #Predicate<HabitLog> { log in
                    log.habitId == habit.id && log.date == today
                }
            )
            let logs = (try? modelContext.fetch(logDescriptor)) ?? []
            let isCompletedToday = logs.first?.completed ?? false

            entries.append(WidgetPayload.WidgetHabitEntry(
                id: habit.id.uuidString,
                title: habit.title,
                isCompletedToday: isCompletedToday,
                displayColor: habit.color,
                displayIcon: habit.icon,
                displayOrder: index
            ))
        }

        let formatter = ISO8601DateFormatter()
        return WidgetPayload(
            habits: entries,
            lastUpdated: formatter.string(from: Date())
        )
    }
}
