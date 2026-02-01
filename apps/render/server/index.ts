import express from "express";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs";
import cores from "cors";
import { randomUUID } from "crypto";

type RenderProgress = {
  progress: number; // [0 ,100]
  done: boolean;
  error?: string;
};

const renderProgress = new Map<string, RenderProgress>();



const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.use(cores(
  {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  }
));

app.use(express.json());

const rendersDir = path.join(__dirname, "..", "renders");
if (!fs.existsSync(rendersDir)) {
  fs.mkdirSync(rendersDir, { recursive: true });
}

console.info(`Renders directory: ${rendersDir}`);

interface RenderRequest {
  clips: Array<{
    id: string;
    url: string;
    duration: number;
  }>;
  textOverlay?: {
    id: string;
    content: string;
    startPosition: number;
    duration: number;
    animation?: string | null;
  } | null;
  ratio: "portrait" | "landscape";
}

app.post("/api/render", async (req, res) => {

  const renderId = randomUUID();
  renderProgress.set(renderId, { progress: 0, done: false });

  res.json({ renderId });

  try {
    const { clips, textOverlay, ratio }: RenderRequest = req.body;

    const totalDuration = clips.reduce((s, c) => s + c.duration, 0);
    const fps = 30;
    const durationInFrames = Math.round(totalDuration * fps);

    const width = ratio === "portrait" ? 1080 : 1920;
    const height = ratio === "portrait" ? 1920 : 1080;

    const bundleLocation = await bundle({
      entryPoint: path.join(__dirname, "..", "remotion", "index.ts"),
    });

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "VideoEditor",
      inputProps: { clips, textOverlay },
    });

    const outputLocation = path.join(
      rendersDir,
      `video-${renderId}.mp4`
    );

    await renderMedia({
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation,
      composition: {
        ...composition,
        durationInFrames,
        width,
        height,
      },
      inputProps: { clips, textOverlay },

      onProgress: ({ progress }) => {
        renderProgress.set(renderId, {
          progress: Math.round(progress * 100),
          done: false,
        });
      },
    });

    renderProgress.set(renderId, { progress: 100, done: true });
  } catch (err) {
    renderProgress.set(renderId, {
      progress: 0,
      done: true,
      error: "Render failed",
    });
  }
});

app.get("/api/render-progress/:id", (req, res) => {
  const { id } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const interval = setInterval(() => {
    const data = renderProgress.get(id);
    if (!data) return;

    res.write(`data: ${JSON.stringify(data)}\n\n`);

    if (data.done) {
      clearInterval(interval);
      res.end();
    }
  }, 500);
});


app.get("/api/download/:id", (req, res) => {
  const { id } = req.params;

  const filePath = path.join(rendersDir, `video-${id}.mp4`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.download(filePath, `video-${id}.mp4`);
});

// health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.info(`Render server running on port ${PORT}`);
  console.info(`Renders will be saved to: ${rendersDir}`);
});