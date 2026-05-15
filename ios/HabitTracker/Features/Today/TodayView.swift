import SwiftUI
import SwiftData

struct TodayView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \Habit.createdAt) private var habits: [Habit]
    @State private var showingNewHabit = false

    private var today: Date {
        Calendar.current.startOfDay(for: Date())
    }

    var body: some View {
        NavigationStack {
            Group {
                if habits.isEmpty {
                    ContentUnavailableView(
                        "No habits yet",
                        systemImage: "plus.circle",
                        description: Text("Add a habit to get started.")
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List {
                        ForEach(habits) { habit in
                            TodayHabitRow(habit: habit, today: today)
                        }
                        .onDelete(perform: deleteHabits)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Today")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showingNewHabit = true
                    } label: {
                        Image(systemName: "plus.circle.fill")
                    }
                }
            }
            .sheet(isPresented: $showingNewHabit) {
                HabitEditView(mode: .create)
            }
            .navigationDestination(for: Habit.self) { habit in
                HabitDetailView(habit: habit)
            }
        }
    }

    private func deleteHabits(at offsets: IndexSet) {
        for index in offsets {
            modelContext.delete(habits[index])
        }
        try? modelContext.save()
        WidgetPayloadBuilder.refreshSnapshot(modelContext: modelContext)
    }
}

struct TodayHabitRow: View {
    let habit: Habit
    let today: Date
    @Environment(\.modelContext) private var modelContext
    @Query private var logs: [HabitLog]

    private var isCompletedToday: Bool {
        logs.contains { $0.habitId == habit.id && Calendar.current.isDate($0.date, inSameDayAs: today) }
    }

    init(habit: Habit, today: Date) {
        self.habit = habit
        self.today = today
        let start = Calendar.current.date(byAdding: .day, value: -30, to: today) ?? today
        _logs = Query(
            filter: #Predicate<HabitLog> { log in
                log.habitId == habit.id && log.date >= start && log.date <= today
            },
            sort: \HabitLog.date
        )
    }

    var body: some View {
        HStack(spacing: 16) {
            Button {
                toggleToday()
            } label: {
                ZStack {
                    Circle()
                        .fill(Color(hex: habit.color) ?? .indigo)
                        .frame(width: 44, height: 44)
                    Image(systemName: isCompletedToday ? "checkmark" : habit.icon)
                        .foregroundStyle(.white)
                        .font(.title3)
                }
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 4) {
                Text(habit.title)
                    .font(.headline)
                    .foregroundStyle(.primary)
                DotStripView(logs: logs, habitId: habit.id, today: today)
            }

            Spacer()

            if isCompletedToday {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            }

            NavigationLink(value: habit) {
                EmptyView()
            }
            .frame(width: 24)
        }
        .padding(.vertical, 8)
        .contentShape(Rectangle())
    }

    private func toggleToday() {
        let descriptor = FetchDescriptor<HabitLog>(
            predicate: #Predicate<HabitLog> { log in
                log.habitId == habit.id && log.date == today
            }
        )
        let existing = (try? modelContext.fetch(descriptor)) ?? []

        if existing.isEmpty {
            let log = HabitLog(habitId: habit.id, date: today, completed: true)
            modelContext.insert(log)
        } else {
            for log in existing {
                modelContext.delete(log)
            }
        }
        try? modelContext.save()
        WidgetPayloadBuilder.refreshSnapshot(modelContext: modelContext)
    }
}

// MARK: - Color hex extension
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
