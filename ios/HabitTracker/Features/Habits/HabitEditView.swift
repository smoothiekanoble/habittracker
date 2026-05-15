import SwiftUI
import SwiftData

enum HabitEditMode {
    case create
    case edit(Habit)
}

struct HabitEditView: View {
    let mode: HabitEditMode
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var title: String = ""
    @State private var color: String = "#6366f1"
    @State private var icon: String = "circle"
    @State private var showingDeleteConfirm = false

    private var isEditing: Bool {
        if case .edit = mode { return true }
        return false
    }

    private let colors = ["#6366f1", "#22c55e", "#ef4444", "#f59e0b", "#8b5cf6", "#ec4899"]
    private let icons = ["circle", "star.fill", "heart.fill", "flame.fill", "drop.fill", "leaf.fill"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Habit") {
                    TextField("Title", text: $title)
                }

                Section("Color") {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 6), spacing: 12) {
                        ForEach(colors, id: \.self) { hex in
                            Button {
                                color = hex
                            } label: {
                                Circle()
                                    .fill(Color(hex: hex) ?? .gray)
                                    .frame(width: 36, height: 36)
                                    .overlay(
                                        Circle()
                                            .stroke(color == hex ? Color.primary : Color.clear, lineWidth: 3)
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 4)
                }

                Section("Icon") {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 6), spacing: 12) {
                        ForEach(icons, id: \.self) { iconName in
                            Button {
                                icon = iconName
                            } label: {
                                Image(systemName: iconName)
                                    .font(.title2)
                                    .foregroundStyle(icon == iconName ? Color(hex: color) ?? .indigo : .secondary)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 4)
                }

                if isEditing, case .edit(let habit) = mode {
                    Section {
                        Button("Delete habit", role: .destructive) {
                            showingDeleteConfirm = true
                        }
                    }
                }
            }
            .navigationTitle(isEditing ? "Edit habit" : "New habit")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        save()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .onAppear {
                if case .edit(let habit) = mode {
                    title = habit.title
                    color = habit.color
                    icon = habit.icon
                }
            }
            .alert("Delete habit?", isPresented: $showingDeleteConfirm) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    deleteAndDismiss()
                }
            } message: {
                Text("This will remove the habit and its history.")
            }
        }
    }

    private func save() {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        switch mode {
        case .create:
            let habit = Habit(title: trimmed, color: color, icon: icon)
            modelContext.insert(habit)
        case .edit(let habit):
            habit.title = trimmed
            habit.color = color
            habit.icon = icon
            habit.updatedAt = Date()
        }
        try? modelContext.save()
        WidgetPayloadBuilder.refreshSnapshot(modelContext: modelContext)
        dismiss()
    }

    private func deleteAndDismiss() {
        if case .edit(let habit) = mode {
            let logDescriptor = FetchDescriptor<HabitLog>(
                predicate: #Predicate<HabitLog> { $0.habitId == habit.id }
            )
            let logs = (try? modelContext.fetch(logDescriptor)) ?? []
            for log in logs {
                modelContext.delete(log)
            }
            modelContext.delete(habit)
            try? modelContext.save()
            WidgetPayloadBuilder.refreshSnapshot(modelContext: modelContext)
        }
        dismiss()
    }
}
