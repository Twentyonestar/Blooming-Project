import { useEffect, useRef, useState } from "react";
import "./App.css";

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
      video.pause();
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

  const handleMove = (clientY) => {
    if (mode !== "fallback") return;

    const ratio = clamp(clientY / window.innerHeight, 0, 1);
    targetProgressRef.current = 0.9 - ratio * 0.8;
  };

  const handleMouseMove = (e) => handleMove(e.clientY);

  const handleTouch = (e) => {
    const video = flowerVideoRef.current;
    if (video && video.paused && !videoReady) {
      video.play().catch(() => {});
    }
    if (e.touches && e.touches.length > 0) {
      handleMove(e.touches[0].clientY);
    }
  };

  return (
    <div 
      className="app-container" 
      onMouseMove={handleMouseMove}
      onTouchMove={handleTouch}
      onTouchStart={handleTouch}
    >
      <video
        ref={flowerVideoRef}
        src="/flower_bloom.mp4"
        muted
        playsInline
        autoPlay
        preload="auto"
        className="flower-video"
      />

      <div className="debug-panel">
        <div className="debug-title">Bloom Debug</div>
        <div>mode: {mode}</div>
        <div>hand detected: {handDetected ? "yes" : "no"}</div>
        <div>open fingers: {openFingerCount}</div>
        <div>progress: {smoothProgressRef.current.toFixed(2)}</div>
        <div className="debug-note">{statusText}</div>
      </div>

      <div className="webcam-panel">
        <video
          ref={webcamRef}
          autoPlay
          muted
          playsInline
          className="webcam-video"
        />
        <canvas ref={canvasRef} width={320} height={240} className="canvas-overlay" />
      </div>

      <div className="instruction-text">
        {mode === "fallback"
          ? "Move the mouse upward to bloom the flower."
          : "Open your hand to bloom the flower. Close your hand to let it fall back."}
      </div>
    </div>
  );
}