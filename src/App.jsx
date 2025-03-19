import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

// Get the backend URL from environment variable or use localhost as fallback
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const IS_DEVELOPMENT = import.meta.env.DEV;

console.log("Environment:", IS_DEVELOPMENT ? "Development" : "Production");
console.log("Environment variable VITE_BACKEND_URL:", import.meta.env.VITE_BACKEND_URL);
console.log("Using backend URL:", BACKEND_URL);

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const [status, setStatus] = useState("Click start to begin inferences");
  const [isDistracted, setIsDistracted] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [focusedTime, setFocusedTime] = useState(0); // in seconds
  const [distractedTime, setDistractedTime] = useState(0); // in seconds
  const [startTime, setStartTime] = useState(null); // Track the start time of the current session

  // Format time to show seconds and milliseconds
  const formatTime = (timeInSeconds) => {
    const seconds = Math.floor(timeInSeconds);
    const milliseconds = Math.floor((timeInSeconds - seconds) * 1000);
    return `${seconds}.${milliseconds.toString().padStart(3, '0')}`;
  };

  useEffect(() => {
    if (!BACKEND_URL) {
      console.error("No backend URL configured!");
      setStatus("Error: No backend URL configured");
      return;
    }

    // Initialize Socket.IO connection with the backend URL
    console.log("Connecting to backend at:", BACKEND_URL);
    socketRef.current = io(BACKEND_URL, {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      path: '/socket.io/',
      secure: true,
      rejectUnauthorized: false,
      forceNew: true,
      timeout: 20000,
      withCredentials: true,
      autoConnect: true,
      upgrade: true,
      rememberUpgrade: true,
      extraHeaders: {
        "Access-Control-Allow-Origin": "https://www.focuspoint.it.com",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Credentials": "true"
      }
    });

    // Socket event handlers
    socketRef.current.on("connect", () => {
      console.log("Connected to WebSocket server");
      setStatus("Connected to server");
    });

    socketRef.current.on("connect_error", (error) => {
      console.error("Connection error details:", {
        message: error.message,
        description: error.description,
        type: error.type,
        context: error.context
      });
      setStatus(`Connection error: ${error.message}`);
    });

    socketRef.current.on("disconnect", () => {
      console.log("Disconnected from WebSocket server");
      setStatus("Disconnected from server");
    });

    socketRef.current.on("status", (data) => {
      const { status } = data;
      setStatus(status);
      
      if (status === "Distracted") {
        setIsDistracted(true);
      } else {
        setIsDistracted(false);
      }
    });

    socketRef.current.on("error", (data) => {
      console.error("Error from server:", data.error);
      setStatus("Error processing frame");
    });

    // Access the webcam
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

    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    if (!isTracking || !socketRef.current) {
      return;
    }

    const interval = setInterval(() => {
      if (videoRef.current && canvasRef.current) {
        // Draw the video frame onto the canvas
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert the canvas content to base64
        const frame = canvas.toDataURL("image/jpeg").split(",")[1];

        // Send the frame through WebSocket
        socketRef.current.emit("frame", { frame });
      }
    }, 700);

    return () => clearInterval(interval);
  }, [isTracking]);

  // Add new effect for continuous timer updates
  useEffect(() => {
    if (!isTracking || !startTime) return;

    const timerInterval = setInterval(() => {
      const currentTime = Date.now();
      const elapsedTime = (currentTime - startTime) / 1000;

      if (isDistracted) {
        setDistractedTime(prev => prev + elapsedTime);
      } else {
        setFocusedTime(prev => prev + elapsedTime);
      }
      setStartTime(currentTime);
    }, 10); // Update every 10ms for smoother millisecond display

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

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <h1 className="text-4xl font-bold underline mb-6 text-gray-800">
        Distraction Detection
      </h1>
      <video
        ref={videoRef}
        autoPlay
        muted
        className="border-4 border-black rounded-lg shadow-lg max-w-2xl mb-6"
      ></video>
      <canvas ref={canvasRef} className="hidden"></canvas>
      <div
        className={`mt-4 text-2xl font-semibold py-2 px-6 rounded-md ${isDistracted
          ? "bg-red-100 text-red-700 border-red-500"
          : "bg-green-100 text-green-700 border-green-500"
          } border shadow-md`}
      >
        {status}
      </div>
      <div className="flex space-x-4 mt-6">
        <button
          onClick={handleStart}
          className={`px-6 py-2 text-lg font-medium text-white rounded-md transition ${isTracking
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-green-600 hover:bg-green-700"
            }`}
          disabled={isTracking}
        >
          Start
        </button>
        <button
          onClick={handleStop}
          className={`px-6 py-2 text-lg font-medium text-white rounded-md transition ${!isTracking
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
  );
}

export default App;
