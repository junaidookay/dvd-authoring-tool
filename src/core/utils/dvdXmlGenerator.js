import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const generateDvdXml = (context) => {
  const vStandard = context.args.format.toLowerCase();
  const menuPath = context.int.menuMpgPath;
  const moviePath = context.int.moviePath;
  const blackPath = context.int.blackPath;
  const introPath = context.int.introPath;
  let chapters = context.media.chapters ?? [];
  const audioTracks = Array.isArray(context.args.audioTracks)
    ? context.args.audioTracks
    : [{ lang: "en" }];
  const subtitleTracksRaw = Array.isArray(context.args.subtitleTracks)
    ? context.args.subtitleTracks
    : Array.isArray(context.args.subtitles)
      ? context.args.subtitles.map((subtitlePath, index) => ({
          path: subtitlePath,
          lang: Array.isArray(context.args.subtitleLanguages)
            ? context.args.subtitleLanguages[index]
            : undefined,
        }))
      : typeof context.args.subtitle === "string" && context.args.subtitle.length > 0
        ? [{ path: context.args.subtitle, lang: "en" }]
        : [];
  const subtitleTracks =
    context.args.subtitleBurnIn === true ? [] : subtitleTracksRaw;

  // Apply NTSC timing adjustment if needed
  if (vStandard === "ntsc") {
    // Apply 1.001 multiplier for NTSC, rounded to 2 decimal places
    chapters = chapters.map((time) => Number((time * 1.001).toFixed(2)));
  }

  // Validate required paths
  if (!menuPath || !moviePath || !blackPath) {
    throw new Error("Missing required paths for DVD XML generation");
  }

  // Load template file
  const templatePath = path.join(
    __dirname,
    "..",
    "templates",
    "dvd-template.xml"
  );
  let template = fs.readFileSync(templatePath, "utf8");

  // Replace placeholders
  template = template.replaceAll("{{menuPath}}", menuPath);
  template = template.replaceAll("{{moviePath}}", moviePath);
  template = template.replaceAll("{{blackPath}}", blackPath);
  template = template.replaceAll("{{introPath}}", introPath);
  template = template.replace(
    "{{chapters}}",
    `0,${chapters.map((t) => t).join(",")}`
  );
  template = template.replace(
    "{{titleAudioTags}}",
    audioTracks
      .map((track) => {
        const lang =
          typeof track.lang === "string" && track.lang.length > 0
            ? track.lang
            : "en";
        return `      <audio lang="${lang}" content="normal"/>`;
      })
      .join("\n")
  );
  template = template.replace(
    "{{titleSubpictureTags}}",
    subtitleTracks.length > 0
      ? subtitleTracks
          .map((track) => {
            const lang =
              typeof track.lang === "string" && track.lang.length > 0
                ? track.lang
                : "en";
            return `      <subpicture lang="${lang}"/>`;
          })
          .join("\n")
      : ""
  );

  return template;
};
