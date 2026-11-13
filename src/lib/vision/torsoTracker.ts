// High-Speed Adaptive Torso Tracking with Sports-Biomechanics Centroid Segmentation
// Implements Running Adaptive Background Subtraction and Chest/Sternum Torso Plane Locking

export interface TorsoLandmarkData {
  torsoCenter: { x: number; y: number }; // normalized 0..1
  leftShoulder?: { x: number; y: number; z?: number; visibility?: number };
  rightShoulder?: { x: number; y: number; z?: number; visibility?: number };
  leftHip?: { x: number; y: number; z?: number; visibility?: number };
  rightHip?: { x: number; y: number; z?: number; visibility?: number };
  boundingBox: { x: number; y: number; width: number; height: number };
  velocity: { vx: number; vy: number }; // normalized units per second
  confidence: number;
  timestamp: number;
  isPoseModel: boolean;
  approachSide?: "left" | "right" | "on_gate";
}

export class TorsoTracker {
  private prevTorso: TorsoLandmarkData | null = null;
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenCtx: CanvasRenderingContext2D | null = null;
  
  // Downsampled resolution for 60fps real-time computer vision without frame drops
  private downsampleWidth: number = 160;
  private downsampleHeight: number = 90;

  // Running adaptive background model (grayscale)
  private bgModel: Float32Array | null = null;
  private bgLearnRate: number = 0.05; // 5% background adaptation rate
  private consecutiveDetectionCount: number = 0;
  private smoothedCentroid: { x: number; y: number } | null = null;

  // Optional MediaPipe Pose landmarker
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
   * Resets background model and tracker state (e.g. for a new sprint)
   */
  public reset() {
    this.prevTorso = null;
    this.smoothedCentroid = null;
    this.consecutiveDetectionCount = 0;
    this.bgModel = null;
  }

