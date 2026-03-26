import { useEffect, useRef, useState } from "react";


const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const lerp = (a, b, t) => a + (b - a) * t;

function countOpenFingers(landmarks) {
  if (!landmarks || landmarks.length !== 21) return 0;

  let count = 0;

  const thumbTip = landmarks[4];
  const thumbIp = landmarks[3];
  const wrist = landmarks[0];

  if (Math.abs(thumbTip.x - wrist.x) > Math.abs(thumbIp.x - wrist.x) + 0.02) {
    count += 1;
  }

const fingerTips = [8, 12, 16, 20];
const fingerPips = [6, 10, 14, 18];
const fingerMcps = [5, 9, 13, 17];

for (let i = 0; i < fingerTips.length; i += 1) {
  const tip = landmarks[fingerTips[i]];
  const pip = landmarks[fingerPips[i]];
  const mcp = landmarks[fingerMcps[i]];

  const fullyExtended =
    tip.y < pip.y - 0.04 && pip.y < mcp.y - 0.02;

  if (fullyExtended) count += 1;
}

  return count;
}

export default function App() {
  const flowerVideoRef = useRef(null);
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraRef = useRef(null);
  const animationFrameRef = useRef(null);

  const targetProgressRef = useRef(0.04);
  const smoothProgressRef = useRef(0.04);

  const [videoReady, setVideoReady] = useState(false);
  const [handDetected, setHandDetected] = useState(false);
  const [openFingerCount, setOpenFingerCount] = useState(0);
  const [mode, setMode] = useState("webcam");
  const [statusText, setStatusText] = useState("Initializing...");

  useEffect(() => {
    const video = flowerVideoRef.current;
    if (!video) return;

    const handleLoaded = () => {
      setVideoReady(true);
      if (video.duration && Number.isFinite(video.duration)) {
        video.currentTime = video.duration * 0.05;
      }
      setStatusText("Flower video ready.");
    };

    video.addEventListener("loadedmetadata", handleLoaded);
    return () => {
      video.removeEventListener("loadedmetadata", handleLoaded);
    };
  }, []);

  useEffect(() => {
    let handsInstance;
    let mounted = true;

    async function setupHandTracking() {
      try {
        if (!webcamRef.current) return;

      handsInstance = new window.Hands({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});

        handsInstance.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.6,
          minTrackingConfidence: 0.6,
        });

        handsInstance.onResults((results) => {
          if (!mounted) return;

          const canvas = canvasRef.current;
          const ctx = canvas?.getContext("2d");

          if (canvas && ctx && webcamRef.current) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(webcamRef.current, 0, 0, canvas.width, canvas.height);
          }

          if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
           const count = countOpenFingers(landmarks);

setHandDetected(true);
setOpenFingerCount(count);
setStatusText("Hand tracking active.");

let openness = clamp((count - 1) / 4, 0, 1);

if (openness < 0.3) {
  openness = 0;
} else if (openness > 0.88) {
  openness = 1;
} else {
  openness = (openness - 0.3) / (0.88 - 0.3);
}

const eased = openness * openness * (3 - 2 * openness);
const nextTarget = eased;
targetProgressRef.current = nextTarget;

// 작은 흔들림만 무시
if (Math.abs(targetProgressRef.current - nextTarget) > 0.05) {
  targetProgressRef.current = nextTarget;
}

            if (canvas && ctx) {
              ctx.fillStyle = "rgba(255,255,255,0.95)";
              for (const point of landmarks) {
                ctx.beginPath();
                ctx.arc(point.x * canvas.width, point.y * canvas.height, 4, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          } else {
            setHandDetected(false);
            setOpenFingerCount(0);
            setStatusText("No hand detected.");
          }
        });

        const camera = new Camera(webcamRef.current, {
          onFrame: async () => {
            if (webcamRef.current && handsInstance) {
              await handsInstance.send({ image: webcamRef.current });
            }
          },
          width: 320,
          height: 240,
        });

        cameraRef.current = camera;
        await camera.start();
      } catch (error) {
        console.error(error);
        setMode("fallback");
        setStatusText("Webcam unavailable. Fallback mode enabled.");
      }
    }

    setupHandTracking();

    return () => {
      mounted = false;
      if (cameraRef.current) cameraRef.current.stop();
      if (handsInstance && typeof handsInstance.close === "function") {
        handsInstance.close();
      }
    };
  }, []);

  useEffect(() => {
    const updateVideo = () => {
      const flowerVideo = flowerVideoRef.current;

      smoothProgressRef.current = lerp(
        smoothProgressRef.current,
        targetProgressRef.current,
        0.05
      );

      if (
        flowerVideo &&
        videoReady &&
        flowerVideo.duration &&
        Number.isFinite(flowerVideo.duration)
      ) {
        const safeStart = flowerVideo.duration * 0.1;
        const safeEnd = flowerVideo.duration * 0.9;
        const nextTime =
          safeStart +
          smoothProgressRef.current * (safeEnd - safeStart);

        if (Math.abs(flowerVideo.currentTime - nextTime) > 0.016) {
          flowerVideo.currentTime = nextTime;
        }
      }

      animationFrameRef.current = requestAnimationFrame(updateVideo);
    };

    animationFrameRef.current = requestAnimationFrame(updateVideo);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [videoReady]);

  const handleMouseMove = (e) => {
    if (mode !== "fallback") return;

    const ratio = clamp(e.clientY / window.innerHeight, 0, 1);
    targetProgressRef.current = 0.9 - ratio * 0.8;
  };

  return (
    <div style={styles.app} onMouseMove={handleMouseMove}>
      <video
        ref={flowerVideoRef}
        src="/flower_bloom.mp4"
        muted
        playsInline
        preload="auto"
        style={styles.flower}
      />

      <div style={styles.debugPanel}>
        <div style={styles.debugTitle}>Bloom Debug</div>
        <div>mode: {mode}</div>
        <div>hand detected: {handDetected ? "yes" : "no"}</div>
        <div>open fingers: {openFingerCount}</div>
        <div>progress: {smoothProgressRef.current.toFixed(2)}</div>
        <div style={styles.debugNote}>{statusText}</div>
      </div>

      <div style={styles.webcamPanel}>
        <video
          ref={webcamRef}
          autoPlay
          muted
          playsInline
          style={styles.webcamVideo}
        />
        <canvas ref={canvasRef} width={320} height={240} style={styles.canvas} />
      </div>

      <div style={styles.instruction}>
        {mode === "fallback"
          ? "Move the mouse upward to bloom the flower."
          : "Open your hand to bloom the flower. Close your hand to let it fall back."}
      </div>
    </div>
  );
}

