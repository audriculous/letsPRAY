import Capacitor
import WidgetKit

/// Hands the widget its snapshot of the coming week. The app writes it into
/// the shared App Group; the widget extension reads it from there.
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "LetsPrayWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise)
    ]

    static let appGroup = "group.com.letspray.app"

    @objc func update(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else {
            call.reject("Missing snapshot")
            return
        }
        guard let shared = UserDefaults(suiteName: Self.appGroup) else {
            call.reject("App Group \(Self.appGroup) is not set up")
            return
        }
        shared.set(json, forKey: "snapshot")
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }
}