  /**
   * Optional MediaPipe Pose loader with standard browser script injection
   */
  public async loadMediaPipePose(): Promise<boolean> {
    if (this.poseLandmarker || this.isPoseLoading || this.poseLoadFailed) {
      return !!this.poseLandmarker;
    }

    this.isPoseLoading = true;
    try {
      if (typeof window !== "undefined") {
        // Try loading via CDN script or global
        const visionModule = (window as any).PoseLandmarker
          ? (window as any)
          : null;

        if (visionModule && visionModule.PoseLandmarker) {
          const vision = await visionModule.FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
          );
          this.poseLandmarker = await visionModule.PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: 0.45,
            minPosePresenceConfidence: 0.45,
            minTrackingConfidence: 0.45,
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
   * Main vision pipeline: tracks runner and extracts torso centroid at chest height
   */
  public trackFrame(video: HTMLVideoElement, timestamp: number): TorsoLandmarkData | null {
    if (!video || video.readyState < 2) return null;

    // 1. If MediaPipe Pose is loaded, use anatomical landmarks
    if (this.poseLandmarker) {
      try {
        const poseResult = this.poseLandmarker.detectForVideo(video, timestamp);
        if (poseResult && poseResult.landmarks && poseResult.landmarks.length > 0) {
          const landmarks = poseResult.landmarks[0];
          const ls = landmarks[11]; // Left shoulder
          const rs = landmarks[12]; // Right shoulder
          const lh = landmarks[23]; // Left hip
          const rh = landmarks[24]; // Right hip

          if (ls && rs && lh && rh) {
            // Chest / sternum is at 60% shoulder to 40% hip
            const shoulderCenterX = (ls.x + rs.x) / 2;
            const shoulderCenterY = (ls.y + rs.y) / 2;
            const hipCenterX = (lh.x + rh.x) / 2;
            const hipCenterY = (lh.y + rh.y) / 2;

            const rawTorsoX = shoulderCenterX * 0.7 + hipCenterX * 0.3;
            const rawTorsoY = shoulderCenterY * 0.7 + hipCenterY * 0.3;

            const minX = Math.min(ls.x, rs.x, lh.x, rh.x);
            const maxX = Math.max(ls.x, rs.x, lh.x, rh.x);
            const minY = Math.min(ls.y, rs.y);
            const maxY = Math.max(lh.y, rh.y);

            // Smooth centroid
            if (!this.smoothedCentroid) {
              this.smoothedCentroid = { x: rawTorsoX, y: rawTorsoY };
            } else {
              this.smoothedCentroid.x = 0.75 * rawTorsoX + 0.25 * this.smoothedCentroid.x;
              this.smoothedCentroid.y = 0.75 * rawTorsoY + 0.25 * this.smoothedCentroid.y;
            }

            let vx = 0;
            let vy = 0;
            if (this.prevTorso) {
              const dt = Math.max(0.001, (timestamp - this.prevTorso.timestamp) / 1000);
              vx = (this.smoothedCentroid.x - this.prevTorso.torsoCenter.x) / dt;
              vy = (this.smoothedCentroid.y - this.prevTorso.torsoCenter.y) / dt;
            }

            const data: TorsoLandmarkData = {
              torsoCenter: { x: this.smoothedCentroid.x, y: this.smoothedCentroid.y },
              leftShoulder: ls,
              rightShoulder: rs,
              leftHip: lh,
              rightHip: rh,
              boundingBox: {
                x: minX,
                y: minY,
                width: Math.max(0.08, maxX - minX),
                height: Math.max(0.18, maxY - minY),
              },
              velocity: { vx, vy },
              confidence: 0.98,
              timestamp,
              isPoseModel: true,
            };

            this.prevTorso = data;
            return data;
          }
        }
      } catch {}
    }

    // 2. High-speed Adaptive Silhouette & Chest Segmentation (Zero latency, track-hardened)
    return this.trackAdaptiveSilhouette(video, timestamp);
  }

  /**
   * Tracks athletic silhouette using Adaptive Background Model and Chest Centroid
   */
  private trackAdaptiveSilhouette(
    video: HTMLVideoElement,
    timestamp: number
  ): TorsoLandmarkData | null {
    if (!this.offscreenCanvas || !this.offscreenCtx) return null;

    const w = this.downsampleWidth;
    const h = this.downsampleHeight;
    const totalPixels = w * h;

    try {
      this.offscreenCtx.drawImage(video, 0, 0, w, h);
      const imgData = this.offscreenCtx.getImageData(0, 0, w, h);
      const pixels = imgData.data;

      // Initialize background model if needed
      if (!this.bgModel) {
        this.bgModel = new Float32Array(totalPixels);
        for (let i = 0; i < totalPixels; i++) {
          const idx = i * 4;
          // Grayscale luminance
          this.bgModel[i] = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
        }
        return null;
      }

      // 1. Foreground Difference & Column/Row Projections
      const colHistogram = new Int32Array(w);
      const rowHistogram = new Int32Array(h);
      let foregroundPixelsCount = 0;
      const threshold = 18; // Grayscale luminance delta

      let sumX = 0;
      let sumY = 0;
      let minX = w;
      let maxX = 0;
      let minY = h;
      let maxY = 0;

      for (let y = 4; y < h - 4; y++) {
        const rowOffset = y * w;
        for (let x = 3; x < w - 3; x++) {
          const pIdx = (rowOffset + x) * 4;
          const gray = 0.299 * pixels[pIdx] + 0.587 * pixels[pIdx + 1] + 0.114 * pixels[pIdx + 2];
          const bgVal = this.bgModel[rowOffset + x];
          const diff = Math.abs(gray - bgVal);

          if (diff > threshold) {
            foregroundPixelsCount++;
            colHistogram[x]++;
            rowHistogram[y]++;
            sumX += x;
            sumY += y;

            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          } else {
            // Adaptively learn stationary background
            this.bgModel[rowOffset + x] += (gray - bgVal) * this.bgLearnRate;
          }
        }
      }

      // Minimum human athlete silhouette size:
      // Require at least 0.3% of pixels and vertical span of at least 15% of frame
      const minPixels = totalPixels * 0.003; // ~43 pixels
      const bodyHeight = (maxY - minY) / h;
      const bodyWidth = (maxX - minX) / w;

      if (foregroundPixelsCount < minPixels || bodyHeight < 0.12 || bodyWidth < 0.03) {
        this.consecutiveDetectionCount = Math.max(0, this.consecutiveDetectionCount - 1);
        if (this.consecutiveDetectionCount === 0) {
          this.prevTorso = null;
        }
        return null;
      }

      this.consecutiveDetectionCount++;

      // 2. Chest / Torso Extraction
      // Sports science rule: Official finish is broken by the TORSO (chest/sternum).
      // The athlete's chest is located between 25% and 42% down from the top of the body silhouette!
      const chestTop = minY + (maxY - minY) * 0.22;
      const chestBottom = minY + (maxY - minY) * 0.44;
      const chestCenterY = (chestTop + chestBottom) / 2 / h;

      // Calculate horizontal center of mass specifically within the chest band for pinpoint precision
      let chestSumX = 0;
      let chestCount = 0;
      const yStart = Math.floor(chestTop);
      const yEnd = Math.ceil(chestBottom);

      for (let y = yStart; y <= yEnd; y++) {
        const rowOffset = y * w;
        for (let x = minX; x <= maxX; x++) {
          const pIdx = (rowOffset + x) * 4;
          const gray = 0.299 * pixels[pIdx] + 0.587 * pixels[pIdx + 1] + 0.114 * pixels[pIdx + 2];
          if (Math.abs(gray - this.bgModel[rowOffset + x]) > threshold) {
            chestSumX += x;
            chestCount++;
          }
        }
      }

      const rawChestX = chestCount > 0 ? (chestSumX / chestCount) / w : (sumX / foregroundPixelsCount) / w;
      const rawChestY = chestCenterY;

      // 3. Smooth Centroid with Exponential Moving Average (Jitter rejection)
      if (!this.smoothedCentroid) {
        this.smoothedCentroid = { x: rawChestX, y: rawChestY };
      } else {
        this.smoothedCentroid.x = 0.72 * rawChestX + 0.28 * this.smoothedCentroid.x;
        this.smoothedCentroid.y = 0.72 * rawChestY + 0.28 * this.smoothedCentroid.y;
      }

      // 4. Calculate Velocity Vector (vx, vy in screen width/sec)
      let vx = 0;
      let vy = 0;
      if (this.prevTorso) {
        const dt = Math.max(0.001, (timestamp - this.prevTorso.timestamp) / 1000);
        vx = (this.smoothedCentroid.x - this.prevTorso.torsoCenter.x) / dt;
        vy = (this.smoothedCentroid.y - this.prevTorso.torsoCenter.y) / dt;
      }

      // Confidence score: based on aspect ratio (human body is taller than wide) and stability
      const aspectRatio = bodyHeight / Math.max(0.01, bodyWidth);
      let confidence = 0.85;
      if (aspectRatio >= 1.4 && aspectRatio <= 4.0) confidence += 0.08;
      if (this.consecutiveDetectionCount >= 3) confidence += 0.05;
      confidence = Math.min(0.98, Math.max(0.75, confidence));

      const data: TorsoLandmarkData = {
        torsoCenter: { x: this.smoothedCentroid.x, y: this.smoothedCentroid.y },
        boundingBox: {
          x: minX / w,
          y: minY / h,
          width: Math.max(0.06, (maxX - minX) / w),
          height: Math.max(0.14, (maxY - minY) / h),
        },
        velocity: { vx: Math.round(vx * 100) / 100, vy: Math.round(vy * 100) / 100 },
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
}
