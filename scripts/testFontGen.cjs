const opentype = require("opentype.js");
const fs = require("fs");

// Units per em = 1000. Cap height = 720, Baseline = 0, Descender = -200, x-height = 500.
function createGlyph(name, unicode, width, pathData) {
  const p = opentype.Path.fromSVG(pathData);
  return new opentype.Glyph({
    name,
    unicode,
    advanceWidth: width,
    path: p
  });
}

// Test a few glyphs
const notdef = new opentype.Glyph({
  name: ".notdef",
  unicode: 0,
  advanceWidth: 500,
  path: opentype.Path.fromSVG("M 80 0 L 80 720 L 420 720 L 420 0 Z M 120 40 L 380 40 L 380 680 L 120 680 Z")
});
const space = new opentype.Glyph({
  name: "space",
  unicode: 32,
  advanceWidth: 260,
  path: new opentype.Path()
});

console.log("Notdef commands:", notdef.path.commands.length);
