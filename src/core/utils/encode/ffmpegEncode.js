import detectDvdFrameRate from "./detectDvdFrameRate.js";
import ffmpegEncodeBlack from "./ffmpegEncode-Black.js";
import ffmpegEncodeIntro from "./ffmpegEncode-Intro.js";
import ffmpegEncodeMain from "./ffmpegEncode-Main.js";
import ffmpegEncodeMenu from "./ffmpegEncode-Menu.js";

const ffmpegEncode = async (context) => {
  const escapeForFfmpegFilter = (value) => value.replaceAll("'", "\\'");

  context.int["encode"] = {};
  const args = context.int.encode;
  args["vStandard"] = context.args.format.toLowerCase();
  args["verticalRes"] = args.vStandard === "pal" ? "576" : "480";
  args["vfRate"] = args.vStandard === "pal" ? "25" : "30000/1001";

  args["vSar"] = args.vStandard === "pal" ? "64/45" : "32:27";
  // re. https://en.wikipedia.org/wiki/Pixel_aspect_ratio
  // & https://forum.doom9.org/showthread.php?p=1018738
  // (16/9)/(720/480) = 1.185185 almost 32/27
  // (16/9)/(720/576) = 1.422216 almost 64/45

  // rate change
  args["incomingFrameRateChange"] = [];
  // audio filter
  args["af"] = [];
  // video filter
  args["vf"] = [];
  // Force keyframes at chapter points
  args["forceKeyframes"] = [];
  // telecine filter
  args["telecine"] = [];
  // field dominance
  args["fieldDominance"] = "prog";

  // frame rate conversion
  if (context.com.enc.includes(".main")) {
    const framerateinfo = detectDvdFrameRate(
      context.media.video.video.r_frame_rate,
      args.vStandard
    );

    if (!framerateinfo) {
      throw new Error(
        `Unsupported frame rate ${context.media.video.video.r_frame_rate} for ${args.vStandard} DVD`
      );
    }

    if (!framerateinfo.transform) {
      framerateinfo["transform"] = framerateinfo.transforms[args.vStandard];
    }

    //   eg:
    // framerateinfo = {
    //   transform: {
    //     needsTelecine: false,
    //     speedChange: true,
    //     speedFactor: 24000 / 1001 / 50,
    //   },
    //   ...etc,
    // };

    // atempo filter is used to adjust the audio speed
    const atempo = framerateinfo.transform.speedChange
      ? `atempo=${framerateinfo.transform.speedFactor}`
      : "";

    // If the frame rate needs to be changed, we add the rate change filter
    if (framerateinfo.transform.speedChange) {
      args.incomingFrameRateChange.push(
        "-r",
        framerateinfo.transform.needsTelecine ? "24000/1001" : args.vfRate
      );
      // inverse of vfRate rounded to 3 decimal places
      context["speedChange"] = 1.001;
    }

    if (framerateinfo.transform.needsTelecine) {
      args.telecine.push("telecine=pattern=2332");
      args.fieldDominance = "tff"; // auto | tff | bff | prog  ... not sure about this setting yet!!
    }

    if (context.args.audioOffset !== 0) {
      args.af.push(
        "-af",
        `${atempo.length > 0 ? atempo + "," : ""}adelay=${
          context.args.audioOffset * 1000
        }|${context.args.audioOffset * 1000}`
      );
    } else if (atempo.length > 0) {
      // If atempo is defined, we add it to the audio filter
      args.af.push("-af", atempo);
    }

    if (context.media.chapters && context.media.chapters.length > 0) {
      // Create a comma-separated list of timestamps in the format expr:gte(t,X)
      const keyframeExpressions = context.media.chapters
        .map((time) => `gte(t,${time})`)
        .join("+");

      args.forceKeyframes.push(
        "-force_key_frames",
        `expr:${keyframeExpressions}`
      );
    }
  }

  // Find the first stereo audio track
  const stereoTrack = context.media.video.streams.find(
    (stream) => stream.codec_type === "audio" && stream.channels === 2
  );

  const burnInSubtitlePath =
    typeof context.args.subtitle === "string"
      ? context.args.subtitle
      : Array.isArray(context.args.subtitle) && typeof context.args.subtitle[0] === "string"
        ? context.args.subtitle[0]
        : "";

  const shouldBurnSubtitles =
    context.com.enc.includes(".main") &&
    context.args.subtitleBurnIn === true &&
    burnInSubtitlePath.length > 0;

  const subtitleFilter = shouldBurnSubtitles
    ? `subtitles='${escapeForFfmpegFilter(burnInSubtitlePath)}'`
    : null;

  if (context.com.enc.includes(".menu")) {
    args.vf.push(
      "-vf",
      [
        `scale=720:${args.verticalRes}`,
        `setsar=${args.vSar}`,
        "setdar=16/9",
        "format=yuv420p",
        `setfield=${args.fieldDominance}`,
      ].join(",")
    );
  } else {
    args.vf.push(
      "-vf",
      [
        `scale=720:${args.verticalRes}`,
        `setsar=${args.vSar}`,
        "setdar=16/9",
        "format=yuv420p",
        `setfield=${args.fieldDominance}`,
        ...args.telecine,
        ...(subtitleFilter ? [subtitleFilter] : []),
      ].join(",")
    );
  }

  switch (context.com.enc) {
    case "program.dvd.main":
      await ffmpegEncodeMain(context, args);
      return;
    case "program.dvd.intro":
      await ffmpegEncodeIntro(context, args);
      return;
    case "program.dvd.menu":
      await ffmpegEncodeMenu(context, args);
      return;
    case "program.dvd.black":
      await ffmpegEncodeBlack(context, args);
      return;
    default:
      throw new Error(`Unsupported encode instruction: ${context.com.enc}`);
  }
};

export default ffmpegEncode;
