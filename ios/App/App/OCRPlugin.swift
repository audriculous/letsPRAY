import Capacitor
import UIKit
import Vision

/// Reads the words in a journal photo with Apple's Vision framework, on the
/// device. Handles print and most neat handwriting; nothing is uploaded.
@objc(OCRPlugin)
public class OCRPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OCRPlugin"
    public let jsName = "LetsPrayOCR"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "recognize", returnType: CAPPluginReturnPromise)
    ]

    @objc func recognize(_ call: CAPPluginCall) {
        // Accepts a plain base64 JPEG or a data: URL.
        let raw = call.getString("image") ?? ""
        let base64 = raw.components(separatedBy: ",").last ?? raw
        guard let data = Data(base64Encoded: base64), let image = UIImage(data: data)?.cgImage else {
            call.reject("No photo to read")
            return
        }
        let request = VNRecognizeTextRequest { request, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            // Top of the page first (Vision's y axis starts at the bottom).
            let lines = (request.results as? [VNRecognizedTextObservation] ?? [])
                .sorted { $0.boundingBox.maxY > $1.boundingBox.maxY }
                .compactMap { $0.topCandidates(1).first?.string }
            call.resolve(["text": lines.joined(separator: "\n")])
        }
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        if #available(iOS 16.0, *) {
            request.automaticallyDetectsLanguage = true
        }
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try VNImageRequestHandler(cgImage: image, orientation: .up, options: [:]).perform([request])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }
}
