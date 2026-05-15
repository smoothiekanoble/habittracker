import SwiftUI
import SwiftData

/// 30-day dot grid: each dot = one day; filled if completed.
struct DotGridView: View {
    let logs: [HabitLog]
    let habitId: UUID
    let today: Date
    private let columns = 6
    private let totalDays = 30

    private var calendar: Calendar { Calendar.current }

    private var dates: [Date] {
        (0..<totalDays).compactMap { offset in
            calendar.date(byAdding: .day, value: -totalDays + 1 + offset, to: today)
        }.map { calendar.startOfDay(for: $0) }
    }

    private func isCompleted(on date: Date) -> Bool {
        logs.contains { calendar.isDate($0.date, inSameDayAs: date) && $0.completed }
    }

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: columns), spacing: 6) {
            ForEach(dates, id: \.self) { date in
                Circle()
                    .fill(isCompleted(on: date) ? (Color(hex: "#6366f1") ?? .indigo) : Color.gray.opacity(0.3))
                    .frame(width: 12, height: 12)
                    .aspectRatio(1, contentMode: .fit)
            }
        }
    }
}

/// Compact horizontal strip (e.g. last 7 days) for Today list.
struct DotStripView: View {
    let logs: [HabitLog]
    let habitId: UUID
    let today: Date
    private let days = 7
    private var calendar: Calendar { Calendar.current }

    private var dates: [Date] {
        (0..<days).compactMap { offset in
            calendar.date(byAdding: .day, value: -days + 1 + offset, to: today)
        }.map { calendar.startOfDay(for: $0) }
    }

    private func isCompleted(on date: Date) -> Bool {
        logs.contains { calendar.isDate($0.date, inSameDayAs: date) && $0.completed }
    }

    var body: some View {
        HStack(spacing: 4) {
            ForEach(dates, id: \.self) { date in
                Circle()
                    .fill(isCompleted(on: date) ? Color(hex: "#6366f1") ?? .indigo : Color.gray.opacity(0.3))
                    .frame(width: 8, height: 8)
            }
        }
    }
}