const styles = {
  app: {
    position: "relative",
    width: "100vw",
    height: "100vh",
    background: "#000",
    overflow: "hidden",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: "#fff",
  },
  flower: {
    width: "min(78vw, 1200px)",
    maxHeight: "82vh",
    objectFit: "contain",
    pointerEvents: "none",
    filter: "drop-shadow(0 0 24px rgba(255,255,255,0.08))",
  },
  debugPanel: {
    position: "absolute",
    top: 24,
    left: 24,
    width: 240,
    padding: "14px 16px",
    borderRadius: 16,
    background: "rgba(15,15,15,0.72)",
    border: "1px solid rgba(255,255,255,0.08)",
    fontSize: 14,
    lineHeight: 1.6,
    zIndex: 2,
  },
  debugTitle: {
    fontWeight: 700,
    marginBottom: 8,
  },
  debugNote: {
    marginTop: 8,
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
  },
  webcamPanel: {
    position: "absolute",
    right: 24,
    top: 24,
    width: 320,
    height: 240,
    overflow: "hidden",
    borderRadius: 16,
    background: "rgba(15,15,15,0.72)",
    border: "1px solid rgba(255,255,255,0.08)",
    zIndex: 2,
  },
  webcamVideo: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transform: "scaleX(-1)",
    opacity: 0.35,
  },
  canvas: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    transform: "scaleX(-1)",
  },
  instruction: {
    position: "absolute",
    bottom: 28,
    left: "50%",
    transform: "translateX(-50%)",
    padding: "12px 18px",
    borderRadius: 999,
    background: "rgba(15,15,15,0.72)",
    border: "1px solid rgba(255,255,255,0.08)",
    fontSize: 14,
    zIndex: 2,
    whiteSpace: "nowrap",
  },
};