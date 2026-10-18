import UIKit
import GoogleMaps

/// Quavi's own artwork above the native map. Projection happens on the same native
/// camera callback as Google, without a JS round trip or animated marker snapshots.
final class QuaviMapArtwork: UIView {
    weak var map: GMSMapView?
    private var items: [Int: QuaviArtworkPin] = [:]
    private var observers: [NSObjectProtocol] = []
    private var active = true

    init(map: GMSMapView) {
        self.map = map
        super.init(frame: map.bounds)
        autoresizingMask = [.flexibleWidth, .flexibleHeight]
        clipsToBounds = true
        isAccessibilityElement = false
        map.addSubview(self)
        let center = NotificationCenter.default
        for name in [UIAccessibility.reduceMotionStatusDidChangeNotification,
                     UIApplication.didBecomeActiveNotification, UIApplication.willResignActiveNotification] {
            observers.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
                guard let self else { return }
                if note.name == UIApplication.willResignActiveNotification { self.active = false }
                if note.name == UIApplication.didBecomeActiveNotification { self.active = true }
                self.layoutArtwork()
            })
        }
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
    deinit { observers.forEach { NotificationCenter.default.removeObserver($0) } }

    func upsert(_ marker: GMSMarker, metadata: [String: Any], tap: @escaping () -> Void) {
        let key = marker.hash.hashValue
        let item = items[key] ?? QuaviArtworkPin()
        if items[key] == nil { items[key] = item; addSubview(item) }
        item.marker = marker
        item.configure(metadata, tap: tap)
        layoutArtwork()
    }
    func remove(_ marker: GMSMarker) {
        items.removeValue(forKey: marker.hash.hashValue)?.removeFromSuperview()
    }
    override func layoutSubviews() { super.layoutSubviews(); layoutArtwork() }
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        nil // Google owns gesture recognition, including taps; dispatch after it resolves a tap.
    }
    func handleTap(at point: CGPoint) -> Bool {
        for item in items.values.sorted(by: { $0.priority > $1.priority }) {
            if !item.isHidden && item.interactive && item.containsArtwork(point) {
                item.activate(); return true
            }
        }
        return false
    }
    func layoutArtwork() {
        guard let map, bounds.width > 0, bounds.height > 0 else { return }
        CATransaction.begin(); CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        let ordered = items.values.sorted {
            if $0.priority == $1.priority { return $0.key < $1.key }
            return $0.priority > $1.priority
        }
        var bodies: [(QuaviArtworkPin, CGRect)] = []
        for item in ordered {
            guard let marker = item.marker else { continue }
            item.frame = bounds
            let point = map.projection.point(for: marker.position)
            item.positionBody(at: point)
            item.isHidden = !bounds.insetBy(dx: -50, dy: -50).intersects(item.body.frame)
            item.animate(active: active && !item.isHidden && bounds.intersects(item.body.frame))
            if !item.isHidden && item.kind != "coin" { bodies.append((item, item.body.frame.insetBy(dx: -4, dy: -4))) }
        }
        // Labels clear the screen chrome and Google's attribution, and remain tied to their pin.
        let top = map.padding.top + 4
        let bottom = max(36, map.padding.bottom + 24)
        let safe = CGRect(x: 10, y: top, width: max(0, bounds.width - 20), height: max(0, bounds.height - top - bottom))
        var occupied: [CGRect] = []
        for item in ordered where !item.isHidden {
            bringSubviewToFront(item)
            let show = item.label.image != nil && (!item.quest || item.selectedPin || map.camera.zoom >= 16.25)
            item.label.isHidden = !show
            if !show { continue }
            let b = item.body.frame, size = item.labelSize
            let candidates = [
                CGRect(x: b.midX - size.width / 2, y: b.maxY + 3, width: size.width, height: size.height),
                CGRect(x: b.maxX + 7, y: b.midY - size.height / 2, width: size.width, height: size.height),
                CGRect(x: b.minX - size.width - 7, y: b.midY - size.height / 2, width: size.width, height: size.height),
                CGRect(x: b.midX - size.width / 2, y: b.minY - size.height - 5, width: size.width, height: size.height)
            ].map { rect -> CGRect in
                var r = rect
                r.origin.x = max(safe.minX, min(r.minX, safe.maxX - r.width))
                return r
            }
            let placed = candidates.first { r in
                safe.contains(r) && !b.insetBy(dx: -2, dy: -2).intersects(r) && !occupied.contains(where: { $0.intersects(r) }) &&
                !bodies.contains(where: { $0.0 !== item && $0.1.intersects(r) })
            }
            if let placed { item.label.frame = placed; occupied.append(placed.insetBy(dx: -3, dy: -3)) }
            else { item.label.isHidden = true } // Never draw overlapping or clipped labels.
        }
        // Highest-priority pins and their labels draw last.
        ordered.reversed().forEach { bringSubviewToFront($0) }
    }
}

