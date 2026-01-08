import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import xmlFormat from "xml-formatter";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const generateSpuXml = ({
  buttonNormalPath,
  buttonHighlightPath,
  buttonSelectPath,
  buttonCoordinates,
}) => {
  // Validate required paths
  if (!buttonNormalPath || !buttonHighlightPath || !buttonSelectPath) {
    throw new Error("Missing required paths for spu XML generation");
  }

  // Validate button coordinates - should be an array with at least one entry
  if (!Array.isArray(buttonCoordinates) || buttonCoordinates.length === 0) {
    throw new Error(
      "Button coordinates must be an array with at least one entry"
    );
  }

  // Load template file
  const templatePath = path.join(
    __dirname,
    "..",
    "templates",
    "spu-template.xml"
  );
  let template = fs.readFileSync(templatePath, "utf8");

  // Replace placeholders
  template = template.replace("{{buttonNormalPath}}", buttonNormalPath);
  template = template.replace("{{buttonHighlightPath}}", buttonHighlightPath);
  template = template.replace("{{buttonSelectPath}}", buttonSelectPath);

  // Generate button elements based on the array of coordinates
  const buttonElements = buttonCoordinates
    .map(
      (coord) =>
        `<button x0="${coord.x0}" y0="${coord.y0}" x1="${coord.x1}" y1="${coord.y1}"/>`
    )
    .join("\n");

  // Insert the button elements before the closing </spu> tag
  template = template.replace("</spu>", `${buttonElements}\n</spu>`);

  const formattedXml = xmlFormat(template, {
    indentation: "  ",
    filter: (node) => node.type !== "Comment",
    collapseContent: true,
    lineSeparator: "\n",
  });

  return formattedXml;
};

export const generateTextSubXml = ({
  subtitlePath,
  vStandard,
  movieWidth = 720,
  movieHeight,
  aspect = "16:9",
  characterSet = "UTF-8",
}) => {
  if (!subtitlePath) {
    throw new Error("Missing required subtitlePath for textsub XML generation");
  }

  const verticalRes =
    typeof movieHeight === "number" || typeof movieHeight === "string"
      ? String(movieHeight)
      : String((vStandard || "pal").toLowerCase() === "pal" ? 576 : 480);

  const movieFps = (vStandard || "pal").toLowerCase() === "pal" ? "25" : "30000/1001";

  const xml = `
<subpictures>
  <stream>
    <textsub
      filename="${subtitlePath}"
      characterset="${characterSet}"
      subtitle-fps="${movieFps}"
      movie-fps="${movieFps}"
      movie-width="${movieWidth}"
      movie-height="${verticalRes}"
      aspect="${aspect}"
    />
  </stream>
</subpictures>
`.trim();

  return xmlFormat(xml, {
    indentation: "  ",
    filter: (node) => node.type !== "Comment",
    collapseContent: true,
    lineSeparator: "\n",
  });
};
