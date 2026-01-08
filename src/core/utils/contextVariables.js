import path from "path";

const contextVariables = (context) => {
  // Validate required arguments
  const requiredArgs = ["video", "still", "format", "output", "scratch"];
  for (const key of requiredArgs) {
    if (!context.args[key]) {
      throw new Error(`Missing required parameter: ${key}`);
    }
  }

  if (typeof context.args.intro !== "string") {
    context.args.intro = "";
  }

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
    throw new Error("Missing required parameter: audio");
  }

  context.args.audioTracks = audioTracks.map((track) => ({
    path: track.path,
    lang: typeof track.lang === "string" && track.lang.length > 0 ? track.lang : "en",
  }));

  // Scratch path
  context.int["scratchDir"] = path.resolve(context.args.scratch);
  // Ensure output directory path exists
  context.out["outputPath"] = path.dirname(path.resolve(context.args.output));
  context.out["outputDisc"] = path.join(
    path.dirname(path.resolve(context.args.output)),
    "0"
  );
  // Main AV paths
  context.int["rawMpegPath"] = `${context.int.scratchDir}/raw_movie.m2v`;
  context.int["moviePath"] = `${context.int.scratchDir}/movie.mpg`;
  context.int["audioPath"] = `${context.int.scratchDir}/audio.ac3`;
  // Menu paths
  context.int["menuPngPath"] = `${context.int.scratchDir}/menu_temp.png`;
  context.int["rawMenuMpgPath"] = `${context.int.scratchDir}/raw_menu.m2v`;
  context.int["menuMpgPath"] = `${context.int.scratchDir}/menu.mpg`;
  // Black path
  context.int["blackPath"] = `${context.int.scratchDir}/black.mpg`;
  // Introduction path
  context.int["introPath"] =
    context.args.intro.length > 0
      ? `${context.int.scratchDir}/intro.mpg`
      : context.int.blackPath;
};

export default contextVariables;
