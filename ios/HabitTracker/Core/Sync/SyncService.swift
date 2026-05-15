import Foundation
import SwiftData
import Supabase

private struct HabitDTO: Decodable {
    let id: UUID
    let user_id: UUID
    let title: String
    let color: String
    let icon: String
    let active_from: String?
    let active_until: String?
    let created_at: Date
    let updated_at: Date
}

private struct HabitLogDTO: Decodable {
    let id: UUID
    let habit_id: UUID
    let date: String
    let completed: Bool
    let created_at: Date
}

private struct HabitUpsert: Encodable {
    let id: UUID
    let user_id: UUID
    let title: String
    let color: String
    let icon: String
    let active_from: String
    let active_until: String?
    let created_at: Date
    let updated_at: Date
}

private struct HabitLogUpsert: Encodable {
    let id: UUID
    let habit_id: UUID
    let date: String
    let completed: Bool
    let created_at: Date
}

/// Pull/push habits and habit_logs against Supabase when `SupabaseConfig.plist` exists and `auth.session` is valid.
/// Wire OAuth (e.g. Google) via `supabase.auth` and `onOpenURL` for cross-platform parity with web.
@MainActor
enum SyncService {

    private static func makeClient() -> SupabaseClient? {
        guard let cfg = SupabaseConfig.load() else { return nil }
        return SupabaseClient(supabaseURL: cfg.url, supabaseKey: cfg.anonKey)
    }

    static func syncIfNeeded(modelContext: ModelContext) async {
        guard let client = makeClient() else { return }

        let authSession: Session
        do {
            authSession = try await client.auth.session
        } catch {
            return
        }

        let userId = authSession.user.id

        do {
            try await pullAndMerge(client: client, userId: userId, modelContext: modelContext)
            try modelContext.save()
        } catch {
            return
        }

        await pushIfNeeded(modelContext: modelContext)
    }

    static func pushIfNeeded(modelContext: ModelContext) async {
        guard let client = makeClient() else { return }

        let authSession: Session
        do {
            authSession = try await client.auth.session
        } catch {
            return
        }

        let userId = authSession.user.id

        do {
            let habits = try modelContext.fetch(FetchDescriptor<Habit>())
            if !habits.isEmpty {
                let rows = habits.map {
                    HabitUpsert(
                        id: $0.id,
                        user_id: userId,
                        title: $0.title,
                        color: $0.color,
                        icon: $0.icon,
                        active_from: $0.activeFromDay ?? Self.postgresDayString(for: $0.createdAt),
                        active_until: $0.activeUntilDay,
                        created_at: $0.createdAt,
                        updated_at: $0.updatedAt
                    )
                }
                _ = try await client.from("habits")
                    .upsert(rows, onConflict: "id")
                    .execute()
            }

            let logs = try modelContext.fetch(FetchDescriptor<HabitLog>())
            if !logs.isEmpty {
                let rows = logs.map {
                    HabitLogUpsert(
                        id: $0.id,
                        habit_id: $0.habitId,
                        date: Self.postgresDayString(for: $0.date),
                        completed: $0.completed,
                        created_at: $0.createdAt
                    )
                }
                _ = try await client.from("habit_logs")
                    .upsert(rows, onConflict: "habit_id,date")
                    .execute()
            }
        } catch {
            return
        }
    }

    private static func pullAndMerge(
        client: SupabaseClient,
        userId: UUID,
        modelContext: ModelContext
    ) async throws {
        let remoteHabits: [HabitDTO] = try await client.from("habits")
            .select()
            .eq("user_id", value: userId)
            .execute()
            .value

        var byId = Dictionary(uniqueKeysWithValues: (try modelContext.fetch(FetchDescriptor<Habit>())).map { ($0.id, $0) })

        for dto in remoteHabits {
            if let existing = byId[dto.id] {
                if dto.updated_at > existing.updatedAt {
                    existing.title = dto.title
                    existing.color = dto.color
                    existing.icon = dto.icon
                    existing.activeFromDay = dto.active_from ?? Self.postgresDayString(for: dto.created_at)
                    existing.activeUntilDay = dto.active_until
                    existing.createdAt = dto.created_at
                    existing.updatedAt = dto.updated_at
                }
            } else {
                let h = Habit(
                    id: dto.id,
                    title: dto.title,
                    color: dto.color,
                    icon: dto.icon,
                    activeFromDay: dto.active_from ?? Self.postgresDayString(for: dto.created_at),
                    activeUntilDay: dto.active_until,
                    createdAt: dto.created_at,
                    updatedAt: dto.updated_at
                )
                modelContext.insert(h)
                byId[dto.id] = h
            }
        }

        let localHabits = try modelContext.fetch(FetchDescriptor<Habit>())
        let habitIds = localHabits.map(\.id)
        guard !habitIds.isEmpty else { return }

        let idList = habitIds.map(\.uuidString).joined(separator: ",")
        let remoteLogs: [HabitLogDTO] = try await client.from("habit_logs")
            .select()
            .filter("habit_id", operator: "in", value: "(\(idList))")
            .execute()
            .value

        let localLogs = try modelContext.fetch(FetchDescriptor<HabitLog>())

        for dto in remoteLogs {
            guard let dayStart = dayStart(fromPostgreDate: dto.date) else { continue }

            let match = localLogs.first {
                $0.habitId == dto.habit_id && Calendar.current.isDate($0.date, inSameDayAs: dayStart)
            }

            if let existing = match {
                if dto.created_at > existing.createdAt {
                    existing.completed = dto.completed
                    existing.date = dayStart
                    existing.createdAt = dto.created_at
                }
            } else {
                let log = HabitLog(
                    id: dto.id,
                    habitId: dto.habit_id,
                    date: dayStart,
                    completed: dto.completed,
                    createdAt: dto.created_at
                )
                modelContext.insert(log)
            }
        }
    }

    private static func postgresDayString(for date: Date) -> String {
        let cal = Calendar.current
        let c = cal.dateComponents([.year, .month, .day], from: date)
        guard let y = c.year, let m = c.month, let d = c.day else { return "" }
        return String(format: "%04d-%02d-%02d", y, m, d)
    }

    private static func dayStart(fromPostgreDate s: String) -> Date? {
        let parts = s.split(separator: "-")
        guard parts.count == 3,
              let y = Int(parts[0]),
              let m = Int(parts[1]),
              let d = Int(parts[2]) else { return nil }
        return Calendar.current.date(from: DateComponents(year: y, month: m, day: d))
    }
}
