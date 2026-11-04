// Camera Manager for High-Framerate Video Capture and Frame Callback

import { CameraSettings, HardwareMetrics } from "@/types";

export type FrameCallback = (
  video: HTMLVideoElement,
  frameTime: number,
  metadata?: VideoFrameCallbackMetadata
) => void;

export class CameraManager {
  private videoElement: HTMLVideoElement | null = null;
  private mediaStream: MediaStream | null = null;
  private isMonitoring: boolean = false;
  private frameCallbackId: number | null = null;
  private onFrame: FrameCallback | null = null;

  // Performance metrics tracking
  private frameCount: number = 0;
  private processCount: number = 0;
  private lastFpsUpdateTime: number = 0;
  private currentCameraFps: number = 0;
  private currentProcessingFps: number = 0;
  private droppedFrames: number = 0;
  private lastFrameTimestamp: number = 0;
  private expectedFrameIntervalMs: number = 16.67; // default 60fps

  private availableDevices: MediaDeviceInfo[] = [];
  private selectedDeviceId: string = "";

  public async getAvailableCameras(): Promise<MediaDeviceInfo[]> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      return [];
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.availableDevices = devices.filter((d) => d.kind === "videoinput");
      return this.availableDevices;
    } catch {
      return [];
    }
  }

  public async startCamera(
    videoElement: HTMLVideoElement,
    preferredFacing: "environment" | "user" = "environment",
    deviceId?: string
  ): Promise<MediaStream> {
    this.videoElement = videoElement;
    this.stopCamera();

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        facingMode: deviceId ? undefined : { ideal: preferredFacing },
        width: { ideal: 1920, min: 640 },
        height: { ideal: 1080, min: 480 },
        frameRate: { ideal: 60, min: 30 },
      },
    };

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoElement.srcObject = this.mediaStream;
      this.videoElement.playsInline = true;
      this.videoElement.muted = true;

      await new Promise<void>((resolve) => {
        if (!this.videoElement) return resolve();
        this.videoElement.onloadedmetadata = () => {
          this.videoElement?.play().then(() => resolve()).catch(() => resolve());
        };
      });

      // Update available devices list after permission granted
      await this.getAvailableCameras();

      // Retrieve actual track settings
      const videoTrack = this.mediaStream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        if (settings.frameRate) {
          this.expectedFrameIntervalMs = 1000 / settings.frameRate;
        }
      }

      return this.mediaStream;
    } catch (err: any) {
      // Fallback to basic video constraint if ideal fails
      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        this.videoElement.srcObject = this.mediaStream;
        await this.videoElement.play();
        return this.mediaStream;
      } catch (fallbackErr) {
        throw new Error(`Camera access denied or unavailable: ${err?.message || err}`);
      }
    }
  }

  public startFrameLoop(callback: FrameCallback) {
    this.onFrame = callback;
    this.isMonitoring = true;
    this.lastFpsUpdateTime = performance.now();
    this.frameCount = 0;
    this.processCount = 0;
    this.droppedFrames = 0;

    const useRvfc =
      this.videoElement &&
      "requestVideoFrameCallback" in this.videoElement &&
      typeof (this.videoElement as any).requestVideoFrameCallback === "function";

    const loop = (now: number, metadata?: any) => {
      if (!this.isMonitoring || !this.videoElement) return;

      const frameTime = metadata?.expectedDisplayTime || now;

      // Track frame stats
      this.frameCount++;
      const deltaSinceLastFrame = frameTime - this.lastFrameTimestamp;
      if (
        this.lastFrameTimestamp > 0 &&
        deltaSinceLastFrame > this.expectedFrameIntervalMs * 1.8
      ) {
        // Probable dropped frame
        this.droppedFrames += Math.round(deltaSinceLastFrame / this.expectedFrameIntervalMs) - 1;
      }
      this.lastFrameTimestamp = frameTime;

      // Execute vision frame processing
      const startProc = performance.now();
      try {
        if (this.onFrame && this.videoElement.readyState >= 2) {
          this.onFrame(this.videoElement, frameTime, metadata);
          this.processCount++;
        }
      } catch (e) {
        console.error("Frame processing error:", e);
      }

      // Update FPS metrics every 1 second
      if (now - this.lastFpsUpdateTime >= 1000) {
        const elapsedSec = (now - this.lastFpsUpdateTime) / 1000;
        this.currentCameraFps = Math.round(this.frameCount / elapsedSec);
        this.currentProcessingFps = Math.round(this.processCount / elapsedSec);
        this.frameCount = 0;
        this.processCount = 0;
        this.lastFpsUpdateTime = now;
      }

      // Request next frame
      if (useRvfc) {
        this.frameCallbackId = (this.videoElement as any).requestVideoFrameCallback(loop);
      } else {
        this.frameCallbackId = requestAnimationFrame(loop);
      }
    };

    if (useRvfc) {
      this.frameCallbackId = (this.videoElement as any).requestVideoFrameCallback(loop);
    } else {
      this.frameCallbackId = requestAnimationFrame(loop);
    }
  }

  public stopFrameLoop() {
    this.isMonitoring = false;
    if (this.frameCallbackId !== null) {
      if (
        this.videoElement &&
        "cancelVideoFrameCallback" in this.videoElement &&
        typeof (this.videoElement as any).cancelVideoFrameCallback === "function"
      ) {
        (this.videoElement as any).cancelVideoFrameCallback(this.frameCallbackId);
      } else {
        cancelAnimationFrame(this.frameCallbackId);
      }
      this.frameCallbackId = null;
    }
  }

  public stopCamera() {
    this.stopFrameLoop();
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }

  public getMetrics(): HardwareMetrics {
    const width = this.videoElement?.videoWidth || 1280;
    const height = this.videoElement?.videoHeight || 720;
    return {
      cameraFps: this.currentCameraFps || 60,
      processingFps: this.currentProcessingFps || 60,
      droppedFrames: this.droppedFrames,
      frameLatencyMs: Math.round((1000 / Math.max(1, this.currentProcessingFps)) * 10) / 10,
      resolution: { width, height },
    };
  }

  /**
   * Captures an instant high-resolution snapshot from the video stream
   */
  public captureSnapshot(): string | null {
    if (!this.videoElement || this.videoElement.videoWidth === 0) return null;

    try {
      const canvas = document.createElement("canvas");
      canvas.width = this.videoElement.videoWidth;
      canvas.height = this.videoElement.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.85);
    } catch {
      return null;
    }
  }
}

