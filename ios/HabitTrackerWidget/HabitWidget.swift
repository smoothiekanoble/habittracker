import WidgetKit
import SwiftUI

struct HabitWidgetEntry: TimelineEntry {
    let date: Date
    let payload: WidgetPayload?
}

struct HabitWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> HabitWidgetEntry {
        HabitWidgetEntry(date: Date(), payload: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (HabitWidgetEntry) -> Void) {
        let payload = WidgetPayloadStorage.read()
        let entry = HabitWidgetEntry(date: Date(), payload: payload)
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HabitWidgetEntry>) -> Void) {
        let payload = WidgetPayloadStorage.read()
        let entry = HabitWidgetEntry(date: Date(), payload: payload)
        let timeline = Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(60)))
        completion(timeline)
    }
}

struct HabitWidgetView: View {
    var entry: HabitWidgetEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        if let payload = entry.payload, !payload.habits.isEmpty {
            switch family {
            case .systemSmall:
                SmallWidgetView(habits: payload.habits)
            case .systemMedium:
                MediumWidgetView(habits: payload.habits)
            default:
                MediumWidgetView(habits: payload.habits)
            }
        } else {
            ContentUnavailableView(
                "No habits",
                systemImage: "plus.circle",
                description: Text("Open the app to add habits.")
            )
        }
    }
}

struct SmallWidgetView: View {
    let habits: [WidgetPayload.WidgetHabitEntry]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Today")
                .font(.caption)
                .foregroundStyle(.secondary)
            ForEach(habits.prefix(4), id: \.id) { habit in
                ToggleHabitButton(habit: habit)
            }
            Spacer(minLength: 0)
        }
        .padding()
    }
}

struct MediumWidgetView: View {
    let habits: [WidgetPayload.WidgetHabitEntry]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Today")
                .font(.caption)
                .foregroundStyle(.secondary)
            LazyVGrid(columns: [
                GridItem(.flexible()),
                GridItem(.flexible()),
                GridItem(.flexible()),
                GridItem(.flexible())
            ], spacing: 8) {
                ForEach(habits.prefix(8), id: \.id) { habit in
                    ToggleHabitButton(habit: habit)
                }
            }
            Spacer(minLength: 0)
        }
        .padding()
    }
}

struct ToggleHabitButton: View {
    let habit: WidgetPayload.WidgetHabitEntry

    var body: some View {
        Button(intent: ToggleHabitIntent(habitId: habit.id)) {
            HStack(spacing: 6) {
                Circle()
                    .fill(Color(hex: habit.displayColor) ?? .indigo)
                    .frame(width: 24, height: 24)
                    .overlay(
                        Image(systemName: habit.isCompletedToday ? "checkmark" : habit.displayIcon)
                            .font(.caption2)
                            .foregroundStyle(.white)
                    )
                Text(habit.title)
                    .lineLimit(1)
                    .font(.caption)
                    .foregroundStyle(.primary)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(habit.isCompletedToday ? Color.green.opacity(0.2) : Color.gray.opacity(0.1))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
    }
}

extension Color {
    init?(hex: String) {
        var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if hexSanitized.hasPrefix("#") { hexSanitized.removeFirst() }
        guard hexSanitized.count == 6 else { return nil }
        var rgb: UInt64 = 0
        guard Scanner(string: hexSanitized).scanHexInt64(&rgb) else { return nil }
        self.init(
            red: Double((rgb & 0xFF0000) >> 16) / 255,
            green: Double((rgb & 0x00FF00) >> 8) / 255,
            blue: Double(rgb & 0x0000FF) / 255
        )
    }
}

struct HabitWidget: Widget {
    let kind: String = "HabitWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: HabitWidgetProvider()) { entry in
            HabitWidgetView(entry: entry)
        }
        .configurationDisplayName("Habit Tracker")
        .description("Quick toggle for today's habits.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
