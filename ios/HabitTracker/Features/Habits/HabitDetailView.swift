import SwiftUI
import SwiftData

struct HabitDetailView: View {
    @Bindable var habit: Habit
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @State private var showingEdit = false
    @State private var showingDeleteAlert = false

    private var today: Date {
        Calendar.current.startOfDay(for: Date())
    }

    private var logsForHabit: [HabitLog] {
        let descriptor = FetchDescriptor<HabitLog>(
            predicate: #Predicate<HabitLog> { log in log.habitId == habit.id },
            sortBy: [SortDescriptor(\.date)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    private var relevantLogs: [HabitLog] {
        let start = Calendar.current.date(byAdding: .day, value: -30, to: today) ?? today
        return logsForHabit.filter { $0.date >= start && $0.date <= today }
    }

    var body: some View {

        List {
            Section {
                HStack(spacing: 16) {
                    ZStack {
                        Circle()
                            .fill(Color(hex: habit.color) ?? .indigo)
                            .frame(width: 56, height: 56)
                        Image(systemName: habit.icon)
                            .foregroundStyle(.white)
                            .font(.title2)
                    }
                    Text(habit.title)
                        .font(.title2)
                }
                .padding(.vertical, 8)
            }

            Section("Last 30 days") {
                DotGridView(logs: relevantLogs, habitId: habit.id, today: today)
                    .padding(.vertical, 8)
            }

            Section {
                Button("Edit habit") {
                    showingEdit = true
                }
                Button("Delete habit", role: .destructive) {
                    showingDeleteAlert = true
                }
            }
        }
        .navigationTitle(habit.title)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showingEdit) {
            HabitEditView(mode: .edit(habit))
        }
        .alert("Delete habit?", isPresented: $showingDeleteAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                deleteHabit()
            }
        } message: {
            Text("This will remove the habit and its history. This cannot be undone.")
        }
    }

    private func deleteHabit() {
        let logDescriptor = FetchDescriptor<HabitLog>(
            predicate: #Predicate<HabitLog> { $0.habitId == habit.id }
        )
        let logsToDelete = (try? modelContext.fetch(logDescriptor)) ?? []
        for log in logsToDelete {
            modelContext.delete(log)
        }
        modelContext.delete(habit)
        try? modelContext.save()
        WidgetPayloadBuilder.refreshSnapshot(modelContext: modelContext)
        dismiss()
    }
}
