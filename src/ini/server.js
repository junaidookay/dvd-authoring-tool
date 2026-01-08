import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { setIO } from "./socketInstance.js";
import logger from "../core/utils/logger.js";
import author from "../core/author.js";

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  },
});

setIO(io);

io.on("connection", (socket) => {
  logger.log("Client connected: " + socket.id);
  logger.setSocket(socket);
  socket.on("disconnect", () => {
    logger.log("Client disconnected: " + socket.id);
  });
});

const jobs = new Map();
let queue = Promise.resolve();

const ensureDir = async (dirPath) => {
  await fs.promises.mkdir(dirPath, { recursive: true });
};

const createJobId = () => crypto.randomUUID();

const mediaRoot = process.env.MEDIA_ROOT || "/media";
const outputRoot = process.env.OUTPUT_ROOT || "/output";
const scratchRoot = process.env.SCRATCH_ROOT || "/scratch";

const normalizePathInput = (value) =>
  String(value || "")
    .trim()
    .replaceAll("\\", "/")
    .replaceAll("\u0000", "");

const resolveMediaPath = (userPath) => {
  const candidate = normalizePathInput(userPath);
  if (!candidate) return "";

  if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
    throw new Error("URL inputs are not supported; provide a /media/... path");
  }

  const mediaRootResolved = path.posix.resolve(mediaRoot);
  const resolved = candidate.startsWith("/")
    ? path.posix.resolve(candidate)
    : path.posix.resolve(mediaRootResolved, candidate);

  if (
    resolved !== mediaRootResolved &&
    !resolved.startsWith(`${mediaRootResolved}/`)
  ) {
    throw new Error("Paths must be under MEDIA_ROOT");
  }

  return resolved;
};

const accessReadable = async (filePath, label) => {
  const resolved = resolveMediaPath(filePath);
  if (!resolved) return "";
  try {
    await fs.promises.access(resolved, fs.constants.R_OK);
    return resolved;
  } catch {
    throw new Error(`Cannot read ${label}`);
  }
};

const parseCsv = (value) =>
  String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const enqueueAuthorJob = ({
  jobId,
  video,
  still,
  intro,
  audioTracks,
  subtitleTracks,
  format,
  volumeName,
  twoPass,
  subtitleBurnIn,
}) => {
  const scratchDir = path.posix.join(scratchRoot, jobId);
  const outputIso = path.posix.join(outputRoot, `${jobId}.iso`);

  const job = {
    id: jobId,
    status: "queued",
    createdAt: new Date().toISOString(),
    output: outputIso,
    error: null,
  };
  jobs.set(jobId, job);

  queue = queue
    .then(async () => {
      job.status = "running";
      job.startedAt = new Date().toISOString();
      await ensureDir(scratchDir);
      logger.setJobId(jobId);

      const subtitleForBurnIn =
        subtitleBurnIn && subtitleTracks.length > 0 ? subtitleTracks[0].path : "";
      const subtitleTracksForMux = subtitleBurnIn ? [] : subtitleTracks;

      const result = await author({
        jobId,
        video,
        audioTracks,
        still,
        intro: intro || "",
        format,
        volumeName,
        twoPass,
        output: outputIso,
        scratch: scratchDir,
        subtitle: subtitleForBurnIn,
        subtitleTracks: subtitleTracksForMux,
        subtitleBurnIn,
      });

      if (!result.success) {
        job.status = "error";
        job.error = result.error || "Unknown error";
      } else {
        job.status = "success";
      }
      job.finishedAt = new Date().toISOString();
    })
    .catch((err) => {
      const job = jobs.get(jobId);
      if (job) {
        job.status = "error";
        job.error = err?.message || String(err);
        job.finishedAt = new Date().toISOString();
      }
    })
    .finally(() => {
      logger.setJobId(null);
    });

  return { outputIso, scratchDir };
};

