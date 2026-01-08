import fs from "fs";
import { execSync } from "child_process";
import logger from "../utils/logger.js";
import ffmpegEncode from "../utils/encode/ffmpegEncode.js";
import { generateTextSubXml } from "../utils/spuXmlGenerator.js";

const mainCreate = async (context) => {
  const baseMovieNeedsBuild =
    !fs.existsSync(context.int.moviePath) || context.args.forceRebuild;

  if (baseMovieNeedsBuild) {
    logger.log("Converting video to DVD format (muxed)...");

    logger.time("Main AV conversion");
    context.com.enc = "program.dvd.main";
    await ffmpegEncode(context);
    logger.timeEnd("Main AV conversion");
  } else {
    logger.log("Using existing AV (muxed) file");
  }

  const subtitleTracks = Array.isArray(context.args.subtitleTracks)
    ? context.args.subtitleTracks
    : Array.isArray(context.args.subtitles)
      ? context.args.subtitles.map((subtitlePath, index) => ({
          path: subtitlePath,
          lang: Array.isArray(context.args.subtitleLanguages)
            ? context.args.subtitleLanguages[index]
            : undefined,
        }))
      : [];

  const shouldMuxSubtitles =
    subtitleTracks.length > 0 && context.args.subtitleBurnIn !== true;

  if (!shouldMuxSubtitles) return;

  const muxedMoviePath = `${context.int.scratchDir}/movie_with_subtitles.mpg`;
  if (fs.existsSync(muxedMoviePath) && !context.args.forceRebuild) {
    context.int.moviePath = muxedMoviePath;
    return;
  }

  logger.log(`Muxing ${subtitleTracks.length} subtitle track(s) into DVD stream...`);
  logger.time("Subtitle muxing");

  const vStandard = (context.args.format || "pal").toLowerCase() === "ntsc" ? "ntsc" : "pal";
  const movieWidth = 720;
  const movieHeight = vStandard === "pal" ? 576 : 480;

  let currentInput = context.int.moviePath;
  let currentOutput = muxedMoviePath;

  subtitleTracks.forEach((track, index) => {
    const subtitlePath = track?.path;
    if (typeof subtitlePath !== "string" || subtitlePath.length === 0) {
      throw new Error("Invalid subtitle track path");
    }

    const xmlPath = `${context.int.scratchDir}/spumux_sub_${index}.xml`;
    const nextOutput =
      index === subtitleTracks.length - 1
        ? muxedMoviePath
        : `${context.int.scratchDir}/movie_sub_${index}.mpg`;

    const spumuxXml = generateTextSubXml({
      subtitlePath,
      vStandard,
      movieWidth,
      movieHeight,
    });
    fs.writeFileSync(xmlPath, spumuxXml);

    execSync(
      `spumux -m dvd -s ${index} "${xmlPath}" < "${currentInput}" > "${nextOutput}"`,
      { stdio: "inherit" }
    );

    currentInput = nextOutput;
    currentOutput = nextOutput;
  });

  context.int.moviePath = currentOutput;
  logger.timeEnd("Subtitle muxing");
};

export default mainCreate;
