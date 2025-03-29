import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
const IS_DEVELOPMENT = import.meta.env.DEV;

console.log("Environment:", IS_DEVELOPMENT ? "Development" : "Production");
console.log("Using backend URL:", BACKEND_URL);

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const [status, setStatus] = useState("Click start to begin inferences");
  const [isDistracted, setIsDistracted] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [focusedTime, setFocusedTime] = useState(0);
  const [distractedTime, setDistractedTime] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [isServerReady, setIsServerReady] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  // Helper to format elapsed time
  const formatTime = (timeInSeconds) => {
    const seconds = Math.floor(timeInSeconds);
    const milliseconds = Math.floor((timeInSeconds - seconds) * 1000);
    return `${seconds}.${milliseconds.toString().padStart(3, "0")}`;
  };

  useEffect(() => {
    if (!BACKEND_URL) {
      console.error("No backend URL configured!");
      setStatus("Error: No backend URL configured");
      return;
    }

    // Initialize the Socket.IO connection
    socketRef.current = io(BACKEND_URL, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      path: "/socket.io/",
      secure: BACKEND_URL.startsWith("https"),
      rejectUnauthorized: false,
      forceNew: true,
      timeout: 10000,
    });

    socketRef.current.on("connect", () => {
      console.log("Connected to WebSocket server");
      setStatus("Connected to server");
    });

    socketRef.current.on("connect_error", (error) => {
      console.error("Connection error:", error);
      setStatus(`Connection error: ${error.message}`);
    });

    socketRef.current.on("disconnect", () => {
      console.log("Disconnected from WebSocket server");
      setStatus("Disconnected from server");
    });

    socketRef.current.on("focus_status", (data) => {
      const { status } = data;
      setStatus(status);
      setIsDistracted(status === "Distracted");
    });

    socketRef.current.on("error", (data) => {
      console.error("Error from server:", data.error);
      setStatus("Error processing frame");
    });

    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Simulate EC2 launch wait for 3 seconds (the popup will be exactly as production)
  useEffect(() => {
    console.log("Simulating backend launch wait (3 seconds)...");
    const timer = setTimeout(() => {
      setIsServerReady(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Access the webcam once the server is "ready"
  useEffect(() => {
    if (!isServerReady) return;

    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch((err) => {
        console.error("Error accessing webcam:", err);
        setStatus("Error accessing webcam");
      });
  }, [isServerReady]);

  // Send frames at intervals when tracking is enabled
  useEffect(() => {
    if (!isTracking || !socketRef.current || !videoReady) {
      return;
    }

    const interval = setInterval(() => {
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const frame = canvas.toDataURL("image/jpeg").split(",")[1];
        socketRef.current.emit("frame", { frame });
      }
    }, 700);

    return () => clearInterval(interval);
  }, [isTracking, videoReady]);

  // Timer to update focused/distracted time continuously
  useEffect(() => {
    if (!isTracking || !startTime) return;

    const timerInterval = setInterval(() => {
      const currentTime = Date.now();
      const elapsedTime = (currentTime - startTime) / 1000;

      if (isDistracted) {
        setDistractedTime((prev) => prev + elapsedTime);
      } else {
        setFocusedTime((prev) => prev + elapsedTime);
      }
      setStartTime(currentTime);
    }, 10);

    return () => clearInterval(timerInterval);
  }, [isTracking, startTime, isDistracted]);

  const handleStart = () => {
    setFocusedTime(0);
    setDistractedTime(0);
    setStartTime(Date.now());
    setIsTracking(true);
  };

  const handleStop = () => {
    setIsTracking(false);
    setStartTime(null);
    setStatus("Click start to begin inferences");
  };

  // Production loading popup (unchanged)
  const LoadingPopup = () => (
    <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
      <div className="flex space-x-6 items-center p-8 border rounded-lg shadow-xl">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">🚀 Server Loading</h2>
          <button className="bg-blue-500 text-white px-4 py-2 rounded-lg animate-pulse">
            Loading...
          </button>
        </div>
        <div className="text-gray-700 max-w-sm">
          <p>This app detects distractions in real-time using your webcam.</p>
          <p>Please wait a few seconds while we spin up the backend infrastructure.</p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {!isServerReady && <LoadingPopup />}
      {isServerReady && (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
          <h1 className="text-4xl font-bold underline mb-6 text-gray-800">
            Distraction Detection (Local Testing)
          </h1>
          <video
            ref={videoRef}
            autoPlay
            muted
            onCanPlay={() => setVideoReady(true)}
            className="border-4 border-black rounded-lg shadow-lg max-w-2xl mb-6"
          ></video>
          <canvas ref={canvasRef} className="hidden"></canvas>
          <div
            className={`mt-4 text-2xl font-semibold py-2 px-6 rounded-md border shadow-md ${
              isDistracted
                ? "bg-red-100 text-red-700 border-red-500"
                : "bg-green-100 text-green-700 border-green-500"
            }`}
          >
            {status}
          </div>
          <div className="flex space-x-4 mt-6">
            <button
              onClick={handleStart}
              className={`px-6 py-2 text-lg font-medium text-white rounded-md transition ${
                isTracking
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-green-600 hover:bg-green-700"
              }`}
              disabled={isTracking}
            >
              Start
            </button>
            <button
              onClick={handleStop}
              className={`px-6 py-2 text-lg font-medium text-white rounded-md transition ${
                !isTracking
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-red-600 hover:bg-red-700"
              }`}
              disabled={!isTracking}
            >
              Stop
            </button>
          </div>
          <div className="mt-8 text-lg text-gray-700">
            <p className="mb-2">
              <span className="font-semibold">Focused Time:</span>{" "}
              {formatTime(focusedTime)} seconds
            </p>
            <p>
              <span className="font-semibold">Distracted Time:</span>{" "}
              {formatTime(distractedTime)} seconds
            </p>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
