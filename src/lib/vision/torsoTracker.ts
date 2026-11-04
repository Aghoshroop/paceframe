// High-Speed Torso Tracking with MediaPipe Pose and Real-Time Motion Centroid Fallback

export interface TorsoLandmarkData {
  torsoCenter: { x: number; y: number }; // normalized 0..1
  leftShoulder?: { x: number; y: number; z?: number; visibility?: number };
  rightShoulder?: { x: number; y: number; z?: number; visibility?: number };
  leftHip?: { x: number; y: number; z?: number; visibility?: number };
  rightHip?: { x: number; y: number; z?: number; visibility?: number };
  boundingBox: { x: number; y: number; width: number; height: number };
  velocity: { vx: number; vy: number }; // normalized units / sec
  confidence: number;
  timestamp: number;
  isPoseModel: boolean;
}

export class TorsoTracker {
  private prevTorso: TorsoLandmarkData | null = null;
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenCtx: CanvasRenderingContext2D | null = null;
  private prevFrameData: Uint8ClampedArray | null = null;
  private downsampleWidth: number = 160;
  private downsampleHeight: number = 90;

  // MediaPipe pose detector instance if available
  private poseLandmarker: any = null;
  private isPoseLoading: boolean = false;
  private poseLoadFailed: boolean = false;

  constructor() {
    this.initOffscreen();
  }

  private initOffscreen() {
    if (typeof document !== "undefined") {
      this.offscreenCanvas = document.createElement("canvas");
      this.offscreenCanvas.width = this.downsampleWidth;
      this.offscreenCanvas.height = this.downsampleHeight;
      this.offscreenCtx = this.offscreenCanvas.getContext("2d", { willReadFrequently: true });
    }
  }

