import SwiftUI
import WidgetKit

// Let’s Pray widgets: Home Screen, Lock Screen, and (from the iPhone) the
// Mac desktop and Notification Center. The app writes a snapshot of the
// coming week into the shared App Group; each midnight the widget moves to
// the next day by itself.

private let appGroup = "group.com.letspray.app"
private let openToPray = URL(string: "letspray://pray")!

// MARK: - Snapshot written by the app (js/widget.js)

struct Snapshot: Decodable {
    struct Item: Decodable, Hashable {
        let title: String
        let list: String
        let color: String
        let pinned: Bool?
        let when: String?
    }

    struct Verse: Decodable {
        let text: String
        let ref: String
    }

    struct Day: Decodable {
        let date: String
        let count: Int
        let followUps: Int?
        let verse: Verse?
        let items: [Item]
    }

    struct Week: Decodable {
        let days: Int
        let prayers: Int
        let answered: Int
    }

    let showNames: Bool?
    let streak: Int?
    let prayedOn: String?
    let week: Week?
    let days: [Day]

    static func load() -> Snapshot? {
        guard let json = UserDefaults(suiteName: appGroup)?.string(forKey: "snapshot"),
              let data = json.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(Snapshot.self, from: data)
    }

    /// Shown in the widget gallery before the app has written anything.
    static let sample = Snapshot(
        showNames: true,
        streak: 3,
        prayedOn: nil,
        week: Week(days: 4, prayers: 26, answered: 1),
        days: [Day(
            date: dayKey(Date()),
            count: 8,
            followUps: 1,
            verse: Verse(text: "Devote yourselves to prayer, being watchful and thankful.", ref: "Colossians 4:2"),
            items: [
                Item(title: "Mum’s knee surgery", list: "Family", color: "clay", pinned: true, when: "Today"),
                Item(title: "Sam and his HSC exams", list: "People", color: "slate", pinned: false, when: "Fri"),
                Item(title: "Young adults growth group", list: "Church", color: "sage", pinned: false, when: nil),
                Item(title: "The Nguyens in Cambodia", list: "Mission", color: "plum", pinned: false, when: nil),
                Item(title: "Ben & Sue Carter", list: "Congregation", color: "teal", pinned: false, when: nil),
                Item(title: "Margaret Lee", list: "Congregation", color: "teal", pinned: false, when: nil),
            ]
        )]
    )
}

func dayKey(_ date: Date) -> String {
    let f = DateFormatter()
    f.calendar = Calendar(identifier: .gregorian)
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = .current
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: date)
}

// MARK: - Timeline

struct PrayerEntry: TimelineEntry {
    let date: Date
    let snapshot: Snapshot?
    let day: Snapshot.Day?

    var prayedToday: Bool { snapshot?.prayedOn == dayKey(date) }
    var showNames: Bool { snapshot?.showNames ?? true }
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> PrayerEntry {
        PrayerEntry(date: Date(), snapshot: .sample, day: Snapshot.sample.days.first)
    }

    func getSnapshot(in context: Context, completion: @escaping (PrayerEntry) -> Void) {
        let snapshot = Snapshot.load() ?? (context.isPreview ? .sample : nil)
        completion(entry(for: Date(), in: snapshot))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PrayerEntry>) -> Void) {
        let snapshot = Snapshot.load()
        let calendar = Calendar.current
        var entries = [entry(for: Date(), in: snapshot)]
        var midnight = calendar.startOfDay(for: Date())
        for _ in 0..<6 {
            midnight = calendar.date(byAdding: .day, value: 1, to: midnight) ?? midnight
            entries.append(entry(for: midnight, in: snapshot))
        }
        completion(Timeline(entries: entries, policy: .after(midnight)))
    }

    private func entry(for date: Date, in snapshot: Snapshot?) -> PrayerEntry {
        let key = dayKey(date)
        return PrayerEntry(date: date, snapshot: snapshot, day: snapshot?.days.first { $0.date == key })
    }
}

// MARK: - Colours (match css/app.css)

private extension UIColor {
    convenience init(hex: UInt32) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}

private func adaptive(_ light: UInt32, _ dark: UInt32) -> Color {
    Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light) })
}

enum Palette {
    static let background = adaptive(0xEFEDE8, 0x131211)
    static let tile = adaptive(0xE8E5DF, 0x2B2927)
    static let ink = adaptive(0x1C1B1A, 0xEFEBE5)
    static let ink2 = adaptive(0x67635D, 0xAAA49C)
    static let accent = adaptive(0xC87B8D, 0xD6929F)
    static let accentText = adaptive(0xA65A6C, 0xE0A3B0)
    static let teal = adaptive(0x4F7A6C, 0x8DB5A6)
    static let onAccent = Color(UIColor(hex: 0x1C1B1A))

