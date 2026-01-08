import spawnAsync from "./spawnAsync.js";
import logger from "../logger.js";

// Calculate available space with headroom
function calculateVideoBitrate(durationSeconds, audioKbps = 224) {
  // DVD-5 capacity in bytes
  const dvd5Capacity = 4700000000;

  // Apply 12% headroom
  const availableBytes = dvd5Capacity * (1 - 0.12);

  // Audio bit calculation
  const audioBitsTotal = durationSeconds * audioKbps * 1000;
  const audioBytesTotal = audioBitsTotal / 8;

  // Remaining space for video
  const videoBytesAvailable = availableBytes - audioBytesTotal;

  // Convert to bits and calculate bitrate
  const videoBitsAvailable = videoBytesAvailable * 8;
  const videoBitrateKbps = Math.floor(
    videoBitsAvailable / (durationSeconds * 1000)
  );

  return {
    availableCapacity: Math.floor(availableBytes),
    audioBytesTotal: Math.floor(audioBytesTotal),
    videoBytesAvailable: Math.floor(videoBytesAvailable),
    videoBitrateKbps: videoBitrateKbps > 6000 ? 6000 : videoBitrateKbps, // Cap at 6000 kbps
  };
}

const ffmpegEncodeMain = async (
  context,
  { incomingFrameRateChange, vStandard, forceKeyframes, vf, af }
) => {
  const audioTracks = Array.isArray(context.args.audioTracks)
    ? context.args.audioTracks
    : Array.isArray(context.args.audios)
      ? context.args.audios.map((audioPath, index) => ({
          path: audioPath,
          lang: Array.isArray(context.args.audioLanguages)
            ? context.args.audioLanguages[index]
            : undefined,
        }))
      : typeof context.args.audio === "string"
        ? [{ path: context.args.audio }]
        : [];

  if (audioTracks.length === 0) {
    throw new Error("At least one audio track is required");
  }

  const normalizedAudioTracks = audioTracks.map((track) => ({
    path: track.path,
    lang: typeof track.lang === "string" && track.lang.length > 0 ? track.lang : "en",
  }));

  const firstPassInputs = [...incomingFrameRateChange, "-i", context.args.video];

  const fullInputs = [
    ...incomingFrameRateChange,
    "-i",
    context.args.video,
    ...normalizedAudioTracks.flatMap((track) => ["-i", track.path]),
  ];

  const commonOutputParams = [
    "-target",
    `${vStandard}-dvd`,
    "-map",
    "0:v:0",
    "-minrate",
    "1200k",
    "-maxrate",
    "9200k",
    ...forceKeyframes,
    ...vf,
    "-flags",
    "+ildct+ilme",
  ];

  const audioMapParams = normalizedAudioTracks.flatMap((_, index) => [
    "-map",
    `${index + 1}:a:0`,
  ]);

  const audioMetadataParams = normalizedAudioTracks.flatMap((track, index) => [
    `-metadata:s:a:${index}`,
    `language=${track.lang}`,
  ]);

  if (context.args.twoPass) {
    const duration = context.media.video.duration;
    const assumedAudioKbps = 224 * normalizedAudioTracks.length;
    const bitBudget = calculateVideoBitrate(duration, assumedAudioKbps);

    logger.log(
      `Available capacity: ${bitBudget.availableCapacity} bytes, Audio total: ${
        bitBudget.audioBytesTotal
      } bytes, Video available: ${
        bitBudget.videoBytesAvailable
      } bytes, Video bitrate${
        bitBudget.videoBitrateKbps === 6000 ? " (capped)" : ""
      }: ${bitBudget.videoBitrateKbps} kbps`
    );
    // First pass - analysis only
    const firstPassParams = [
      ...firstPassInputs,
      ...commonOutputParams,
      "-b:v",
      `${bitBudget.videoBitrateKbps}k`, // Target bitrate
      "-pass",
      "1",
      "-an", // No audio in first pass
      "-f",
      "null",
      "/dev/null", // In Linux/Alpine we use /dev/null
    ];

    // Use the scratch directory directly for the pass log file
    const passLogfile = `${context.int.scratchDir}/ffmpeg2pass`;

    // Second pass - actual encoding
    const secondPassParams = [
      ...fullInputs,
      ...commonOutputParams,
      "-b:v",
      `${bitBudget.videoBitrateKbps}k`, // Target bitrate
      "-pass",
      "2",
      ...audioMapParams,
      ...af,
      "-c:a",
      "ac3",
      "-b:a",
      "224k",
      "-ar",
      "48000",
      "-ac",
      "2",
      ...audioMetadataParams,
      "-y",
      context.int.moviePath,
    ];

    // Execute first pass
    console.log("Starting first pass encoding...");
    await spawnAsync("ffmpeg", [
      ...firstPassParams,
      "-passlogfile",
      passLogfile,
    ]);

    // Execute second pass
    console.log("Starting second pass encoding...");
    await spawnAsync("ffmpeg", [
      ...secondPassParams,
      "-passlogfile",
      passLogfile,
    ]);
  } else {
    const onePassParams = [
      ...fullInputs,
      ...commonOutputParams,
      "-q:v",
      "2",
      ...audioMapParams,
      ...af,
      "-c:a",
      "ac3",
      "-b:a",
      "224k",
      "-ar",
      "48000",
      "-ac",
      "2",
      ...audioMetadataParams,
      "-y",
      context.int.moviePath,
    ];
    // Execute second pass
    console.log("Starting constant quality one-pass encoding...");
    await spawnAsync("ffmpeg", onePassParams);
  }

  return;
};

export default ffmpegEncodeMain;
