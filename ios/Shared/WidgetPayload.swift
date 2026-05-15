import Foundation

/// Denormalized snapshot for the widget. Widget reads and (Model A) updates this in App Group UserDefaults.
struct WidgetPayload: Codable {
    var habits: [WidgetHabitEntry]
    var lastUpdated: String

    struct WidgetHabitEntry: Codable {
        var id: String
        var title: String
        var isCompletedToday: Bool
        var displayColor: String
        var displayIcon: String
        var displayOrder: Int
    }
}

enum WidgetPayloadStorage {
    static let appGroupID = "group.com.habittracker.app" // Must match entitlements; change to your team ID prefix if needed
    static let payloadKey = "widgetPayload"

    static var userDefaults: UserDefaults? {
        UserDefaults(suiteName: appGroupID)
    }

    static func write(_ payload: WidgetPayload) {
        guard let defaults = userDefaults else { return }
        if let data = try? JSONEncoder().encode(payload) {
            defaults.set(data, forKey: payloadKey)
            defaults.synchronize()
        }
    }

    static func read() -> WidgetPayload? {
        guard let defaults = userDefaults,
              let data = defaults.data(forKey: payloadKey) else { return nil }
        return try? JSONDecoder().decode(WidgetPayload.self, from: data)
    }
}
