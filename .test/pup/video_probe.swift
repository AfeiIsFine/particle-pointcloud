// 抽帧 + 读元数据：用 AVFoundation，无需 ffmpeg
// 用法: swift video_probe.swift <input.mp4> <outdir> [模式]
//   模式 sample : 均匀抽 12 帧（了解内容）
//   模式 frames <start> <end> <fps> <maxW> : 抽连续帧（做 GIF）
import AVFoundation
import AppKit
import Foundation

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("用法: video_probe.swift <input> <outdir> [sample|frames ...]\n".data(using: .utf8)!)
    exit(1)
}
let inPath = args[1]
let outDir = args[2]
let mode = args.count > 3 ? args[3] : "sample"

let url = URL(fileURLWithPath: inPath)
let asset = AVURLAsset(url: url)

guard let track = asset.tracks(withMediaType: .video).first else {
    FileHandle.standardError.write("❌ 找不到视频轨\n".data(using: .utf8)!)
    exit(2)
}

let dur = CMTimeGetSeconds(asset.duration)
let fps = track.nominalFrameRate
// 显示尺寸必须按 preferredTransform 换算：竖屏视频（手机拍摄）的编码尺寸是横向的
// 1920x1080 + 90° 旋转，真实显示是 1080x1920。直接用 naturalSize 会判错。
let dispSize = track.naturalSize.applying(track.preferredTransform)
let dispW = Int(abs(dispSize.width).rounded())
let dispH = Int(abs(dispSize.height).rounded())
let encW = Int(abs(track.naturalSize.width).rounded())
let encH = Int(abs(track.naturalSize.height).rounded())

print("时长: \(String(format: "%.2f", dur)) 秒")
print("编码尺寸: \(encW) x \(encH)   显示尺寸: \(dispW) x \(dispH)")
print("方向: \(dispW > dispH ? "横屏 landscape" : "竖屏 portrait")")
print("帧率: \(String(format: "%.2f", fps)) fps   总帧数约: \(Int(dur * Double(fps)))")
print("轨道码率: \(track.estimatedDataRate / 1000) kbps")

try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.requestedTimeToleranceBefore = .zero
gen.requestedTimeToleranceAfter = .zero

func save(_ cg: CGImage, _ name: String, maxW: Int) {
    var img = cg
    if maxW > 0 && cg.width > maxW {
        let scale = Double(maxW) / Double(cg.width)
        let nw = maxW, nh = Int(Double(cg.height) * scale)
        let ctx = CGContext(data: nil, width: nw, height: nh, bitsPerComponent: 8,
                            bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.interpolationQuality = .high
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: nw, height: nh))
        img = ctx.makeImage()!
    }
    let rep = NSBitmapImageRep(cgImage: img)
    guard let data = rep.representation(using: .png, properties: [:]) else { return }
    let out = URL(fileURLWithPath: outDir).appendingPathComponent(name)
    try? data.write(to: out)
}

if mode == "sample" {
    let n = 12
    for i in 0..<n {
        // 首尾各留 2%，避免黑场 / 尾声
        let t = dur * (0.02 + 0.96 * Double(i) / Double(n - 1))
        let time = CMTime(seconds: t, preferredTimescale: 600)
        do {
            let cg = try gen.copyCGImage(at: time, actualTime: nil)
            save(cg, String(format: "s_%02d_t%.1f.png", i, t), maxW: 560)
            print(String(format: "  抽帧 t=%.2fs  %d x %d", t, cg.width, cg.height))
        } catch {
            print(String(format: "  t=%.2fs 抽帧失败: %@", t, "\(error)"))
        }
    }
} else {
    // frames <start> <end> <fps> <maxW>
    let start = Double(args.count > 4 ? args[4] : "0") ?? 0
    let end = Double(args.count > 5 ? args[5] : "5") ?? 5
    let wantFps = Double(args.count > 6 ? args[6] : "12") ?? 12
    let maxW = Int(args.count > 7 ? args[7] : "800") ?? 800
    let count = max(1, Int((end - start) * wantFps))
    let step = (end - start) / Double(count)
    print("抽连续帧: \(String(format: "%.1f", start))s → \(String(format: "%.1f", end))s @ \(wantFps)fps = \(count) 帧, 宽 \(maxW)")
    for i in 0..<count {
        let t = start + Double(i) * step
        let time = CMTime(seconds: t, preferredTimescale: 600)
        do {
            let cg = try gen.copyCGImage(at: time, actualTime: nil)
            save(cg, String(format: "f_%04d.png", i), maxW: maxW)
        } catch {
            print("  帧 \(i) 失败")
        }
    }
    print("完成：\(count) 帧写入 \(outDir)")
}
