import CloudKit
import Capacitor
import UIKit

/// iCloud shared lists. Each shared list is its own CloudKit record zone:
/// in the owner's private database, and in the shared database of everyone
/// they invite. Records carry the list's shared fields as JSON in an
/// end-to-end encrypted field; deciding which edit wins happens in the app
/// (js/share.js), using each record's sharedAt time.
final class CloudShareCenter {
    static let shared = CloudShareCenter()
    static let containerID = "iCloud.com.letspray.app"
    /// Zones made by Let’s Pray, so other data in the container is left alone.
    static let zonePrefix = "list-"

    let container = CKContainer(identifier: CloudShareCenter.containerID)
    var privateDB: CKDatabase { container.privateCloudDatabase }
    var sharedDB: CKDatabase { container.sharedCloudDatabase }

    /// Set once the plugin has loaded, so accepted invitations reach the app.
    private weak var plugin: CloudSharePlugin?
    private var pending: [[String: Any]] = []

    /// Called when someone taps an invitation to a shared list.
    func accept(_ metadata: CKShare.Metadata) {
        Task {
            do {
                _ = try await CKContainer(identifier: metadata.containerIdentifier).accept(metadata)
                let zoneID = metadata.share.recordID.zoneID
                let title = metadata.share[CKShare.SystemFieldKey.title] as? String ?? ""
                await deliver(["zone": zoneID.zoneName, "ownerName": zoneID.ownerName, "title": title])
            } catch {
                await report(error)
            }
        }
    }

    @MainActor private func deliver(_ event: [String: Any]) {
        if let plugin {
            plugin.notifyListeners("shareAccepted", data: event, retainUntilConsumed: true)
        } else {
            pending.append(event)
        }
    }

    @MainActor private func report(_ error: Error) {
        plugin?.notifyListeners("shareError", data: ["message": error.localizedDescription], retainUntilConsumed: true)
    }

    @MainActor func attach(_ plugin: CloudSharePlugin) {
        self.plugin = plugin
        for event in pending {
            plugin.notifyListeners("shareAccepted", data: event, retainUntilConsumed: true)
        }
        pending.removeAll()
    }

    // MARK: Change tokens, so each pull only fetches what is new

    func token(_ key: String) -> CKServerChangeToken? {
        guard let data = UserDefaults.standard.data(forKey: "ck.token.\(key)") else { return nil }
        return try? NSKeyedUnarchiver.unarchivedObject(ofClass: CKServerChangeToken.self, from: data)
    }

    func setToken(_ token: CKServerChangeToken?, _ key: String) {
        let defaultsKey = "ck.token.\(key)"
        guard let token, let data = try? NSKeyedArchiver.archivedData(withRootObject: token, requiringSecureCoding: true) else {
            UserDefaults.standard.removeObject(forKey: defaultsKey)
            return
        }
        UserDefaults.standard.set(data, forKey: defaultsKey)
    }

    func tokenKey(_ zoneID: CKRecordZone.ID, shared: Bool) -> String {
        "\(shared ? "s" : "p").\(zoneID.ownerName).\(zoneID.zoneName)"
    }
}

