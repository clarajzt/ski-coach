// video.js — on-device pose estimation for a video clip (MediaPipe Pose Landmarker, WASM).
// The runtime and model are vendored in /vendor so the site makes no third-party requests.

let landmarker = null;
let loading = null;
let tsBase = 0; // the landmarker needs strictly increasing timestamps across clips

export function loadPose() {
  if (landmarker) return Promise.resolve(landmarker);
  if (loading) return loading;
  loading = (async () => {
    const base = new URL('../vendor/mediapipe/', import.meta.url).href;
    const vision = await import('../vendor/mediapipe/vision_bundle.js');
    const fileset = await vision.FilesetResolver.forVisionTasks(base + 'wasm');
    const make = (delegate) => vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: base + 'pose_landmarker_full.task', delegate },
      runningMode: 'VIDEO', numPoses: 1,
      minPoseDetectionConfidence: 0.4, minPosePresenceConfidence: 0.4, minTrackingConfidence: 0.4,
    });
    try { landmarker = await make('GPU'); } catch { landmarker = await make('CPU'); }
    return landmarker;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

function seek(video, t) {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - t) < 1e-3 && video.readyState >= 2) return resolve();
    let done = false;
    const finish = () => { if (done) return; done = true; video.removeEventListener('seeked', finish); clearTimeout(timer); resolve(); };
    const timer = setTimeout(finish, 2500);
    video.addEventListener('seeked', finish);
    video.currentTime = t;
  });
}

/** Sampling rate that keeps the frame count reasonable for longer clips. */
export const sampleRate = (seconds) => (seconds <= 20 ? 15 : seconds <= 45 ? 10 : 8);

/**
 * Step through the clip and estimate the pose at each sample.
 * @returns frames in the engine's format; frames without a detected person have lm = null.
 */
export async function analyzeVideo(video, { maxSeconds = 60, onFrame, signal } = {}) {
  const lmk = await loadPose();
  const dur = Math.min(video.duration, maxSeconds);
  const fps = sampleRate(dur), n = Math.max(1, Math.floor(dur * fps));
  const frames = [];
  video.pause();
  for (let i = 0; i < n; i++) {
    if (signal?.aborted) throw new DOMException('Analysis cancelled', 'AbortError');
    const t = i / fps;
    await seek(video, t);
    let res = null;
    try { res = lmk.detectForVideo(video, tsBase + Math.round(t * 1000)); } catch { /* skip this frame */ }
    const frame = { t, lm: res?.landmarks?.[0] ?? null, world: res?.worldLandmarks?.[0] ?? null };
    frames.push(frame);
    onFrame?.(frame, (i + 1) / n);
    await new Promise((r) => setTimeout(r, 0));
  }
  tsBase += Math.round(dur * 1000) + 1000;
  return frames;
}