private final class QuaviArtworkPin: UIControl {
    weak var marker: GMSMarker?
    let body = UIImageView(), label = UIImageView()
    private let pulse = CAShapeLayer()
    private var anchor = CGPoint.zero
    private var bodySize = CGSize.zero
    var labelSize = CGSize.zero
    var kind = "quest", key = ""
    var quest = false, selectedPin = false, interactive = false
    var priority: Int { kind == "you" ? 100 : selectedPin ? 90 : kind == "current" ? 80 : kind == "dest" ? 70 : kind == "coin" ? 0 : 20 }
    private var tapAction: (() -> Void)?
    private var bodyURL = "", labelURL = ""
    private var animating = false
    private var animationKind = ""

    override init(frame: CGRect) {
        super.init(frame: frame)
        layer.addSublayer(pulse)
        pulse.fillColor = UIColor(red: 249/255, green: 203/255, blue: 47/255, alpha: 1).cgColor
        pulse.opacity = 0
        addSubview(body); addSubview(label)
        body.contentMode = .scaleToFill; label.contentMode = .scaleToFill
        body.layer.shadowColor = UIColor.black.cgColor
        body.layer.shadowOpacity = 0.2; body.layer.shadowOffset = CGSize(width: 0, height: 1); body.layer.shadowRadius = 2
        addTarget(self, action: #selector(tapped), for: .touchUpInside)
    }
    convenience init() { self.init(frame: .zero) }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
    @objc private func tapped() { tapAction?() }
    func activate() { tapAction?() }
    override func accessibilityActivate() -> Bool { guard interactive else { return false }; activate(); return true }
    func configure(_ m: [String: Any], tap: @escaping () -> Void) {
        key = m["key"] as? String ?? ""; kind = m["kind"] as? String ?? "quest"
        quest = m["quest"] as? Bool ?? false; selectedPin = m["selected"] as? Bool ?? false
        interactive = m["interactive"] as? Bool ?? false
        tapAction = tap
        isAccessibilityElement = kind != "coin"
        accessibilityLabel = m["title"] as? String
        accessibilityTraits = interactive ? .button : .image
        let url = m["bodyUrl"] as? String ?? ""
        if url != bodyURL { bodyURL = url; body.image = Self.png(url) }
        let name = m["labelUrl"] as? String ?? ""
        if name != labelURL { labelURL = name; label.image = Self.png(name) }
        bodySize = CGSize(width: m["width"] as? Double ?? 30, height: m["height"] as? Double ?? 44)
        labelSize = CGSize(width: m["labelWidth"] as? Double ?? 0, height: m["labelHeight"] as? Double ?? 0)
        anchor = CGPoint(x: m["anchorX"] as? Double ?? 15, y: m["anchorY"] as? Double ?? 44)
        if animationKind != kind { animating = false; pulse.removeAllAnimations(); body.layer.removeAllAnimations(); animationKind = kind }
    }
    func positionBody(at p: CGPoint) {
        body.frame = CGRect(origin: CGPoint(x: p.x - anchor.x, y: p.y - anchor.y), size: bodySize)
        let diameter: CGFloat = kind == "you" ? 74 : 70
        pulse.bounds = CGRect(x: 0, y: 0, width: diameter, height: diameter)
        pulse.position = CGPoint(x: body.frame.midX, y: body.frame.minY + (kind == "you" ? 38 : 20))
        pulse.path = UIBezierPath(ovalIn: pulse.bounds).cgPath
    }
    func animate(active: Bool) {
        let motion = active && !UIAccessibility.isReduceMotionEnabled
        let ring = kind == "you" || kind == "current"
        pulse.isHidden = !ring
        if !motion {
            pulse.removeAllAnimations(); body.layer.removeAllAnimations(); animating = false
            pulse.opacity = ring ? 0.3 : 0
            return
        }
        if animating { return }; animating = true
        if ring {
            let scale = CABasicAnimation(keyPath: "transform.scale")
            scale.fromValue = 0.55; scale.toValue = 1.5
            let fade = CABasicAnimation(keyPath: "opacity")
            fade.fromValue = 0.65; fade.toValue = 0
            let group = CAAnimationGroup(); group.animations = [scale, fade]
            group.duration = kind == "you" ? 2.4 : 2.6
            group.timingFunction = CAMediaTimingFunction(name: .easeOut); group.repeatCount = .infinity
            pulse.add(group, forKey: "quavi-pulse")
        }
        if kind == "coin" {
            let bob = CABasicAnimation(keyPath: "transform.translation.y")
            bob.fromValue = 0; bob.toValue = -3; bob.duration = 0.8; bob.autoreverses = true
            bob.repeatCount = .infinity; bob.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            body.layer.add(bob, forKey: "quavi-coin")
        }
    }
    func containsArtwork(_ point: CGPoint) -> Bool {
        body.frame.insetBy(dx: -9, dy: -9).contains(point) || (!label.isHidden && label.frame.contains(point))
    }
    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool { interactive && containsArtwork(point) }
    private static func png(_ url: String) -> UIImage? {
        guard url.hasPrefix("data:image/png;base64,"), url.utf8.count < 524288,
              let data = Data(base64Encoded: String(url.dropFirst(22))), let image = UIImage(data: data),
              image.size.width <= 1024, image.size.height <= 1024 else { return nil }
        return image
    }
}
