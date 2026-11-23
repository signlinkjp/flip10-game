import UIKit
import Capacitor
import Foundation
import StoreKit
import AVFoundation

/* LINEZAP — アプリの入口（Build 1）
 *
 * `npx cap add ios` が作る AppDelegate を置き換える。中身は3つ:
 *
 *   1. アプリのデリゲート（テンプレートそのまま）
 *   2. FlipBridgeViewController — このアプリの Capacitor ビューコントローラ。
 *      StoreKit と音のプラグインをここでブリッジに渡す
 *   3. PRO（jp.signlink.Flip10.pro）の StoreKit 2 プラグインと、音の小さな橋
 *
 * プラグインを `cap sync` の packageClassList に任せない理由は JANKeN PoN /
 * CODE DUEL / ICE WOLF と同じ: そのリストは実行時に NSClassFromString で
 * 解決され、端末で見つからないと購入画面まで来ても StoreKit に届かない。
 * ここでインスタンスを作れば、クラスが無ければビルドエラーになる。
 */

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // 音のカテゴリを playback にしておく。マナースイッチ（消音）が入っていても
        // ゲームの音が鳴るようにするため。WebView 側は www/src/audio.js が
        // navigator.audioSession.type = 'playback' と無音の <audio> で追いかける。
        AppDelegate.activateAudioSession()
        return true
    }

    /// アプリ側の AVAudioSession を起こし直す。
    /// 電話・Siri・バックグラウンドから戻るとセッションが止まっていることがある。
    static func activateAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
        } catch {
            // 音が出せなくてもゲームは続けられる（落とさない）
            NSLog("LINEZAP: AVAudioSession setup failed: \(error)")
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // ホーム画面・通知・ロックへ移るとき。WebView の BGM と AudioSession を止める
        AppDelegate.pauseAudioForBackground()
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        AppDelegate.pauseAudioForBackground()
    }

    func applicationWillEnterForeground(_ application: UIApplication) {}

    func applicationDidBecomeActive(_ application: UIApplication) {
        // 戻ってきたら音を起こし直す（無音で戻る問題の対策）
        AppDelegate.activateAudioSession()
        AppDelegate.runInWebView("window.__flipResumeAudio && window.__flipResumeAudio()")
    }

    func applicationWillTerminate(_ application: UIApplication) {
        AppDelegate.pauseAudioForBackground()
    }

    /// SceneDelegate が作るこのアプリのブリッジ（WebView を触るために覚えておく）
    static weak var bridgeViewController: FlipBridgeViewController?

    /// WebView の JS を、あれば呼ぶ（無くてもアプリは落とさない）
    static func runInWebView(_ script: String) {
        DispatchQueue.main.async {
            guard let view = bridgeViewController else { return }
            view.bridge?.webView?.evaluateJavaScript(script) { _, error in
                if let error = error {
                    NSLog("LINEZAP: web audio hook failed: \(error.localizedDescription)")
                }
            }
        }
    }

    /// BGM をホーム画面に残さない。JS 側の AudioContext を suspend し、
    /// AVAudioSession も止める（どちらか片方でも鳴り続けないように二重にする）。
    static func pauseAudioForBackground() {
        runInWebView("window.__flipPauseAudio && window.__flipPauseAudio()")
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        } catch {
            NSLog("LINEZAP: AVAudioSession deactivate failed: \(error)")
        }
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}

/// このアプリのブリッジ。SceneDelegate がこれを root にする。
/// `capacitorDidLoad()` は WebView が最初のページを読む前に走るので、
/// ここで渡せば www/src/pro.js が最初の1回から StoreKit を見つけられる。
final class FlipBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(StoreKitPlugin())
        bridge?.registerPluginInstance(FlipAudioPlugin())
        bridge?.registerPluginInstance(FlipHapticsPlugin())
        AppDelegate.bridgeViewController = self
    }
}

/* 音のための小さなブリッジ。

   WKWebView の Web Audio は別プロセスの Audio Session で鳴るので、アプリ側の
   AVAudioSession を設定するだけでは足りない。それでも操作のたびにアプリ側の
   セッションを起こし直すことで、ほかのアプリの音と混ざる状態を保てる。
   www/src/audio.js の unlock()/revive() が、Capacitor があるときだけ呼ぶ。 */
@objc(FlipAudioPlugin)
public class FlipAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FlipAudioPlugin"
    public let jsName = "FlipAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "activate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise)
    ]

    @objc public func activate(_ call: CAPPluginCall) {
        AppDelegate.activateAudioSession()
        let session = AVAudioSession.sharedInstance()
        call.resolve([
            "category": session.category.rawValue,
            "otherAudio": session.isOtherAudioPlaying
        ])
    }

    /// 画面を離れるときに呼ばれる。JS 側の suspend と合わせて確実に止める
    @objc public func pause(_ call: CAPPluginCall) {
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
            call.resolve(["active": false])
        } catch {
            call.resolve(["active": true, "diag": "\(error.localizedDescription)"])
        }
    }
}

/* LINEZAP — バイブ（Haptics）のブリッジ。

   Capacitor の外部パッケージは足さず、UIKit の Taptic Engine を直接呼ぶ。
   www/src/haptics.js の `haptic({ kind })` が light / medium / heavy /
   success / warning / error を送ってくる。

   割り当て（www/src/main.js）:
     タイル選択 light / 入れ替え・反転 medium / ライン消去 success /
     コンボ2以上 heavy + success / ゲームオーバー error */