@objc(CloudSharePlugin)
public class CloudSharePlugin: CAPPlugin, CAPBridgedPlugin, UICloudSharingControllerDelegate {
    public let identifier = "CloudSharePlugin"
    public let jsName = "CloudShare"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "push", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pull", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "leave", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopSharing", returnType: CAPPluginReturnPromise),
    ]

    private let center = CloudShareCenter.shared
    /// The list whose sharing sheet is on screen.
    private var sheetZone: String?

    override public func load() {
        Task { @MainActor in self.center.attach(self) }
    }

    // MARK: iCloud account

    @objc func status(_ call: CAPPluginCall) {
        Task {
            do {
                let status = try await center.container.accountStatus()
                let name: String
                switch status {
                case .available: name = "available"
                case .noAccount: name = "noAccount"
                case .restricted: name = "restricted"
                case .temporarilyUnavailable: name = "temporarilyUnavailable"
                default: name = "unknown"
                }
                call.resolve(["status": name])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    // MARK: Sharing

    /// Makes the list's zone, sends its records, creates the share and shows
    /// the iOS sharing sheet (Messages, Mail, copy link).
    @objc func share(_ call: CAPPluginCall) {
        guard let zone = call.getString("zone") else {
            call.reject("Missing list")
            return
        }
        let title = call.getString("title") ?? "Prayer list"
        let zoneID = CKRecordZone.ID(zoneName: zone, ownerName: CKCurrentUserDefaultName)
        let records = makeRecords(call.getArray("records") ?? [], in: zoneID)
        Task {
            do {
                _ = try await center.privateDB.modifyRecordZones(saving: [CKRecordZone(zoneID: zoneID)], deleting: [])
                try await save(records, to: center.privateDB)
                var share = try await existingShare(in: zoneID, db: center.privateDB)
                if share == nil {
                    let newShare = CKShare(recordZoneID: zoneID)
                    newShare[CKShare.SystemFieldKey.title] = title as CKRecordValue
                    newShare.publicPermission = .none
                    let (results, _) = try await center.privateDB.modifyRecords(saving: [newShare], deleting: [])
                    if case .success(let saved)? = results[newShare.recordID] {
                        share = saved as? CKShare
                    }
                    if share == nil { share = newShare }
                }
                guard let share else {
                    call.reject("Could not create the share")
                    return
                }
                await present(share, zone: zone, call: call)
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// Shows who a list is shared with: add or remove people, or (for
    /// someone else’s list) remove yourself.
    @objc func manage(_ call: CAPPluginCall) {
        guard let target = target(call), let zone = call.getString("zone") else {
            call.reject("Missing list")
            return
        }
        Task {
            do {
                guard let share = try await existingShare(in: target.zoneID, db: target.db) else {
                    call.reject("This list isn’t shared")
                    return
                }
                await present(share, zone: zone, call: call)
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @MainActor private func present(_ share: CKShare, zone: String, call: CAPPluginCall) {
        guard let host = bridge?.viewController else {
            call.reject("Nowhere to show sharing")
            return
        }
        let controller = UICloudSharingController(share: share, container: center.container)
        controller.delegate = self
        controller.availablePermissions = [.allowReadWrite, .allowPrivate]
        if let popover = controller.popoverPresentationController {
            popover.sourceView = host.view
            popover.sourceRect = CGRect(x: host.view.bounds.midX, y: host.view.bounds.midY, width: 1, height: 1)
            popover.permittedArrowDirections = []
        }
        sheetZone = zone
        host.present(controller, animated: true)
        call.resolve(["shown": true])
    }

    public func cloudSharingController(_ csc: UICloudSharingController, failedToSaveShareWithError error: Error) {
        notifyListeners("shareError", data: ["message": error.localizedDescription])
    }

    public func itemTitle(for csc: UICloudSharingController) -> String? {
        csc.share?[CKShare.SystemFieldKey.title] as? String
    }

    /// The owner stopped sharing, or someone removed themselves.
    public func cloudSharingControllerDidStopSharing(_ csc: UICloudSharingController) {
        if let zone = sheetZone {
            notifyListeners("shareStopped", data: ["zone": zone])
        }
    }

    /// Someone else’s list: leave it.
    @objc func leave(_ call: CAPPluginCall) {
        guard let target = target(call) else {
            call.reject("Missing list")
            return
        }
        Task {
            do {
                _ = try await target.db.modifyRecordZones(saving: [], deleting: [target.zoneID])
                center.setToken(nil, center.tokenKey(target.zoneID, shared: true))
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// My list: stop sharing it. Deleting the zone removes it for everyone
    /// else (they keep a copy) and leaves my own prayers untouched.
    @objc func stopSharing(_ call: CAPPluginCall) {
        guard let zone = call.getString("zone") else {
            call.reject("Missing list")
            return
        }
        let zoneID = CKRecordZone.ID(zoneName: zone, ownerName: CKCurrentUserDefaultName)
        Task {
            do {
                _ = try await center.privateDB.modifyRecordZones(saving: [], deleting: [zoneID])
                center.setToken(nil, center.tokenKey(zoneID, shared: false))
                call.resolve()
            } catch let error as CKError where error.code == .zoneNotFound {
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    // MARK: Moving records

    @objc func push(_ call: CAPPluginCall) {
        guard let target = target(call), let list = call.getArray("records") else {
            call.reject("Missing list or records")
            return
        }
        let records = makeRecords(list, in: target.zoneID)
        Task {
            do {
                try await save(records, to: target.db)
                call.resolve(["saved": records.count])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// Everything new in my shared lists and in lists shared with me,
    /// including lists I have just joined, and any that have gone.
    @objc func pull(_ call: CAPPluginCall) {
        let known = call.getArray("zones") ?? []
        Task {
            do {
                var zones: [[String: Any]] = []
                var gone: [String] = []

                let sharedZones = try await center.sharedDB.allRecordZones().map(\.zoneID)
                for zoneID in sharedZones {
                    if let changes = try await changes(in: zoneID, db: center.sharedDB, shared: true) {
                        zones.append(changes)
                    } else {
                        gone.append(zoneID.zoneName)
                    }
                }

                let privateZones = try await center.privateDB.allRecordZones()
                    .map(\.zoneID)
                    .filter { $0.zoneName.hasPrefix(CloudShareCenter.zonePrefix) }
                for zoneID in privateZones {
                    if let changes = try await changes(in: zoneID, db: center.privateDB, shared: false) {
                        zones.append(changes)
                    }
                }

                // Lists this device knows about that are no longer there.
                let present = Set(sharedZones.map(\.zoneName) + privateZones.map(\.zoneName))
                for case let item as JSObject in known {
                    if let zone = item["zone"] as? String, !present.contains(zone) {
                        gone.append(zone)
                    }
                }
                call.resolve(["zones": zones, "gone": Array(Set(gone))])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    // MARK: Helpers

    private struct Target {
        let db: CKDatabase
        let zoneID: CKRecordZone.ID
    }

    private func target(_ call: CAPPluginCall) -> Target? {
        guard let zone = call.getString("zone") else { return nil }
        if (call.getString("scope") ?? "private") == "private" {
            return Target(db: center.privateDB, zoneID: CKRecordZone.ID(zoneName: zone, ownerName: CKCurrentUserDefaultName))
        }
        guard let owner = call.getString("ownerName"), !owner.isEmpty else { return nil }
        return Target(db: center.sharedDB, zoneID: CKRecordZone.ID(zoneName: zone, ownerName: owner))
    }

    private func makeRecords(_ list: JSArray, in zoneID: CKRecordZone.ID) -> [CKRecord] {
        list.compactMap { value -> CKRecord? in
            guard let item = value as? JSObject,
                  let id = item["id"] as? String,
                  let type = item["type"] as? String else { return nil }
            let record = CKRecord(recordType: type, recordID: CKRecord.ID(recordName: id, zoneID: zoneID))
            // Prayer details are end-to-end encrypted: only the people the
            // list is shared with can read them, not Apple and not us.
            record.encryptedValues["json"] = (item["json"] as? String ?? "{}") as NSString
            record["sharedAt"] = NSNumber(value: item["sharedAt"] as? Double ?? 0)
            record["deleted"] = NSNumber(value: (item["deleted"] as? Bool ?? false) ? 1 : 0)
            return record
        }
    }

    /// Saves in batches (CloudKit takes up to 400 records a request).
    /// Which version wins was already decided in the app.
    private func save(_ records: [CKRecord], to db: CKDatabase) async throws {
        var start = 0
        while start < records.count {
            let batch = Array(records[start..<min(start + 300, records.count)])
            let (results, _) = try await db.modifyRecords(saving: batch, deleting: [], savePolicy: .allKeys, atomically: false)
            for (_, result) in results {
                if case .failure(let error) = result { throw error }
            }
            start += 300
        }
    }

    private func existingShare(in zoneID: CKRecordZone.ID, db: CKDatabase) async throws -> CKShare? {
        do {
            let record = try await db.record(for: CKRecord.ID(recordName: CKRecordNameZoneWideShare, zoneID: zoneID))
            return record as? CKShare
        } catch let error as CKError where error.code == .unknownItem {
            return nil
        }
    }

    /// New records in one zone since the last pull, or nil if the zone has gone.
    private func changes(in zoneID: CKRecordZone.ID, db: CKDatabase, shared: Bool) async throws -> [String: Any]? {
        let key = center.tokenKey(zoneID, shared: shared)
        var token = center.token(key)
        let isNew = token == nil
        var records: [[String: Any]] = []
        var moreComing = true
        do {
            while moreComing {
                let result = try await db.recordZoneChanges(inZoneWith: zoneID, since: token)
                for (_, outcome) in result.modificationResultsByID {
                    guard case .success(let modification) = outcome else { continue }
                    let record = modification.record
                    guard record.recordType == "Prayer" || record.recordType == "List" else { continue }
                    records.append([
                        "id": record.recordID.recordName,
                        "type": record.recordType,
                        "json": record.encryptedValues["json"] as? String ?? "{}",
                        "sharedAt": (record["sharedAt"] as? NSNumber)?.doubleValue ?? 0,
                        "deleted": ((record["deleted"] as? NSNumber)?.intValue ?? 0) == 1,
                    ])
                }
                token = result.changeToken
                moreComing = result.moreComing
            }
        } catch let error as CKError where error.code == .zoneNotFound || error.code == .userDeletedZone || error.code == .changeTokenExpired {
            center.setToken(nil, key)
            if error.code == .changeTokenExpired { return try await changes(in: zoneID, db: db, shared: shared) }
            return nil
        }
        center.setToken(token, key)

        var zone: [String: Any] = [
            "zone": zoneID.zoneName,
            "scope": shared ? "shared" : "private",
            "ownerName": zoneID.ownerName,
            "records": records,
            "isNew": isNew,
        ]
        if isNew, let share = try? await existingShare(in: zoneID, db: db) {
            zone["title"] = share[CKShare.SystemFieldKey.title] as? String ?? ""
            if shared, let name = share.owner.userIdentity.nameComponents {
                zone["ownerDisplay"] = PersonNameComponentsFormatter.localizedString(from: name, style: .short)
            }
        }
        return zone
    }
}
