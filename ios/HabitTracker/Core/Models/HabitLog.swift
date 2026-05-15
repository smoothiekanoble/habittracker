import Foundation
import SwiftData

@Model
final class HabitLog {
    var id: UUID
    var habitId: UUID
    var date: Date
    var completed: Bool
    var createdAt: Date

    init(
        id: UUID = UUID(),
        habitId: UUID,
        date: Date,
        completed: Bool = true,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.habitId = habitId
        self.date = date
        self.completed = completed
        self.createdAt = createdAt
    }
}
