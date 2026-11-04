# PACEFRAME

> **Every Split. Every Sprint. Precisely Captured.**

PACEFRAME is a camera-based, distance-independent, multi-device automatic electronic sprint timing and athletic performance measurement system. Designed for track & field coaches, sports academies, and performance researchers, PACEFRAME delivers an affordable alternative to traditional multi-thousand-dollar electronic timing hardware (such as Freelap, Brower, and FinishLynx) using continuous computer vision and synchronized mobile devices.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FAghoshroop%2Fpaceframe)

---

## Key Capabilities

* **Distance & Device Independent**: Configure arbitrary distances (flying 10m, 20m, 30m, 60m, 100m, custom hurdles/accels) or pure camera-defined timing gates without fixed distance requirements.
* **Continuous Computer Vision**: Uses real-time torso tracking via MediaPipe Pose (33 3D skeletal landmarks) and high-speed motion centroid algorithms running at 60+ FPS via `requestVideoFrameCallback`.
* **Sub-Frame Photo-Finish Evidence**: Captures annotated freeze-frame evidence at the exact crossing instant with overlaid timing gate line, torso tracking reticle, timestamp, and confidence.
* **Two Starting Methods**:
  * **Method A (Hold & Release)**: Touch/pointer hold button. PointerDown arms the system; PointerUp fires a synthetic starter gun impulse with acoustic powder crack and starts the synchronized clock.
  * **Method B (Camera Automatic)**: Continuous optical monitoring at the start gate; clock starts automatically when the athlete crosses (ideal for flying sprints).
* **Multi-Device Mesh Network**: Connect 2 to 6+ smartphones/tablets via dynamic QR pairing or 6-character room codes. Dynamic role reassignment on the fly:
  * Start Camera
  * Finish Camera
  * Intermediate Split Camera(s)
  * Lap Camera
  * Coach Console / Authority
* **NTP-Style Clock Synchronization**: Continuous round-trip ping-pong exchanges calculating clock offset ($\Delta t$), RTT latency, and jitter.
* **Honest Measurement Quality**: Calculates empirical timing uncertainty ($\pm X$ ms) based on camera frame intervals and clock jitter rather than fabricating unverified milliseconds.
* **Mobile-First Trackside Optimization**:
  * Ultra-responsive layout optimized for compact screens (iPhone SE, Android).
  * Ergonomic bottom thumb navigation bar for one-handed operation trackside.
  * Screen Awake (`WakeLock API`) preventing device sleep during live timing sessions.
  * Haptic vibration feedback on start, split, and finish.
  * Complete offline PWA support.
* **Session Logs & CSV Export**: Searchable historical sprint logs with complete split breakdowns, average velocity (km/h and m/s), and 1-click CSV download.

---

## Quick Start (Local Development)

```bash
# Clone the repository
git clone https://github.com/Aghoshroop/paceframe.git
cd paceframe

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Deploy to Vercel (1-Click)

1. Open **[vercel.com/new](https://vercel.com/new)**.
2. Select your imported **`Aghoshroop/paceframe`** repository.
3. Keep default settings (Framework: Next.js).
4. Click **Deploy**.

Your application will be live at `https://paceframe.vercel.app` with automatic HTTPS, global CDN, and real-time signaling APIs (`/api/signaling`).

---

## License

MIT © [Aghoshroop](https://github.com/Aghoshroop)