    static func list(_ id: String) -> Color {
        switch id {
        case "slate": return adaptive(0x71839B, 0x93A5BD)
        case "clay": return adaptive(0xB4846C, 0xCFA28A)
        case "plum": return adaptive(0x8C7690, 0xAE98B2)
        case "sand": return adaptive(0xB09662, 0xCDB682)
        case "teal": return adaptive(0x5F8F8B, 0x80B0AB)
        case "rose": return adaptive(0xB07A82, 0xCB9AA1)
        case "olive": return adaptive(0x8A8A5C, 0xAAAA7C)
        default: return adaptive(0x7F9479, 0x9DB396)
        }
    }
}

// MARK: - Type, after the app: heavy condensed italic capitals

private extension Text {
    func display(_ size: CGFloat) -> some View {
        self.font(.system(size: size, weight: .heavy).width(.condensed))
            .italic()
            .textCase(.uppercase)
            .foregroundStyle(Palette.ink)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
    }

    func eyebrow() -> some View {
        self.font(.system(size: 11, weight: .semibold))
            .tracking(1.6)
            .textCase(.uppercase)
            .foregroundStyle(Palette.teal)
            .lineLimit(1)
    }
}

private struct StartPill: View {
    let prayed: Bool
    var compact = false

    var body: some View {
        Text(prayed ? "Again" : "Start")
            .font(.system(size: compact ? 14 : 17, weight: .heavy).width(.condensed))
            .italic()
            .textCase(.uppercase)
            .foregroundStyle(Palette.onAccent)
            .padding(.horizontal, compact ? 12 : 18)
            .padding(.vertical, compact ? 6 : 9)
            .background(Palette.accent, in: RoundedRectangle(cornerRadius: compact ? 10 : 14, style: .continuous))
    }
}

private struct ItemRow: View {
    let item: Snapshot.Item

    var body: some View {
        HStack(spacing: 8) {
            Circle().fill(Palette.list(item.color)).frame(width: 7, height: 7)
            Text(item.title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Palette.ink)
                .lineLimit(1)
            Spacer(minLength: 4)
            if item.pinned == true {
                Image(systemName: "pin.fill").font(.system(size: 10)).foregroundStyle(Palette.teal)
            }
            if let when = item.when, !when.isEmpty {
                Text(when).font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.accentText)
            } else {
                Text(item.list).font(.system(size: 11)).foregroundStyle(Palette.ink2).lineLimit(1)
            }
        }
    }
}

private func countLine(_ n: Int) -> String {
    n == 1 ? "prayer point" : "prayer points"
}

// MARK: - Layouts

private struct EmptyState: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Let’s Pray").eyebrow()
            Spacer()
            Text("Open Let’s Pray to add your prayer lists.")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Palette.ink)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

private struct SmallView: View {
    let entry: PrayerEntry

    var body: some View {
        let count = entry.day?.count ?? 0
        VStack(alignment: .leading, spacing: 2) {
            Text(entry.prayedToday ? "Prayed today" : "Today").eyebrow()
            Spacer(minLength: 0)
            Text("\(count)").display(46)
            Text(countLine(count)).font(.system(size: 12)).foregroundStyle(Palette.ink2)
            if entry.showNames, let first = entry.day?.items.first {
                Text(first.title)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Palette.ink)
                    .lineLimit(1)
                    .padding(.top, 2)
            }
            Spacer(minLength: 4)
            StartPill(prayed: entry.prayedToday, compact: true)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

private struct MediumView: View {
    let entry: PrayerEntry

    var body: some View {
        let count = entry.day?.count ?? 0
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.prayedToday ? "Prayed today" : "Up next").eyebrow()
                Spacer(minLength: 0)
                Text("\(count)").display(48)
                Text(countLine(count)).font(.system(size: 12)).foregroundStyle(Palette.ink2)
                Spacer(minLength: 6)
                StartPill(prayed: entry.prayedToday, compact: true)
            }
            .frame(width: 104, alignment: .leading)

            VStack(alignment: .leading, spacing: 9) {
                if entry.showNames {
                    ForEach((entry.day?.items ?? []).prefix(4), id: \.self) { ItemRow(item: $0) }
                } else {
                    Text("Your prayer lists are ready.")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Palette.ink)
                }
                Spacer(minLength: 0)
                if let n = entry.day?.followUps, n > 0 {
                    Label(n == 1 ? "1 to follow up" : "\(n) to follow up", systemImage: "bubble.left")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Palette.accentText)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
}

/// Made for a Mac desktop as much as an iPhone: the day at a glance.
private struct LargeView: View {
    let entry: PrayerEntry

