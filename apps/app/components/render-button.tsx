"use client";

import { useEffect, useState } from "react";
import { Button } from "./ui/button";

interface RenderButtonProps {
  clips: Array<{
    id: string;
    url: string;
    duration: number;
    startPosition: number;
  }>;
  ratio: "portrait" | "landscape";
  textOverlay: {
    id: string;
    content: string;
    startPosition: number;
    duration: number;
    animation: any | null;
  } | null;
}


export function RenderButton({ clips, ratio, textOverlay }: RenderButtonProps) {
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
  if (!success) return;

  const timer = setTimeout(() => {
    setSuccess(null);
  }, 5000);

  return () => clearTimeout(timer);
}, [success]);

  const handleRender = async () => {
  try {
    setIsRendering(true);
    setProgress(0);
    setError(null);
    setSuccess(null);

    const response = await fetch("http://localhost:3001/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clips, textOverlay, ratio }),
    });

    const { renderId } = await response.json();

    // listen for progress
    const eventSource = new EventSource(
      `http://localhost:3001/api/render-progress/${renderId}`
    );

    eventSource.onmessage = (e) => {
    const data = JSON.parse(e.data);
    setProgress(data.progress);
    if (data.done && data.progress === 100) {
    eventSource.close();

    setIsDownloading(true);
    setIsRendering(false);
    setProgress(100);

    const link = document.createElement("a");
    link.href = `http://localhost:3001/api/download/${renderId}`;
    link.download = `video-${renderId}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
    setIsDownloading(false);
    setSuccess("Video downloaded successfully!");
  }, 2000);
}


  
  };
  } catch (err) {
    setError("Render failed");
    setIsRendering(false);
  }
};


  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        onClick={handleRender}
        disabled={isRendering || clips.length === 0 || (progress > 0 && progress < 100)}
        className="min-w-30"
      >
        {isRendering ? "Rendering..." : "Render Video"}
      </Button>
      
      {error && (
       <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 max-w-xs text-right">
       {error}
      </div>
       )}

     {success && (
      <div className="rounded-lg bg-green-50 p-3 text-sm text-green-600 max-w-xs text-right">
        {success}
      </div>
      )}
      
    {(isRendering || isDownloading) && (
    <div className="flex flex-col items-end gap-1 text-sm text-gray-600">
     {isRendering && (
      <>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-black" />
          <span>Rendering… {progress}%</span>
        </div>

        <div className="h-1 w-40 overflow-hidden rounded bg-gray-200">
          <div
            className="h-full bg-black transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </>
    )}

    {isDownloading && (
      <div className="text-xs text-gray-500">
        Downloading video…
      </div>
    )}
  </div>
)}

      

    
    </div>
  );
}