import yargs from "yargs";
import { hideBin } from "yargs/helpers"; // Add this import at the top of your file
import waitForDebugger from "./utils/waitForDebugger.js";
import chaptersGenerate from "./utils/chaptersGenerate.js";
import logger from "./utils/logger.js";
import menuCreate from "./tasks/menuCreate.js";
import introCreate from "./tasks/introCreate.js";
import mainCreate from "./tasks/mainCreate.js";
import mainProbe from "./tasks/mainProbe.js";
import contextVariables from "./utils/contextVariables.js";
import directoryEstablish from "./utils/directoryEstablish.js";
import dvdCreate from "./tasks/dvdCreate.js";
import isoCreate from "./tasks/isoCreate.js";
import blackCreate from "./tasks/blackCreate.js";

// Function that accepts parameters directly
const author = async (options) => {
  const normalizedOptions = { ...options };

  if (Array.isArray(normalizedOptions.audio)) {
    normalizedOptions.audios = normalizedOptions.audio;
  }

  if (typeof normalizedOptions.audios === "string") {
    normalizedOptions.audios = [normalizedOptions.audios];
  }

  if (
    !Array.isArray(normalizedOptions.audios) &&
    typeof normalizedOptions.audio === "string"
  ) {
    normalizedOptions.audios = [normalizedOptions.audio];
  }

  if (
    typeof normalizedOptions.audioLanguages === "string" &&
    normalizedOptions.audioLanguages.length > 0
  ) {
    normalizedOptions.audioLanguages = normalizedOptions.audioLanguages
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }

  if (Array.isArray(normalizedOptions.subtitle)) {
    normalizedOptions.subtitles = normalizedOptions.subtitle;
  }

  if (typeof normalizedOptions.subtitles === "string") {
    normalizedOptions.subtitles = [normalizedOptions.subtitles];
  }

  if (
    !Array.isArray(normalizedOptions.subtitles) &&
    typeof normalizedOptions.subtitle === "string" &&
    normalizedOptions.subtitle.length > 0
  ) {
    normalizedOptions.subtitles = [normalizedOptions.subtitle];
  }

  if (
    typeof normalizedOptions.subtitleLanguages === "string" &&
    normalizedOptions.subtitleLanguages.length > 0
  ) {
    normalizedOptions.subtitleLanguages = normalizedOptions.subtitleLanguages
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }

  const context = {
    // args: operational options
    args: {
      audioOffset: 0,
      debug: false,
      debugWaitTime: 5,
      fullMux: true,
      twoPass: true,
      ...normalizedOptions,
    },
    // int: intermediate variables
    int: {},
    // out: output variables
    out: {},
    // com: command execution utilities
    com: { enc: "" },
  };

  // If debug flag is set, wait for debugger to attach
  if (context.args.debug) {
    await waitForDebugger(context.args.debugWaitTime);
    // Execution will pause here when debugger attaches
    debugger;
  }

  // Start overall timer
  logger.time("Total DVD authoring process");

  try {
    // establish context variables
    contextVariables(context);

    // setup directories and paths
    await directoryEstablish(context);

    // evaluate main video file
    await mainProbe(context);

    // get the chapter points
    chaptersGenerate(context, 10, 0.5); // Generate chapters every 10 minutes with 0.5 seconds buffer

    await blackCreate(context);

    // Encode intro video and audio file
    await introCreate(context);

    // Encode main video and audio file
    await mainCreate(context);

    // Create and encode menu
    await menuCreate(context);

    // Authoring DVD-Video structure
    await dvdCreate(context);

    // Discimage output
    await isoCreate(context);

    return {
      success: true,
      disc: context.out.outputDisc,
      output: context.args.output,
    };
  } catch (error) {
    logger.timeEnd("Total DVD authoring process");
    logger.error("Error creating DVD:", error);
    console.error("Error creating DVD:", error);
    return { success: false, error: error.message };
  }
};

// Execute directly if this file is run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = yargs(hideBin(process.argv))
    .option("video", {
      type: "string",
      demandOption: true,
      description: "Path to video file",
    })
    .option("audio", {
      type: "string",
      array: true,
      demandOption: true,
      description: "Path(s) to audio file(s)",
    })
    .option("audioLanguages", {
      type: "string",
      array: true,
      default: [],
      description: "Language codes for audio tracks (aligned to --audio)",
    })
    .option("still", {
      type: "string",
      demandOption: true,
      description: "Path to still image for menu",
    })
    .option("intro", {
      type: "string",
      default: "",
      description: "Path to intro video file (optional)",
    })
    .option("format", {
      type: "string",
      choices: ["pal", "ntsc"],
      default: "pal",
      description: "Video standard format (pal or ntsc)",
    })
    .option("volumeName", {
      type: "string",
      default: "DVD_VIDEO",
      description: "Volume name/ID for the DVD ISO",
    })
    .option("output", {
      type: "string",
      demandOption: true,
      description: "Path (including filename) for output ISO",
    })
    .option("scratch", {
      type: "string",
      description: "Directory for temporary DVD structure files",
    })
    .option("audioOffset", {
      type: "number",
      default: 0,
      description: "Optional audio offset in seconds",
    })
    .option("subtitle", {
      type: "string",
      array: true,
      default: [],
      description: "Path to subtitle file (optional, e.g. .srt)",
    })
    .option("subtitleLanguages", {
      type: "string",
      array: true,
      default: [],
      description: "Language codes for subtitle tracks (aligned to --subtitle)",
    })
    .option("subtitleBurnIn", {
      type: "boolean",
      default: false,
      description: "Burn subtitles into the video (non-toggleable)",
    })
    .option("forceRebuild", {
      type: "boolean",
      default: false,
      description: "Force rebuild of all intermediate files",
    })
    .option("twoPass", {
      type: "boolean",
      default: true,
      description: "Enable two-pass encoding",
    })
    .option("debug", {
      type: "boolean",
      default: false,
      description: "Enable debug mode with wait time for attaching debugger",
    })
    .option("debugWaitTime", {
      type: "number",
      default: 5,
      description: "Number of seconds to wait for debugger attachment",
    }).argv;

  author(args)
    .then((result) => {
      if (!result.success) {
        process.exit(1);
      }
    })
    .catch((err) => {
      logger.error("Unexpected error:", err);
      process.exit(1);
    });
}

export default author;
