import Capacitor

/// The app’s web view, with Let’s Pray’s own native plugins registered:
/// widgets, iCloud shared lists and reading journal photos.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WidgetBridgePlugin())
        bridge?.registerPluginInstance(CloudSharePlugin())
        bridge?.registerPluginInstance(OCRPlugin())
    }
}
