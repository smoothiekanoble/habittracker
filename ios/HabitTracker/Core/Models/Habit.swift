import Foundation
import SwiftData

@Model
final class Habit {
    var id: UUID
    var title: String
    var color: String
    var icon: String
    /// YYYY-MM-DD; nil means derive from `createdAt` when syncing or evaluating.
    var activeFromDay: String?
    /// YYYY-MM-DD inclusive end; nil = no end.
    var activeUntilDay: String?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        title: String,
        color: String = "#6366f1",
        icon: String = "circle",
        activeFromDay: String? = nil,
        activeUntilDay: String? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.title = title
        self.color = color
        self.icon = icon
        self.activeFromDay = activeFromDay
        self.activeUntilDay = activeUntilDay
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    static func localDayString(for date: Date) -> String {
        let cal = Calendar.current
        let c = cal.dateComponents([.year, .month, .day], from: date)
        guard let y = c.year, let m = c.month, let d = c.day else { return "" }
        return String(format: "%04d-%02d-%02d", y, m, d)
    }

    /// Whether this habit counts on the given calendar day (YYYY-MM-DD, local).
    func applies(onLocalDay ymd: String) -> Bool {
        let from = activeFromDay ?? Self.localDayString(for: createdAt)
        guard !from.isEmpty else { return true }
        if ymd < from { return false }
        if let u = activeUntilDay, !u.isEmpty, ymd > u { return false }
        return true
    }
}
