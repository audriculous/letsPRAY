import Capacitor

/// The app’s web view, with Let’s Pray’s own native plugins registered:
/// widgets and iCloud shared lists.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WidgetBridgePlugin())
        bridge?.registerPluginInstance(CloudSharePlugin())
    }
}