@objc(FlipHapticsPlugin)
public class FlipHapticsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FlipHapticsPlugin"
    public let jsName = "FlipHaptics"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "haptic", returnType: CAPPluginReturnPromise)
    ]

    @objc public func haptic(_ call: CAPPluginCall) {
        let kind = call.getString("kind") ?? "light"
        DispatchQueue.main.async {
            switch kind {
            case "medium":
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            case "heavy":
                UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
            case "success":
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            case "warning":
                UINotificationFeedbackGenerator().notificationOccurred(.warning)
            case "error":
                UINotificationFeedbackGenerator().notificationOccurred(.error)
            default:
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
            call.resolve(["kind": kind])
        }
    }
}

/* LINEZAP PRO（買い切り）の StoreKit 2 ブリッジ。
   非消耗型の1アイテム。ここは Apple が言ったことだけを返し、
   画面の判断は www/src/pro.js が持つ。

   失敗には必ず短い `SK: …` の理由を付ける（PRO シートが小さく表示する）:
     getProducts  → 商品が空なら `diag: "SK: empty"`（App Store Connect に商品が無い）
     purchase     → `SK: empty <id>`、または Apple のエラー文
     restore      → AppStore.sync() のエラー（購入済みなら entitled が正） */
@objc(StoreKitPlugin)
public class StoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoreKitPlugin"
    public let jsName = "StoreKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "entitlement", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise)
    ]

    static let defaultProductId = "jp.signlink.Flip10.pro"

    private var updatesTask: Task<Void, Never>?

    override public func load() {
        guard #available(iOS 15.0, *) else { return }
        /* ほかの端末からの購入や、途中で止まった購入がここに来る。
           アプリは自分の権利を自分で読むので、Web 側へは何も押し込まない。 */
        updatesTask = Task.detached {
            for await result in Transaction.updates {
                if case .verified(let transaction) = result {
                    await transaction.finish()
                }
            }
        }
    }

    deinit {
        updatesTask?.cancel()
    }

    private func productId(_ call: CAPPluginCall) -> String {
        let value = call.getString("id") ?? StoreKitPlugin.defaultProductId
        return value.isEmpty ? StoreKitPlugin.defaultProductId : value
    }

    private static func reason(_ error: Error) -> String {
        let text = error.localizedDescription.replacingOccurrences(of: "\n", with: " ")
        return text.isEmpty ? "unknown error" : text
    }

    @objc public func getProducts(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            call.reject("SK: needs iOS 15", "SK_IOS", nil)
            return
        }
        let ids = call.getArray("ids", String.self) ?? [StoreKitPlugin.defaultProductId]
        Task {
            do {
                let products = try await Product.products(for: ids)
                let list: [[String: Any]] = products.map { product in
                    [
                        "id": product.id,
                        "displayName": product.displayName,
                        "description": product.description,
                        "displayPrice": product.displayPrice,
                        "price": "\(product.price)",
                        "currencyCode": product.priceFormatStyle.currencyCode
                    ]
                }
                var answer: [String: Any] = ["products": list, "ids": ids]
                if list.isEmpty {
                    answer["diag"] = "SK: empty"
                    answer["message"] = "SK: empty — App Store returned no product for \(ids.joined(separator: ", ")). The product must exist in App Store Connect as 提出準備完了 and the paid apps agreement must be active."
                }
                call.resolve(answer)
            } catch {
                call.reject("SK: \(StoreKitPlugin.reason(error))", "SK_ERROR", error)
            }
        }
    }

    @objc public func entitlement(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            call.resolve(["entitled": false, "diag": "SK: needs iOS 15"])
            return
        }
        let id = productId(call)
        Task {
            let owned = await StoreKitPlugin.owns(id)
            call.resolve(["entitled": owned])
        }
    }

    @objc public func purchase(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            call.reject("SK: needs iOS 15", "SK_IOS", nil)
            return
        }
        let id = productId(call)
        Task { @MainActor in
            do {
                guard let product = try await Product.products(for: [id]).first else {
                    call.reject("SK: empty \(id)", "SK_EMPTY", nil)
                    return
                }
                switch try await product.purchase() {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        await transaction.finish()
                        call.resolve([
                            "status": "success",
                            "entitled": true,
                            "transactionId": String(transaction.id)
                        ])
                    case .unverified:
                        call.resolve([
                            "status": "failed",
                            "entitled": false,
                            "reason": "unverified",
                            "diag": "SK: unverified"
                        ])
                    }
                case .pending:
                    call.resolve(["status": "pending", "entitled": false])
                case .userCancelled:
                    call.resolve(["status": "cancelled", "entitled": false])
                @unknown default:
                    call.resolve([
                        "status": "failed",
                        "entitled": false,
                        "reason": "unknown",
                        "diag": "SK: unknown purchase result"
                    ])
                }
            } catch {
                call.reject("SK: \(StoreKitPlugin.reason(error))", "SK_ERROR", error)
            }
        }
    }

    @objc public func restore(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            call.resolve(["entitled": false, "diag": "SK: needs iOS 15"])
            return
        }
        let id = productId(call)
        Task {
            var syncError: String?
            do {
                try await AppStore.sync()
            } catch {
                syncError = "SK: \(StoreKitPlugin.reason(error))"
            }
            let owned = await StoreKitPlugin.owns(id)
            var answer: [String: Any] = ["entitled": owned]
            if let syncError = syncError, !owned {
                answer["diag"] = syncError
            }
            call.resolve(answer)
        }
    }

    /// 検証済みで、取り消されていない購入だけ true
    static func owns(_ productID: String) async -> Bool {
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            if transaction.productID == productID && transaction.revocationDate == nil {
                return true
            }
        }
        return false
    }
}
