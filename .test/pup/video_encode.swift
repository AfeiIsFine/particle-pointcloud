// 视频剪辑+转码：AVMutableComposition 拼高光片段 → 720p H.264 导出。无需 ffmpeg。
// 用法: swift video_encode.swift <输入> <输出.mp4> [preset]
//   preset 默认 AVAssetExportPreset1280x720（720p，自动处理缩放与方向）
import AVFoundation
import Foundation

let a = CommandLine.arguments
guard a.count >= 3 else {
    FileHandle.standardError.write("用法: video_encode.swift <in> <out.mp4> [preset]\n".data(using: .utf8)!)
    exit(1)
}
let inURL = URL(fileURLWithPath: a[1])
let outURL = URL(fileURLWithPath: a[2])
let preset = a.count > 3 ? a[3] : AVAssetExportPreset1280x720

// 高光片段（按秒）：彩色抽象 / 树成形 / 纯点云树 / 米色山水
// 每段取的依据是实测"运动量"曲线 —— 静止段一律不要，否则观众以为图没动
let CUTS: [(Double, Double)] = [
    (44.0, 50.0),    // 彩色抽象粒子
    (71.0, 78.5),    // 粒子聚集成树（含面板收起）
    (82.5, 88.0),    // 白色粒子云
    (95.0, 108.0),   // 米色山水成形
]

try? FileManager.default.removeItem(at: outURL)
let asset = AVURLAsset(url: inURL)
guard let vTrack = asset.tracks(withMediaType: .video).first else {
    FileHandle.standardError.write("❌ 无视频轨\n".data(using: .utf8)!)
    exit(2)
}
let aTrack = asset.tracks(withMediaType: .audio).first
let dispSize = vTrack.naturalSize.applying(vTrack.preferredTransform)
print("输入: \(Int(abs(dispSize.width)))x\(Int(abs(dispSize.height)))  \(String(format: "%.1f", CMTimeGetSeconds(asset.duration)))s")

let comp = AVMutableComposition()
guard let cv = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
    FileHandle.standardError.write("❌ 无法创建合成视频轨\n".data(using: .utf8)!)
    exit(3)
}
let ca = aTrack != nil ? comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) : nil

var cursor = CMTime.zero
var total = 0.0
for (s, e) in CUTS {
    let range = CMTimeRange(start: CMTime(seconds: s, preferredTimescale: 600),
                            duration: CMTime(seconds: e - s, preferredTimescale: 600))
    do {
        try cv.insertTimeRange(range, of: vTrack, at: cursor)
        if let ca = ca, let at = aTrack { try ca.insertTimeRange(range, of: at, at: cursor) }
        cursor = CMTimeAdd(cursor, range.duration)
        total += (e - s)
        print(String(format: "  片段 %.1f–%.1fs (%.1fs)", s, e, e - s))
    } catch {
        FileHandle.standardError.write("❌ 插入片段 \(s)–\(e) 失败: \(error)\n".data(using: .utf8)!)
        exit(4)
    }
}
// 保留源视频的朝向
cv.preferredTransform = vTrack.preferredTransform
print(String(format: "合计 %.1f 秒（原片 %.1f 秒）", total, CMTimeGetSeconds(asset.duration)))

guard let export = AVAssetExportSession(asset: comp, presetName: preset) else {
    FileHandle.standardError.write("❌ 预设 \(preset) 不可用\n".data(using: .utf8)!)
    exit(5)
}
export.outputURL = outURL
export.outputFileType = .mp4
export.shouldOptimizeForNetworkUse = true     // moov 前置：网页可边下边播

let sem = DispatchSemaphore(value: 0)
export.exportAsynchronously {
    if export.status == .completed {
        let attrs = try? FileManager.default.attributesOfItem(atPath: outURL.path)
        let size = (attrs?[.size] as? Int) ?? 0
        print(String(format: "✅ %@  %.1f MB  预设 %@", outURL.lastPathComponent, Double(size) / 1048576.0, preset))
    } else {
        print("❌ 失败: \(export.error?.localizedDescription ?? "未知，status=\(export.status.rawValue)")")
    }
    sem.signal()
}
sem.wait()
