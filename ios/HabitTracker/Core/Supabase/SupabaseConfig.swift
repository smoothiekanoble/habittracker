import Foundation

/// Loads optional `SupabaseConfig.plist` from the app bundle (same values as web `.env.local`).
/// Copy `SupabaseConfig.example.plist` → `SupabaseConfig.plist`, add the plist to the HabitTracker target
/// (Build Phases → Copy Bundle Resources). Do not commit `SupabaseConfig.plist`.
enum SupabaseConfig {
    struct Loaded {
        let url: URL
        let anonKey: String
    }

    private struct Plist: Decodable {
        let supabaseURL: String
        let supabaseAnonKey: String
    }

    static func load() -> Loaded? {
        guard let plistURL = Bundle.main.url(forResource: "SupabaseConfig", withExtension: "plist"),
              let data = try? Data(contentsOf: plistURL),
              let parsed = try? PropertyListDecoder().decode(Plist.self, from: data)
        else { return nil }

        let trimmedURL = parsed.supabaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedKey = parsed.supabaseAnonKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmedURL), !trimmedKey.isEmpty else { return nil }

        return Loaded(url: url, anonKey: trimmedKey)
    }
}