    var body: some View {
        let count = entry.day?.count ?? 0
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("Let’s").eyebrow()
                Text("Pray").display(20)
                Spacer()
                Text(entry.date, format: .dateTime.weekday(.wide).day().month(.wide))
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Palette.ink2)
            }

            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(entry.prayedToday ? "Pray again" : "Today’s prayers").display(28)
                    Text("\(count) \(countLine(count)) · about \(max(1, Int((Double(count) * 0.75).rounded()))) min")
                        .font(.system(size: 12))
                        .foregroundStyle(Palette.ink2)
                }
                Spacer()
                StartPill(prayed: entry.prayedToday)
            }

            VStack(alignment: .leading, spacing: 10) {
                if entry.showNames {
                    ForEach((entry.day?.items ?? []).prefix(6), id: \.self) { ItemRow(item: $0) }
                } else {
                    Text("Names are hidden. Open Let’s Pray to begin.")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Palette.ink)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.tile.opacity(0.55), in: RoundedRectangle(cornerRadius: 16, style: .continuous))

            Spacer(minLength: 0)

            HStack(spacing: 8) {
                StatTile(value: entry.snapshot?.week?.days ?? 0, label: "Days")
                StatTile(value: entry.snapshot?.week?.prayers ?? 0, label: "Prayers")
                StatTile(value: entry.snapshot?.streak ?? 0, label: "Streak")
                if let n = entry.day?.followUps, n > 0 {
                    StatTile(value: n, label: "Follow up", highlight: true)
                }
            }

            if let verse = entry.day?.verse {
                Text("“\(verse.text)” \(verse.ref)")
                    .font(.system(size: 11))
                    .foregroundStyle(Palette.ink2)
                    .lineLimit(2)
            }
        }
    }
}

private struct StatTile: View {
    let value: Int
    let label: String
    var highlight = false

    var body: some View {
        VStack(spacing: 0) {
            Text("\(value)")
                .font(.system(size: 22, weight: .semibold).width(.condensed))
                .foregroundStyle(highlight ? Palette.accentText : Palette.ink)
            Text(label).font(.system(size: 10)).foregroundStyle(Palette.ink2).lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 7)
        .background(Palette.tile, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

// Lock Screen: counts only, never names.
private struct CircularView: View {
    let entry: PrayerEntry

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 0) {
                Image(systemName: entry.prayedToday ? "checkmark" : "hands.sparkles")
                    .font(.system(size: 12, weight: .semibold))
                Text("\(entry.day?.count ?? 0)").font(.system(size: 18, weight: .bold).width(.condensed))
            }
        }
    }
}

private struct RectangularView: View {
    let entry: PrayerEntry

    var body: some View {
        let count = entry.day?.count ?? 0
        VStack(alignment: .leading, spacing: 1) {
            Text("Let’s Pray").font(.system(size: 13, weight: .heavy).width(.condensed)).italic().textCase(.uppercase)
            Text(entry.prayedToday ? "Prayed today" : "\(count) \(countLine(count)) today").font(.system(size: 13))
            if let n = entry.day?.followUps, n > 0 {
                Text(n == 1 ? "1 to follow up" : "\(n) to follow up").font(.system(size: 12)).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct LetsPrayWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: PrayerEntry

    var body: some View {
        Group {
            if entry.snapshot == nil {
                switch family {
                case .accessoryInline, .accessoryCircular, .accessoryRectangular:
                    Text("Let’s Pray")
                default:
                    EmptyState()
                }
            } else {
                switch family {
                case .systemSmall: SmallView(entry: entry)
                case .systemMedium: MediumView(entry: entry)
                case .systemLarge, .systemExtraLarge: LargeView(entry: entry)
                case .accessoryCircular: CircularView(entry: entry)
                case .accessoryRectangular: RectangularView(entry: entry)
                case .accessoryInline:
                    Text(entry.prayedToday ? "Prayed today" : "\(entry.day?.count ?? 0) prayer points today")
                default: SmallView(entry: entry)
                }
            }
        }
        .containerBackground(for: .widget) { Palette.background }
        .widgetURL(openToPray)
    }
}

// MARK: - Widget

struct TodayWidget: Widget {
    let kind = "TodayWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            LetsPrayWidgetView(entry: entry)
        }
        .configurationDisplayName("Today’s prayers")
        .description("What’s up next, ready to start. Add it to your Mac desktop from your iPhone, too.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

@main
struct LetsPrayWidgetBundle: WidgetBundle {
    var body: some Widget {
        TodayWidget()
    }
}
