import SwiftUI
import SwiftData

@main
struct HabitTrackerApp: App {
    var sharedModelContainer: ModelContainer = {
        let schema = Schema([Habit.self, HabitLog.self])
        let config = ModelConfiguration(isStoredInMemoryOnly: false)
        do {
            return try ModelContainer(for: schema, configurations: [config])
        } catch {
            fatalError("Could not create ModelContainer: \(error)")
        }
    }()

    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            TodayView()
        }
        .modelContainer(sharedModelContainer)
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                let context = sharedModelContainer.mainContext
                WidgetReconciler.reconcile(modelContext: context)
                WidgetPayloadBuilder.refreshSnapshot(modelContext: context)
                Task { @MainActor in
                    await SyncService.syncIfNeeded(modelContext: context)
                    WidgetPayloadBuilder.refreshSnapshot(modelContext: context)
                }
            }
        }
    }
}
