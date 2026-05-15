import Foundation
import SwiftData

/// On app launch/foreground: read widget snapshot from App Group, apply any widget toggles into SwiftData.
struct WidgetReconciler {

    static func reconcile(modelContext: ModelContext) {
        guard let payload = WidgetPayloadStorage.read() else { return }
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())

        for entry in payload.habits {
            guard let habitId = UUID(uuidString: entry.id) else { continue }
            let habitDescriptor = FetchDescriptor<Habit>(predicate: #Predicate<Habit> { $0.id == habitId })
            guard let habits = try? modelContext.fetch(habitDescriptor), let habit = habits.first else { continue }

            let logDescriptor = FetchDescriptor<HabitLog>(
                predicate: #Predicate<HabitLog> { log in
                    log.habitId == habitId && log.date == today
                }
            )
            let existingLogs = (try? modelContext.fetch(logDescriptor)) ?? []

            if entry.isCompletedToday {
                if existingLogs.isEmpty {
                    let log = HabitLog(habitId: habitId, date: today, completed: true)
                    modelContext.insert(log)
                }
            } else {
                for log in existingLogs {
                    modelContext.delete(log)
                }
            }
        }

        try? modelContext.save()
    }
}
