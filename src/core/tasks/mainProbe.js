import logger from "../utils/logger.js";
import ffprobeAnalyse from "../utils/ffprobeAnalyse.js";

const mainProbe = async (context) => {
  // Analyze source media files and store information in context
  logger.log("Analyzing source media files...");
  const audioPaths = Array.isArray(context.args.audioTracks)
    ? context.args.audioTracks.map((t) => t.path)
    : Array.isArray(context.args.audios)
      ? context.args.audios
      : typeof context.args.audio === "string"
        ? [context.args.audio]
        : [];

  context["media"] = {
    video: ffprobeAnalyse(context.args.video),
    audios: audioPaths.map((audioPath) => ffprobeAnalyse(audioPath)),
    intro: ffprobeAnalyse(context.args.intro),
    chapters: [600, 1200, 1800], // Default chapters, can be customized later
  };

  logger.log(
    `Video duration: ${context.media.video.duration.toFixed(2)} seconds`
  );
  logger.log(
    `Video resolution: ${context.media.video.video.width}x${context.media.video.video.height}`
  );
  if (context.media.audios.length > 0) {
    logger.log(`Audio tracks: ${context.media.audios.length}`);
    logger.log(`Audio[0] format: ${context.media.audios[0].audio.codec_name}`);
  }
};

export default mainProbe;