const requireTokenIfConfigured = (req, res, next) => {
  const required = process.env.ADMIN_TOKEN;
  if (!required) return next();

  const token =
    req.get("x-api-token") ||
    req.query.token ||
    (req.body && req.body.token) ||
    "";

  if (token !== required) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
};

app.use(express.json({ limit: "10mb" }));

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      cb(null, req.jobDir);
    },
    filename: (_req, file, cb) => {
      const safeBase = file.originalname
        .replaceAll("\\", "_")
        .replaceAll("/", "_")
        .replaceAll(":", "_");
      cb(null, `${Date.now()}-${safeBase}`);
    },
  }),
});

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>DVD Authoring Tool</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 900px; margin: 24px auto; padding: 0 16px; }
      fieldset { margin: 16px 0; }
      label { display: block; margin: 10px 0 6px; font-weight: 600; }
      input, select { width: 100%; padding: 10px; }
      button { padding: 10px 14px; font-weight: 600; }
      pre { background: #0b1020; color: #cfe3ff; padding: 12px; overflow: auto; border-radius: 8px; }
      .row { display: grid; grid-template-columns: 1fr 200px; gap: 12px; align-items: end; }
      .muted { color: #5d6472; font-size: 13px; }
    </style>
  </head>
  <body>
    <h1>DVD Authoring Tool</h1>
    <div class="muted">Upload files, or reference existing /media files on the VPS.</div>

    <fieldset>
      <legend>Inputs</legend>
      <div class="muted">Paths must be under <code>/media</code> as seen from inside the container.</div>

      <label>Video</label>
      <div class="row" style="grid-template-columns: 1fr 1fr; align-items: center;">
        <label style="font-weight: 400;"><input type="radio" name="videoSource" value="upload" checked /> Upload file</label>
        <label style="font-weight: 400;"><input type="radio" name="videoSource" value="paths" /> Use existing VPS path</label>
      </div>
      <div id="videoUploadWrap">
        <input id="video" type="file" accept="video/*" />
      </div>
      <div id="videoPathWrap" style="display:none;">
        <input id="videoPath" type="text" placeholder="/media/wp-uploads/2025/09/movie.mp4" />
      </div>

      <label>Menu background image</label>
      <div class="row" style="grid-template-columns: 1fr 1fr; align-items: center;">
        <label style="font-weight: 400;"><input type="radio" name="stillSource" value="upload" checked /> Upload file</label>
        <label style="font-weight: 400;"><input type="radio" name="stillSource" value="paths" /> Use existing VPS path</label>
      </div>
      <div id="stillUploadWrap">
        <input id="still" type="file" accept="image/*" />
      </div>
      <div id="stillPathWrap" style="display:none;">
        <input id="stillPath" type="text" placeholder="/media/wp-uploads/2025/12/background.jpg" />
      </div>

      <label>Intro video (optional)</label>
      <div class="row" style="grid-template-columns: 1fr 1fr; align-items: center;">
        <label style="font-weight: 400;"><input type="radio" name="introSource" value="upload" checked /> Upload file</label>
        <label style="font-weight: 400;"><input type="radio" name="introSource" value="paths" /> Use existing VPS path</label>
      </div>
      <div id="introUploadWrap">
        <input id="intro" type="file" accept="video/*" />
      </div>
      <div id="introPathWrap" style="display:none;">
        <input id="introPath" type="text" placeholder="/media/wp-uploads/2025/12/intro.mp4" />
      </div>

      <label>Audio tracks</label>
      <div class="row" style="grid-template-columns: 1fr 1fr; align-items: center;">
        <label style="font-weight: 400;"><input type="radio" name="audioSource" value="upload" checked /> Upload files</label>
        <label style="font-weight: 400;"><input type="radio" name="audioSource" value="paths" /> Use existing VPS paths</label>
      </div>
      <div id="audioUploadWrap">
        <input id="audios" type="file" accept="audio/*" multiple />
      </div>
      <div id="audioPathWrap" style="display:none;">
        <textarea id="audioPaths" style="width:100%; padding:10px;" rows="4" placeholder="/media/wp-uploads/2025/12/english.wav&#10;/media/wp-uploads/2025/12/polish.wav"></textarea>
      </div>
      <div class="muted">Language codes aligned to audio order, e.g. <code>en,es,fr</code></div>
      <input id="audioLanguages" type="text" placeholder="en,es,fr" />

      <label>Subtitle files (optional)</label>
      <div class="row" style="grid-template-columns: 1fr 1fr; align-items: center;">
        <label style="font-weight: 400;"><input type="radio" name="subtitleSource" value="upload" checked /> Upload files</label>
        <label style="font-weight: 400;"><input type="radio" name="subtitleSource" value="paths" /> Use existing VPS paths</label>
      </div>
      <div id="subtitleUploadWrap">
        <input id="subtitles" type="file" accept=".srt,.ass,.ssa,.vtt,text/plain" multiple />
      </div>
      <div id="subtitlePathWrap" style="display:none;">
        <textarea id="subtitlePaths" style="width:100%; padding:10px;" rows="3" placeholder="/media/wp-uploads/2025/12/en.srt&#10;/media/wp-uploads/2025/12/pl.srt"></textarea>
      </div>
      <div class="muted">Language codes aligned to subtitle order, e.g. <code>en,es,fr</code></div>
      <input id="subtitleLanguages" type="text" placeholder="en,es,fr" />
      <div class="row">
        <div>
          <label>Burn subtitles into video</label>
          <select id="subtitleBurnIn">
            <option value="false" selected>No</option>
            <option value="true">Yes (not toggleable on DVD)</option>
          </select>
        </div>
        <div>
          <label>Format</label>
          <select id="format">
            <option value="pal" selected>PAL</option>
            <option value="ntsc">NTSC</option>
          </select>
        </div>
      </div>

      <div class="row">
        <div>
          <label>Volume name</label>
          <input id="volumeName" type="text" value="DVD_VIDEO" />
        </div>
        <div>
          <label>Two-pass encoding</label>
          <select id="twoPass">
            <option value="true" selected>Yes</option>
            <option value="false">No</option>
          </select>
        </div>
      </div>

      <label>Admin token (only if configured on server)</label>
      <input id="token" type="password" placeholder="optional" />

      <div style="margin-top: 12px;">
        <button id="start">Start Job</button>
      </div>
    </fieldset>

    <fieldset>
      <legend>Status</legend>
      <div id="status">Idle</div>
      <div id="download"></div>
      <pre id="log"></pre>
    </fieldset>

    <script src="/socket.io/socket.io.js"></script>
    <script>
      const logEl = document.getElementById("log");
      const statusEl = document.getElementById("status");
      const downloadEl = document.getElementById("download");
      const startBtn = document.getElementById("start");

      let activeJobId = null;
      const socket = io();

      const appendLog = (line) => {
        logEl.textContent += line + "\\n";
        logEl.scrollTop = logEl.scrollHeight;
      };

      socket.on("output", (payload) => {
        if (activeJobId && payload && payload.jobId && payload.jobId !== activeJobId) return;
        if (!payload) return;
        appendLog(payload.message ?? String(payload));
      });

      const pollStatus = async (jobId, token) => {
        while (true) {
          const url = new URL(location.origin + "/api/jobs/" + jobId);
          if (token) url.searchParams.set("token", token);
          const res = await fetch(url.toString());
          const data = await res.json();
          statusEl.textContent = data.status;
          if (data.status === "success") {
            const durl = new URL(location.origin + "/api/jobs/" + jobId + "/download");
            if (token) durl.searchParams.set("token", token);
            downloadEl.innerHTML = '<a href="' + durl.toString() + '">Download ISO</a>';
            return;
          }
          if (data.status === "error") {
            appendLog("ERROR: " + (data.error || "Unknown error"));
            return;
          }
          await new Promise(r => setTimeout(r, 2000));
        }
      };

      startBtn.addEventListener("click", async () => {
        logEl.textContent = "";
        downloadEl.textContent = "";
        statusEl.textContent = "Submitting...";

        const token = document.getElementById("token").value || "";

        const getRadioValue = (name) => {
          const el = document.querySelector('input[name="' + name + '"]:checked');
          return el ? el.value : "upload";
        };

        const videoSource = getRadioValue("videoSource");
        const stillSource = getRadioValue("stillSource");
        const introSource = getRadioValue("introSource");
        const audioSource = getRadioValue("audioSource");
        const subtitleSource = getRadioValue("subtitleSource");

        const form = new FormData();

        if (videoSource === "upload") {
          const video = document.getElementById("video").files[0];
          if (!video) {
            statusEl.textContent = "Missing required video file.";
            return;
          }
          form.append("video", video);
        } else {
          const videoPath = document.getElementById("videoPath").value;
          if (!videoPath) {
            statusEl.textContent = "Missing required video path.";
            return;
          }
          form.append("videoPath", videoPath);
        }

        if (stillSource === "upload") {
          const still = document.getElementById("still").files[0];
          if (!still) {
            statusEl.textContent = "Missing required menu image file.";
            return;
          }
          form.append("still", still);
        } else {
          const stillPath = document.getElementById("stillPath").value;
          if (!stillPath) {
            statusEl.textContent = "Missing required menu image path.";
            return;
          }
          form.append("stillPath", stillPath);
        }

        if (introSource === "upload") {
          const intro = document.getElementById("intro").files[0] || null;
          if (intro) form.append("intro", intro);
        } else {
          const introPath = document.getElementById("introPath").value;
          if (introPath) form.append("introPath", introPath);
        }

        if (audioSource === "upload") {
          const audios = Array.from(document.getElementById("audios").files || []);
          if (audios.length === 0) {
            statusEl.textContent = "Missing required audio track(s).";
            return;
          }
          audios.forEach((a) => form.append("audios", a));
        } else {
          const audioPaths = document.getElementById("audioPaths").value || "";
          const audioLines = audioPaths
            .split(/\\r?\\n/)
            .map((v) => v.trim())
            .filter(Boolean);
          if (audioLines.length === 0) {
            statusEl.textContent = "Missing required audio path(s).";
            return;
          }
          form.append("audioPaths", audioLines.join("\\n"));
        }

        if (subtitleSource === "upload") {
          const subtitles = Array.from(document.getElementById("subtitles").files || []);
          subtitles.forEach((s) => form.append("subtitles", s));
        } else {
          const subtitlePaths = document.getElementById("subtitlePaths").value || "";
          const subtitleLines = subtitlePaths
            .split(/\\r?\\n/)
            .map((v) => v.trim())
            .filter(Boolean);
          if (subtitleLines.length > 0) {
            form.append("subtitlePaths", subtitleLines.join("\\n"));
          }
        }

        form.append("format", document.getElementById("format").value);
        form.append("volumeName", document.getElementById("volumeName").value);
        form.append("twoPass", document.getElementById("twoPass").value);
        form.append("audioLanguages", document.getElementById("audioLanguages").value);
        form.append("subtitleLanguages", document.getElementById("subtitleLanguages").value);
        form.append("subtitleBurnIn", document.getElementById("subtitleBurnIn").value);
        if (token) form.append("token", token);

        const res = await fetch("/api/jobs", {
          method: "POST",
          body: form,
          headers: token ? { "x-api-token": token } : {},
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          statusEl.textContent = "Failed: " + (err.error || res.statusText);
          return;
        }

        const data = await res.json();
        activeJobId = data.jobId;
        statusEl.textContent = "Queued: " + activeJobId;
        appendLog("Job created: " + activeJobId);
        pollStatus(activeJobId, token);
      });

      const bindToggle = (name, uploadWrapId, pathWrapId) => {
        const sync = () => {
          const value = document.querySelector('input[name="' + name + '"]:checked')?.value || "upload";
          document.getElementById(uploadWrapId).style.display = value === "upload" ? "block" : "none";
          document.getElementById(pathWrapId).style.display = value === "paths" ? "block" : "none";
        };
        document.querySelectorAll('input[name="' + name + '"]').forEach((el) => {
          el.addEventListener("change", sync);
        });
        sync();
      };

      bindToggle("videoSource", "videoUploadWrap", "videoPathWrap");
      bindToggle("stillSource", "stillUploadWrap", "stillPathWrap");
      bindToggle("introSource", "introUploadWrap", "introPathWrap");
      bindToggle("audioSource", "audioUploadWrap", "audioPathWrap");
      bindToggle("subtitleSource", "subtitleUploadWrap", "subtitlePathWrap");
    </script>
  </body>
</html>`);
});

app.post("/api/jobs/from-paths", requireTokenIfConfigured, async (req, res) => {
  const jobId = createJobId();

  try {
    const format = (req.body.format || "pal").toLowerCase() === "ntsc" ? "ntsc" : "pal";
    const volumeName = String(req.body.volumeName || "DVD_VIDEO").slice(0, 32);
    const twoPass = String(req.body.twoPass || "true") === "true";
    const subtitleBurnIn = String(req.body.subtitleBurnIn || "false") === "true";

    const audioLanguageCodes = parseCsv(req.body.audioLanguages);
    const subtitleLanguageCodes = parseCsv(req.body.subtitleLanguages);

    const video = await accessReadable(req.body.videoPath, "video");
    const still = await accessReadable(req.body.stillPath, "still image");
    const intro = await accessReadable(req.body.introPath, "intro");

    const audioPaths = Array.isArray(req.body.audioPaths)
      ? req.body.audioPaths
      : [];
    const subtitlePaths = Array.isArray(req.body.subtitlePaths)
      ? req.body.subtitlePaths
      : [];

    if (!video || !still || audioPaths.length === 0) {
      return res.status(400).json({
        error: "Missing required paths: videoPath, stillPath, audioPaths",
      });
    }

    const audioTracks = await Promise.all(
      audioPaths.map(async (p, index) => ({
        path: await accessReadable(p, `audio track ${index + 1}`),
        lang: audioLanguageCodes[index] || "en",
      }))
    );

    const subtitleTracks = await Promise.all(
      subtitlePaths.map(async (p, index) => ({
        path: await accessReadable(p, `subtitle track ${index + 1}`),
        lang: subtitleLanguageCodes[index] || "en",
      }))
    );

    enqueueAuthorJob({
      jobId,
      video,
      still,
      intro,
      audioTracks,
      subtitleTracks,
      format,
      volumeName,
      twoPass,
      subtitleBurnIn,
    });

    res.json({ jobId });
  } catch (err) {
    res.status(400).json({ error: err?.message || String(err) });
  }
});

app.post(
  "/api/jobs",
  (req, _res, next) => {
    const jobId = createJobId();
    const jobDir = path.posix.join(mediaRoot, "jobs", jobId);
    req.jobId = jobId;
    req.jobDir = jobDir;
    next();
  },
  async (req, res, next) => {
    try {
      await ensureDir(req.jobDir);
      next();
    } catch (err) {
      next(err);
    }
  },
  upload.fields([
    { name: "video", maxCount: 1 },
    { name: "still", maxCount: 1 },
    { name: "intro", maxCount: 1 },
    { name: "audios", maxCount: 16 },
    { name: "subtitle", maxCount: 1 },
    { name: "subtitles", maxCount: 16 },
  ]),
  express.urlencoded({ extended: true }),
  requireTokenIfConfigured,
  async (req, res) => {
    const jobId = req.jobId;
    const files = req.files || {};
    const videoFile = files.video?.[0];
    const stillFile = files.still?.[0];
    const audioFiles = files.audios || [];
    const introFile = files.intro?.[0];
    const subtitleFiles = (files.subtitles || []).length > 0 ? files.subtitles : files.subtitle || [];

    const format = (req.body.format || "pal").toLowerCase() === "ntsc" ? "ntsc" : "pal";
    const volumeName = String(req.body.volumeName || "DVD_VIDEO").slice(0, 32);
    const twoPass = String(req.body.twoPass || "true") === "true";
    const subtitleBurnIn = String(req.body.subtitleBurnIn || "false") === "true";

    const audioLanguageCodes = parseCsv(req.body.audioLanguages);
    const subtitleLanguageCodes = parseCsv(req.body.subtitleLanguages);

    const audioPathLines = String(req.body.audioPaths || "")
      .split(/\r?\n/)
      .map((v) => v.trim())
      .filter(Boolean);

    const subtitlePathLines = String(req.body.subtitlePaths || "")
      .split(/\r?\n/)
      .map((v) => v.trim())
      .filter(Boolean);

    const video = videoFile
      ? videoFile.path
      : await accessReadable(req.body.videoPath, "video");

    const still = stillFile
      ? stillFile.path
      : await accessReadable(req.body.stillPath, "still image");

    const intro = introFile
      ? introFile.path
      : await accessReadable(req.body.introPath, "intro");

    const audioTracksFromUploads = audioFiles.map((f, index) => ({
      path: f.path,
      lang: audioLanguageCodes[index] || "en",
    }));

    const audioTracksFromPaths = await Promise.all(
      audioPathLines.map(async (p, index) => ({
        path: await accessReadable(p, `audio track ${audioTracksFromUploads.length + index + 1}`),
        lang: audioLanguageCodes[audioTracksFromUploads.length + index] || "en",
      }))
    );

    const audioTracks = [...audioTracksFromUploads, ...audioTracksFromPaths];

    const subtitleTracksFromUploads = subtitleFiles.map((f, index) => ({
      path: f.path,
      lang: subtitleLanguageCodes[index] || "en",
    }));

    const subtitleTracksFromPaths = await Promise.all(
      subtitlePathLines.map(async (p, index) => ({
        path: await accessReadable(p, `subtitle track ${subtitleTracksFromUploads.length + index + 1}`),
        lang: subtitleLanguageCodes[subtitleTracksFromUploads.length + index] || "en",
      }))
    );

    const subtitleTracks = [...subtitleTracksFromUploads, ...subtitleTracksFromPaths];

    if (!video || !still || audioTracks.length === 0) {
      return res.status(400).json({
        error:
          "Missing required inputs: provide video (file or videoPath), still (file or stillPath), and at least 1 audio (files or audioPaths).",
      });
    }

    enqueueAuthorJob({
      jobId,
      video,
      still,
      intro,
      audioTracks,
      subtitleTracks,
      format,
      volumeName,
      twoPass,
      subtitleBurnIn,
    });

    res.json({ jobId });
  }
);

app.get("/api/jobs/:id", requireTokenIfConfigured, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Not found" });
  res.json(job);
});

app.get("/api/jobs/:id/download", requireTokenIfConfigured, async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Not found" });
  if (job.status !== "success") return res.status(409).json({ error: "Not ready" });

  try {
    await fs.promises.access(job.output, fs.constants.R_OK);
    res.download(job.output, path.posix.basename(job.output));
  } catch {
    res.status(404).json({ error: "Output missing" });
  }
});

const PORT = process.env.PORT || 3001;
server
  .listen(PORT, () => {
    logger.log(`Server running on port ${PORT}`);
  })
  .on("error", (err) => {
    logger.error("Failed to start server: " + err.message);
  });
