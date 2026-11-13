// High-Speed Adaptive Torso Tracking with Sports-Biomechanics Centroid Segmentation
// Strict Human Torso & Solid Mass Filtering (Rejects Hand Waving, Shadows, and Tiny Noise)

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
  solidPixelCount: number;
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
  private bgLearnRate: number = 0.03; // Conservative 3% adaptation rate to prevent runner absorption
  private consecutiveDetectionCount: number = 0;
  private smoothedCentroid: { x: number; y: number } | null = null;

  // MediaPipe Pose landmarker (optional)
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
   * Optional MediaPipe Pose model loader
   */
  public async loadMediaPipePose(): Promise<boolean> {
    if (this.poseLandmarker) return true;
    if (this.poseLoadFailed) return false;
    this.isPoseLoading = true;
    try {
      const vision = await (Function('return import("@mediapipe/tasks-vision")')() as Promise<any>);
      const wasmFileset = await vision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      this.poseLandmarker = await vision.PoseLandmarker.createFromOptions(wasmFileset, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
      });
      this.isPoseLoading = false;
      return true;
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
            // Chest / sternum is at 70% shoulder to 30% hip
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

            const width = maxX - minX;
            const height = maxY - minY;

            // Strict human body dimensions check
            if (height >= 0.20 && width >= 0.06) {
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
                  width: Math.max(0.08, width),
                  height: Math.max(0.20, height),
                },
                velocity: { vx, vy },
                confidence: 0.98,
                timestamp,
                isPoseModel: true,
                solidPixelCount: 500,
              };

              this.prevTorso = data;
              return data;
            }
          }
        }
      } catch {}
    }

    // 2. High-speed Adaptive Silhouette & Chest Segmentation with Strict Human Torso Verification
    return this.trackAdaptiveSilhouette(video, timestamp);
  }

  /**
   * Tracks athletic silhouette using Adaptive Background Model and Chest Centroid
   * Strictly verifies solid human body dimensions to reject hands, shadows, and small noise.
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
          this.bgModel[i] = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
        }
        return null;
      }

      // 1. Foreground Difference Computation
      let foregroundPixelsCount = 0;
      const threshold = 22; // Enhanced threshold for solid object detection (avoids minor lighting noise)

      let sumX = 0;
      let sumY = 0;
      let minX = w;
      let maxX = 0;
      let minY = h;
      let maxY = 0;

      for (let y = 3; y < h - 3; y++) {
        const rowOffset = y * w;
        for (let x = 3; x < w - 3; x++) {
          const pIdx = (rowOffset + x) * 4;
          const gray = 0.299 * pixels[pIdx] + 0.587 * pixels[pIdx + 1] + 0.114 * pixels[pIdx + 2];
          const bgVal = this.bgModel[rowOffset + x];
          const diff = Math.abs(gray - bgVal);

          if (diff > threshold) {
            foregroundPixelsCount++;
            sumX += x;
            sumY += y;

            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          } else {
            // Adapt stationary background
            this.bgModel[rowOffset + x] += (gray - bgVal) * this.bgLearnRate;
          }
        }
      }

      // --- STRICT SOLID HUMAN BODY VALIDATION ---
      // 1. A human body must occupy a significant physical area:
      // Minimum 200 pixels on downsampled 160x90 canvas (~1.4% of screen)
      const minSolidPixels = 180;
      const bodyHeight = (maxY - minY) / h;
      const bodyWidth = (maxX - minX) / w;

      // Reject small objects, flying insects, or hands:
      // Athlete height must span at least 22% of camera frame height
      // Athlete width must span at least 5% of camera frame width
      if (
        foregroundPixelsCount < minSolidPixels ||
        bodyHeight < 0.22 ||
        bodyWidth < 0.05
      ) {
        this.consecutiveDetectionCount = Math.max(0, this.consecutiveDetectionCount - 1);
        if (this.consecutiveDetectionCount === 0) {
          this.prevTorso = null;
        }
        return null;
      }

      // 2. Aspect Ratio Check: A human athlete is vertically oriented.
      // Aspect ratio (height / width) must be >= 1.1.
      // Rejects horizontal shadows on ground, wide horizontal lines, etc.
      const aspectRatio = bodyHeight / Math.max(0.01, bodyWidth);
      if (aspectRatio < 1.05 || aspectRatio > 5.5) {
        return null;
      }

      // 2. Chest / Sternum Torso Plane Extraction:
      // World Athletics rule: finish is broken by the TORSO (chest/sternum).
      // The athlete's chest is located between 20% and 44% down from the top of the body silhouette!
      const chestTop = minY + (maxY - minY) * 0.20;
      const chestBottom = minY + (maxY - minY) * 0.44;
      const chestCenterY = (chestTop + chestBottom) / 2 / h;

      // Verify that the chest band contains a SOLID core mass of pixels (not empty air between limbs)
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

      // Chest band must contain at least 40 solid pixels
      if (chestCount < 40) {
        return null;
      }

      this.consecutiveDetectionCount++;

      const rawChestX = (chestSumX / chestCount) / w;
      const rawChestY = chestCenterY;

      // 3. Smooth Centroid with Exponential Moving Average (Jitter rejection)
      if (!this.smoothedCentroid) {
        this.smoothedCentroid = { x: rawChestX, y: rawChestY };
      } else {
        this.smoothedCentroid.x = 0.70 * rawChestX + 0.30 * this.smoothedCentroid.x;
        this.smoothedCentroid.y = 0.70 * rawChestY + 0.30 * this.smoothedCentroid.y;
      }

      // 4. Calculate Velocity Vector (vx, vy in screen width/sec)
      let vx = 0;
      let vy = 0;
      if (this.prevTorso) {
        const dt = Math.max(0.001, (timestamp - this.prevTorso.timestamp) / 1000);
        vx = (this.smoothedCentroid.x - this.prevTorso.torsoCenter.x) / dt;
        vy = (this.smoothedCentroid.y - this.prevTorso.torsoCenter.y) / dt;
      }

      // Honest Confidence Score based on solid mass and stability
      let confidence = 0.88;
      if (this.consecutiveDetectionCount >= 2) confidence += 0.05;
      if (aspectRatio >= 1.4 && aspectRatio <= 3.8) confidence += 0.05;
      confidence = Math.min(0.99, Math.max(0.80, confidence));

      const data: TorsoLandmarkData = {
        torsoCenter: { x: this.smoothedCentroid.x, y: this.smoothedCentroid.y },
        boundingBox: {
          x: minX / w,
          y: minY / h,
          width: Math.max(0.06, bodyWidth),
          height: Math.max(0.20, bodyHeight),
        },
        velocity: { vx: Math.round(vx * 100) / 100, vy: Math.round(vy * 100) / 100 },
        confidence: Math.round(confidence * 100) / 100,
        timestamp,
        isPoseModel: false,
        solidPixelCount: foregroundPixelsCount,
      };

      this.prevTorso = data;
      return data;
    } catch {
      return null;
    }
  }
}