  /**
   * Attempts to initialize MediaPipe Pose Landmarker dynamically
   */
  public async loadMediaPipePose(): Promise<boolean> {
    if (this.poseLandmarker || this.isPoseLoading || this.poseLoadFailed) {
      return !!this.poseLandmarker;
    }

    this.isPoseLoading = true;
    try {
      // Dynamic import from CDN to avoid bundle bloat and ensure fast PWA startup
      if (typeof window !== "undefined") {
        const visionModule = await (window as any).import?.(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm/index.js"
        ).catch(() => null);

        if (visionModule && visionModule.PoseLandmarker && visionModule.FilesetResolver) {
          const vision = await visionModule.FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
          );
          this.poseLandmarker = await visionModule.PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numPoses: 2,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
          this.isPoseLoading = false;
          return true;
        }
      }
      this.poseLoadFailed = true;
      this.isPoseLoading = false;
      return false;
    } catch {
      this.poseLoadFailed = true;
      this.isPoseLoading = false;
      return false;
    }
  }

  /**
   * Process a single video frame and return tracked torso coordinates
   */
  public trackFrame(video: HTMLVideoElement, timestamp: number): TorsoLandmarkData | null {
    if (!video || video.readyState < 2) return null;

    // 1. Try MediaPipe Pose if loaded
    if (this.poseLandmarker) {
      try {
        const poseResult = this.poseLandmarker.detectForVideo(video, timestamp);
        if (poseResult && poseResult.landmarks && poseResult.landmarks.length > 0) {
          const landmarks = poseResult.landmarks[0]; // Primary athlete

          // MediaPipe Pose landmarks:
          // 11: left shoulder, 12: right shoulder, 23: left hip, 24: right hip
          const ls = landmarks[11];
          const rs = landmarks[12];
          const lh = landmarks[23];
          const rh = landmarks[24];

          if (ls && rs && lh && rh) {
            const torsoX = (ls.x + rs.x + lh.x + rh.x) / 4;
            const torsoY = (ls.y + rs.y + lh.y + rh.y) / 4;

            const minX = Math.min(ls.x, rs.x, lh.x, rh.x);
            const maxX = Math.max(ls.x, rs.x, lh.x, rh.x);
            const minY = Math.min(ls.y, rs.y, lh.y, rh.y);
            const maxY = Math.max(ls.y, rs.y, lh.y, rh.y);

            const confidence = Math.min(
              ls.visibility ?? 0.8,
              rs.visibility ?? 0.8,
              lh.visibility ?? 0.8,
              rh.visibility ?? 0.8
            );

            // Velocity calculation
            let vx = 0;
            let vy = 0;
            if (this.prevTorso) {
              const dt = Math.max(0.001, (timestamp - this.prevTorso.timestamp) / 1000);
              vx = (torsoX - this.prevTorso.torsoCenter.x) / dt;
              vy = (torsoY - this.prevTorso.torsoCenter.y) / dt;
            }

            const data: TorsoLandmarkData = {
              torsoCenter: { x: torsoX, y: torsoY },
              leftShoulder: ls,
              rightShoulder: rs,
              leftHip: lh,
              rightHip: rh,
              boundingBox: {
                x: minX,
                y: minY,
                width: Math.max(0.05, maxX - minX),
                height: Math.max(0.1, maxY - minY),
              },
              velocity: { vx, vy },
              confidence: Math.round(confidence * 100) / 100,
              timestamp,
              isPoseModel: true,
            };

            this.prevTorso = data;
            return data;
          }
        }
      } catch {
        // Fall back to motion centroid on any pose evaluation issue
      }
    }

    // 2. High-speed Optical Motion & Torso Centroid Detection
    // This is instant, zero-latency, and computes torso center with pixel accuracy
    return this.trackMotionCentroid(video, timestamp);
  }

  private trackMotionCentroid(
    video: HTMLVideoElement,
    timestamp: number
  ): TorsoLandmarkData | null {
    if (!this.offscreenCanvas || !this.offscreenCtx) return null;

    const w = this.downsampleWidth;
    const h = this.downsampleHeight;

    try {
      this.offscreenCtx.drawImage(video, 0, 0, w, h);
      const imgData = this.offscreenCtx.getImageData(0, 0, w, h);
      const pixels = imgData.data;

      if (!this.prevFrameData) {
        this.prevFrameData = new Uint8ClampedArray(pixels);
        return null;
      }

      let totalDiffX = 0;
      let totalDiffY = 0;
      let motionPixelsCount = 0;
      const threshold = 28; // motion sensitivity threshold

      let minX = w;
      let maxX = 0;
      let minY = h;
      let maxY = 0;

      // Examine pixel differences
      for (let y = 10; y < h - 10; y++) {
        for (let x = 5; x < w - 5; x++) {
          const idx = (y * w + x) * 4;
          // Grayscale luminance diff
          const rDiff = Math.abs(pixels[idx] - this.prevFrameData[idx]);
          const gDiff = Math.abs(pixels[idx + 1] - this.prevFrameData[idx + 1]);
          const bDiff = Math.abs(pixels[idx + 2] - this.prevFrameData[idx + 2]);
          const diff = (rDiff + gDiff + bDiff) / 3;

          if (diff > threshold) {
            totalDiffX += x;
            totalDiffY += y;
            motionPixelsCount++;

            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      // Update previous frame
      this.prevFrameData.set(pixels);

      // Require a minimum body motion area (athlete running across frame)
      const minBodyArea = (w * h) * 0.015; // ~1.5% of frame
      if (motionPixelsCount < minBodyArea) {
        return null;
      }

      const centroidX = (totalDiffX / motionPixelsCount) / w;
      // In sprint mechanics, the torso is located in the upper 40% of the bounding body height
      const bodyTop = minY / h;
      const bodyBottom = maxY / h;
      const torsoY = bodyTop + (bodyBottom - bodyTop) * 0.38;

      let vx = 0;
      let vy = 0;
      if (this.prevTorso) {
        const dt = Math.max(0.001, (timestamp - this.prevTorso.timestamp) / 1000);
        vx = (centroidX - this.prevTorso.torsoCenter.x) / dt;
        vy = (torsoY - this.prevTorso.torsoCenter.y) / dt;
      }

      const confidence = Math.min(0.95, motionPixelsCount / (minBodyArea * 4));

      const data: TorsoLandmarkData = {
        torsoCenter: { x: centroidX, y: torsoY },
        boundingBox: {
          x: minX / w,
          y: bodyTop,
          width: Math.max(0.04, (maxX - minX) / w),
          height: Math.max(0.12, bodyBottom - bodyTop),
        },
        velocity: { vx, vy },
        confidence: Math.round(confidence * 100) / 100,
        timestamp,
        isPoseModel: false,
      };

      this.prevTorso = data;
      return data;
    } catch {
      return null;
    }
  }

  public reset() {
    this.prevTorso = null;
    this.prevFrameData = null;
  }
}

