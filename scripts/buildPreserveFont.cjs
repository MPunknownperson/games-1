// Generates the custom-designed OpenType font family for PRESERVE:
//   1. PreserveDisplay — sculpted geometric-fantasy display typeface for titles,
//      headings, tower names, and buttons.
//   2. PreserveSans    — open-aperture, high-legibility UI & body typeface with
//      generous x-height, clear counters, and tabular numerals.
//
// Uses direct Y-up font coordinates (baseline = 0, xHeight = 530, capHeight = 720,
// ascender = 750, descender = -180) and single non-overlapping outer contours +
// disjoint inner holes with verified CFF winding (outer CCW, holes CW).

const opentype = require('opentype.js');
const fs = require('fs');
const path = require('path');

function contourArea(pts) {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function addPoly(p, pts, hole = false) {
  const area = contourArea(pts);
  const ordered = (!hole && area < 0) || (hole && area > 0) ? [...pts].reverse() : pts;
  p.moveTo(ordered[0][0], ordered[0][1]);
  for (let i = 1; i < ordered.length; i++) {
    p.lineTo(ordered[i][0], ordered[i][1]);
  }
  p.close();
}

function addRect(p, x, y, w, h, chamfer = 0, hole = false) {
  const c = Math.min(chamfer, w * 0.35, h * 0.35);
  if (c <= 0) {
    addPoly(p, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], hole);
  } else {
    addPoly(p, [
      [x + c, y], [x + w - c, y],
      [x + w, y + c], [x + w, y + h - c],
      [x + w - c, y + h], [x + c, y + h],
      [x, y + h - c], [x, y + c],
    ], hole);
  }
}

function addChamferRing(p, x, y, w, h, strokeX, strokeY, bevel, hole = false) {
  addRect(p, x, y, w, h, bevel, hole);
  const innerBevel = Math.max(20, bevel - Math.min(strokeX, strokeY) * 0.55);
  addRect(p, x + strokeX, y + strokeY, w - strokeX * 2, h - strokeY * 2, innerBevel, !hole);
}

function buildGlyphSet(style) {
  const isDisp = style === 'display';
  const S = isDisp ? 114 : 96;
  const H = isDisp ? 94 : 84;
  const s = isDisp ? 100 : 88;
  const h = isDisp ? 84 : 76;
  const B = isDisp ? 135 : 155;
  const b = isDisp ? 105 : 125;
  const XH = isDisp ? 520 : 540;
  const CAP = 720;
  const ASC = 750;
  const DESC = -180;

  const glyphs = [];
  const make = (name, unicode, adv, fn) => {
    const p = new opentype.Path();
    if (fn) fn(p);
    glyphs.push(new opentype.Glyph({ name, unicode, advanceWidth: adv, path: p }));
  };

  make('.notdef', 0, 520, (p) => addChamferRing(p, 70, 0, 380, CAP, 70, 70, 40));
  make('space', 32, isDisp ? 270 : 250, null);

  // ==================== UPPERCASE A-Z ====================
  // A — clean slanted legs + crossbar + inner triangle counter
  make('A', 65, 640, (p) => {
    addPoly(p, [
      [35, 0], [155, 0], [215, 195], [425, 195], [485, 0], [605, 0],
      [385, CAP], [255, CAP],
    ]);
    addPoly(p, [
      [242, 195 + H], [320, 565], [398, 195 + H],
    ], true);
  });

  // B — single outer contour + two disjoint counters
  make('B', 66, 610, (p) => {
    addPoly(p, [
      [65, 0], [460, 0], [555, 95], [555, 305], [490, 360],
      [535, 420], [535, CAP - 95], [440, CAP], [65, CAP],
    ]);
    addPoly(p, [
      [65 + S, 405], [405, 405], [435, 440], [435, CAP - 125], [405, CAP - H], [65 + S, CAP - H],
    ], true);
    addPoly(p, [
      [65 + S, H], [415, H], [445, 125], [445, 285], [415, 320], [65 + S, 320],
    ], true);
  });

  // C
  make('C', 67, 600, (p) => {
    addPoly(p, [
      [540, 210], [430, 210], [430, 125], [395, H], [215, H], [175, 135],
      [175, CAP - 135], [215, CAP - H], [395, CAP - H], [430, CAP - 125], [430, CAP - 210],
      [540, CAP - 210], [540, CAP - 105], [440, CAP], [175, CAP], [60, CAP - 115],
      [60, 115], [175, 0], [440, 0], [540, 105],
    ]);
  });

  // D
  make('D', 68, 630, (p) => {
    addPoly(p, [
      [65, 0], [430, 0], [565, 135], [565, CAP - 135], [430, CAP], [65, CAP],
    ]);
    addPoly(p, [
      [65 + S, H], [395, H], [450, 155], [450, CAP - 155], [395, CAP - H], [65 + S, CAP - H],
    ], true);
  });

  // E
  make('E', 69, 550, (p) => {
    addPoly(p, [
      [65, 0], [495, 0], [495, H], [65 + S, H], [65 + S, 320],
      [445, 320], [445, 320 + H], [65 + S, 320 + H], [65 + S, CAP - H],
      [485, CAP - H], [485, CAP], [65, CAP],
    ]);
  });

  // F
  make('F', 70, 530, (p) => {
    addPoly(p, [
      [65, 0], [65 + S, 0], [65 + S, 315], [440, 315], [440, 315 + H],
      [65 + S, 315 + H], [65 + S, CAP - H], [480, CAP - H], [480, CAP], [65, CAP],
    ]);
  });

  // G
  make('G', 71, 630, (p) => {
    addPoly(p, [
      [560, 0], [560, 385], [320, 385], [320, 385 - H], [450, 385 - H],
      [450, H], [215, H], [175, 135], [175, CAP - 135], [215, CAP - H],
      [405, CAP - H], [445, CAP - 125], [445, CAP - 195], [555, CAP - 195],
      [555, CAP - 105], [445, CAP], [175, CAP], [60, CAP - 115], [60, 115], [175, 0],
    ]);
  });

  // H — single unified H contour
  make('H', 72, 630, (p) => {
    addPoly(p, [
      [65, 0], [65 + S, 0], [65 + S, 315], [565 - S, 315], [565 - S, 0],
      [565, 0], [565, CAP], [565 - S, CAP], [565 - S, 315 + H], [65 + S, 315 + H],
      [65 + S, CAP], [65, CAP],
    ]);
  });

  // I — single unified contour
  make('I', 73, isDisp ? 340 : 280, (p) => {
    if (isDisp) {
      const sh = 82;
      addPoly(p, [
        [55, 0], [285, 0], [285, sh], [170 + S / 2, sh], [170 + S / 2, CAP - sh],
        [285, CAP - sh], [285, CAP], [55, CAP], [55, CAP - sh], [170 - S / 2, CAP - sh],
        [170 - S / 2, sh], [55, sh],
      ]);
    } else {
      addRect(p, 140 - S / 2, 0, S, CAP);
    }
  });

  // J
  make('J', 74, 480, (p) => {
    addPoly(p, [
      [45, 210], [155, 210], [155, 125], [190, H], [275, H], [310, 125],
      [310, CAP], [310 + S, CAP], [310 + S, 110], [310, 0], [155, 0], [45, 110],
    ]);
  });

  // K — single unified contour
  make('K', 75, 600, (p) => {
    addPoly(p, [
      [65, 0], [65 + S, 0], [65 + S, 305], [420, 0], [565, 0],
      [255, 360], [555, CAP], [415, CAP], [65 + S, 415], [65 + S, CAP], [65, CAP],
    ]);
  });

  // L
  make('L', 76, 520, (p) => {
    addPoly(p, [
      [65, 0], [475, 0], [475, H], [65 + S, H], [65 + S, CAP], [65, CAP],
    ]);
  });

  // M
  make('M', 77, 740, (p) => {
    addPoly(p, [
      [60, 0], [60 + S, 0], [60 + S, 470], [315, 140], [425, 140],
      [680 - S, 470], [680 - S, 0], [680, 0], [680, CAP], [555, CAP],
      [370, 355], [185, CAP], [60, CAP],
    ]);
  });

  // N
  make('N', 78, 640, (p) => {
    addPoly(p, [
      [65, 0], [65 + S, 0], [65 + S, 465], [450, 0], [575, 0],
      [575, CAP], [575 - S, CAP], [575 - S, 255], [190, CAP], [65, CAP],
    ]);
  });

  // O
  make('O', 79, 650, (p) => {
    addChamferRing(p, 55, 0, 540, CAP, S, H, B);
  });

  // P — single outer contour + single inner counter
  make('P', 80, 590, (p) => {
    addPoly(p, [
      [65, 0], [65 + S, 0], [65 + S, 310], [440, 310], [545, 415],
      [545, CAP - 105], [440, CAP], [65, CAP],
    ]);
    addPoly(p, [
      [65 + S, 310 + H], [405, 310 + H], [435, 440], [435, CAP - 130], [405, CAP - H], [65 + S, CAP - H],
    ], true);
  });

  // Q — outer ring + tail merged cleanly, plus inner hole
  make('Q', 81, 660, (p) => {
    addPoly(p, [
      [190, 0], [430, 0], [505, -75], [615, -75], [515, 45], [595, 135],
      [595, CAP - 135], [460, CAP], [190, CAP], [55, CAP - 135], [55, 135],
    ]);
    addPoly(p, [
      [225, H], [425, H], [480, 155], [480, CAP - 155], [425, CAP - H], [225, CAP - H],
      [170, CAP - 155], [170, 155],
    ], true);
  });

  // R — single outer contour + single inner counter
  make('R', 82, 610, (p) => {
    addPoly(p, [
      [65, 0], [65 + S, 0], [65 + S, 315], [285, 315], [450, 0], [580, 0],
      [405, 320], [445, 320], [545, 420], [545, CAP - 105], [445, CAP], [65, CAP],
    ]);
    addPoly(p, [
      [65 + S, 315 + H], [405, 315 + H], [435, 440], [435, CAP - 130], [405, CAP - H], [65 + S, CAP - H],
    ], true);
  });

  // S
  make('S', 83, 570, (p) => {
    addPoly(p, [
      [50, 195], [160, 195], [160, 120], [195, H], [375, H], [410, 120],
      [410, 265], [375, 305], [165, 355], [60, 455], [60, CAP - 105],
      [165, CAP], [405, CAP], [505, CAP - 105], [505, CAP - 195],
      [395, CAP - 195], [395, CAP - 120], [365, CAP - H], [200, CAP - H],
      [170, CAP - 120], [170, 440], [205, 405], [415, 355], [520, 255],
      [520, 105], [415, 0], [155, 0], [50, 105],
    ]);
  });

  // T
  make('T', 84, 560, (p) => {
    addPoly(p, [
      [280 - S / 2, 0], [280 + S / 2, 0], [280 + S / 2, CAP - H], [525, CAP - H],
      [525, CAP], [35, CAP], [35, CAP - H], [280 - S / 2, CAP - H],
    ]);
  });

  // U
  make('U', 85, 630, (p) => {
    addPoly(p, [
      [65, 115], [65, CAP], [65 + S, CAP], [65 + S, 130], [200, H],
      [430, H], [565 - S, 130], [565 - S, CAP], [565, CAP], [565, 115],
      [450, 0], [180, 0],
    ]);
  });

  // V
  make('V', 86, 610, (p) => {
    addPoly(p, [
      [40, CAP], [160, CAP], [305, 165], [450, CAP], [570, CAP],
      [365, 0], [245, 0],
    ]);
  });

  // W
  make('W', 87, 830, (p) => {
    addPoly(p, [
      [35, CAP], [150, CAP], [250, 200], [355, CAP], [475, CAP],
      [580, 200], [680, CAP], [795, CAP], [640, 0], [520, 0],
      [415, 460], [310, 0], [190, 0],
    ]);
  });

  // X
  make('X', 88, 590, (p) => {
    addPoly(p, [
      [45, 0], [185, 0], [295, 245], [405, 0], [545, 0],
      [365, 360], [540, CAP], [400, CAP], [295, 475], [190, CAP],
      [50, CAP], [225, 360],
    ]);
  });

  // Y
  make('Y', 89, 590, (p) => {
    addPoly(p, [
      [40, CAP], [170, CAP], [295, 390], [420, CAP], [550, CAP],
      [355, 290], [355, 0], [235, 0], [235, 290],
    ]);
  });

  // Z
  make('Z', 90, 570, (p) => {
    addPoly(p, [
      [55, 0], [515, 0], [515, H], [205, H], [510, CAP - H],
      [510, CAP], [65, CAP], [65, CAP - H], [365, CAP - H], [55, H],
    ]);
  });

  // ==================== LOWERCASE a-z ====================
  // a — single outer contour + single inner bowl counter
  make('a', 97, 520, (p) => {
    addPoly(p, [
      [150, 0], [460, 0], [460, XH - 95], [365, XH], [145, XH],
      [55, XH - 90], [55, XH - 145], [160, XH - 145], [160, XH - h],
      [360, XH - h], [360, 315], [150, 315], [50, 215], [50, 95],
    ]);
    addPoly(p, [
      [155, h], [360, h], [360, 235], [185, 235], [155, 205],
    ], true);
  });

  // b — single outer contour + single inner counter
  make('b', 98, 540, (p) => {
    addPoly(p, [
      [65, 0], [385, 0], [490, 105], [490, XH - 105], [385, XH],
      [65 + s, XH], [65 + s, ASC], [65, ASC],
    ]);
    addPoly(p, [
      [65 + s, h], [350, h], [385, 125], [385, XH - 125], [350, XH - h], [65 + s, XH - h],
    ], true);
  });

  // c
  make('c', 99, 480, (p) => {
    addPoly(p, [
      [435, 175], [330, 175], [330, 110], [300, h], [190, h], [160, 115],
      [160, XH - 115], [190, XH - h], [300, XH - h], [330, XH - 110], [330, XH - 175],
      [435, XH - 175], [435, XH - 95], [345, XH], [155, XH], [50, XH - 105],
      [50, 105], [155, 0], [345, 0], [435, 95],
    ]);
  });

  // d — single outer contour + single inner counter
  make('d', 100, 540, (p) => {
    addPoly(p, [
      [155, 0], [475, 0], [475, ASC], [475 - s, ASC], [475 - s, XH],
      [155, XH], [50, XH - 105], [50, 105],
    ]);
    addPoly(p, [
      [190, h], [475 - s, h], [475 - s, XH - h], [190, XH - h], [155, XH - 125], [155, 125],
    ], true);
  });

  // e — single outer contour + single upper eye counter
  make('e', 101, 510, (p) => {
    addPoly(p, [
      [155, 0], [375, 0], [460, 90], [460, 155], [355, 155],
      [355, h], [155, h], [155, 225], [465, 225], [465, XH - 95],
      [365, XH], [155, XH], [50, XH - 105], [50, 105],
    ]);
    addPoly(p, [
      [155, 225 + h], [360, 225 + h], [360, XH - 115], [330, XH - h], [185, XH - h], [155, XH - 115],
    ], true);
  });

  // f
  make('f', 102, 360, (p) => {
    addPoly(p, [
      [95, 0], [95 + s, 0], [95 + s, XH - h], [315, XH - h], [315, XH],
      [95 + s, XH], [95 + s, ASC - h - 25], [225, ASC - h], [330, ASC - h],
      [330, ASC], [195, ASC], [95, ASC - 95], [95, XH], [25, XH], [25, XH - h], [95, XH - h],
    ]);
  });

  // g
  make('g', 103, 540, (p) => {
    addPoly(p, [
      [65, DESC + 75], [165, DESC + 75], [195, DESC + h], [340, DESC + h], [375, DESC + 110],
      [375, 10], [155, 10], [50, 115], [50, XH - 105], [155, XH], [475, XH],
      [475, DESC + 95], [380, DESC], [155, DESC], [65, DESC + 45],
    ]);
    addPoly(p, [
      [190, h + 10], [375, h + 10], [375, XH - h], [190, XH - h], [155, XH - 120], [155, 120],
    ], true);
  });

  // h
  make('h', 104, 540, (p) => {
    addPoly(p, [
      [65, 0], [65 + s, 0], [65 + s, XH - h - 10], [340, XH - h - 10], [375, XH - 125],
      [375, 0], [475, 0], [475, XH - 95], [380, XH], [65 + s, XH], [65 + s, ASC], [65, ASC],
    ]);
  });

  // i
  make('i', 105, 250, (p) => {
    const cx = 125;
    addRect(p, cx - s / 2, 0, s, XH);
    addRect(p, cx - s / 2, XH + 75, s, s * 1.05, isDisp ? 16 : 0);
  });

  // j
  make('j', 106, 290, (p) => {
    addPoly(p, [
      [15, DESC + 85], [115, DESC + 85], [140, DESC + h], [160, DESC + 105],
      [160, XH], [160 + s, XH], [160 + s, DESC + 90], [170, DESC], [45, DESC], [15, DESC + 40],
    ]);
    addRect(p, 160, XH + 75, s, s * 1.05, isDisp ? 16 : 0);
  });

  // k — single unified contour
  make('k', 107, 500, (p) => {
    addPoly(p, [
      [65, 0], [65 + s, 0], [65 + s, 215], [345, 0], [475, 0],
      [230, 265], [465, XH], [340, XH], [65 + s, 305], [65 + s, ASC], [65, ASC],
    ]);
  });

  // l
  make('l', 108, 250, (p) => {
    addRect(p, 125 - s / 2, 0, s, ASC);
  });

  // m
  make('m', 109, 790, (p) => {
    addPoly(p, [
      [60, 0], [60 + s, 0], [60 + s, XH - h - 10], [315, XH - h - 10], [345, XH - 120],
      [345, 0], [345 + s, 0], [345 + s, XH - h - 10], [600, XH - h - 10], [630, XH - 120],
      [630, 0], [730, 0], [730, XH - 95], [640, XH], [390, XH], [360, XH - 45],
      [330, XH], [60, XH],
    ]);
  });

  // n
  make('n', 110, 540, (p) => {
    addPoly(p, [
      [65, 0], [65 + s, 0], [65 + s, XH - h - 10], [340, XH - h - 10], [375, XH - 125],
      [375, 0], [475, 0], [475, XH - 95], [380, XH], [65, XH],
    ]);
  });

  // o
  make('o', 111, 530, (p) => {
    addChamferRing(p, 50, 0, 430, XH, s, h, b);
  });

  // p — single outer contour + single inner counter
  make('p', 112, 540, (p) => {
    addPoly(p, [
      [65, DESC], [65 + s, DESC], [65 + s, 0], [385, 0], [490, 105],
      [490, XH - 105], [385, XH], [65, XH],
    ]);
    addPoly(p, [
      [65 + s, h], [350, h], [385, 125], [385, XH - 125], [350, XH - h], [65 + s, XH - h],
    ], true);
  });

  // q — single outer contour + single inner counter
  make('q', 113, 540, (p) => {
    addPoly(p, [
      [155, 0], [475 - s, 0], [475 - s, DESC], [475, DESC], [475, XH],
      [155, XH], [50, XH - 105], [50, 105],
    ]);
    addPoly(p, [
      [190, h], [475 - s, h], [475 - s, XH - h], [190, XH - h], [155, XH - 125], [155, 125],
    ], true);
  });

  // r
  make('r', 114, 390, (p) => {
    addPoly(p, [
      [65, 0], [65 + s, 0], [65 + s, XH - h - 10], [355, XH - h - 10], [355, XH], [65, XH],
    ]);
  });

  // s
  make('s', 115, 470, (p) => {
    addPoly(p, [
      [45, 155], [145, 155], [145, 100], [175, h], [315, h], [345, 100],
      [345, 190], [315, 220], [140, 260], [50, 345], [50, XH - 90],
      [140, XH], [335, XH], [425, XH - 90], [425, XH - 155],
      [325, XH - 155], [325, XH - 100], [295, XH - h], [175, XH - h],
      [150, XH - 100], [150, 330], [180, 305], [355, 265], [440, 185],
      [440, 90], [350, 0], [135, 0], [45, 90],
    ]);
  });

  // t
  make('t', 116, 370, (p) => {
    addPoly(p, [
      [105, 95], [105, XH - h], [30, XH - h], [30, XH], [105, XH],
      [105, ASC - 30], [105 + s, ASC - 30], [105 + s, XH], [320, XH],
      [320, XH - h], [105 + s, XH - h], [105 + s, 110], [235, h],
      [325, h], [325, 0], [195, 0],
    ]);
  });

  // u
  make('u', 117, 540, (p) => {
    addPoly(p, [
      [65, 95], [65, XH], [65 + s, XH], [65 + s, 115], [195, h],
      [375, h], [375, XH], [475, XH], [475, 0], [160, 0],
    ]);
  });

  // v
  make('v', 118, 510, (p) => {
    addPoly(p, [
      [35, XH], [145, XH], [255, 130], [365, XH], [475, XH], [310, 0], [200, 0],
    ]);
  });

  // w
  make('w', 119, 730, (p) => {
    addPoly(p, [
      [35, XH], [140, XH], [220, 160], [310, XH], [420, XH],
      [510, 160], [590, XH], [695, XH], [565, 0], [455, 0],
      [365, 355], [275, 0], [165, 0],
    ]);
  });

  // x
  make('x', 120, 490, (p) => {
    addPoly(p, [
      [40, 0], [165, 0], [245, 175], [325, 0], [450, 0],
      [305, XH / 2], [445, XH], [320, XH], [245, XH - 175],
      [170, XH], [45, XH], [185, XH / 2],
    ]);
  });

  // y
  make('y', 121, 510, (p) => {
    addPoly(p, [
      [35, XH], [145, XH], [260, 145], [365, XH], [475, XH],
      [275, DESC], [165, DESC], [210, 15],
    ]);
  });

  // z
  make('z', 122, 460, (p) => {
    addPoly(p, [
      [45, 0], [415, 0], [415, h], [180, h], [410, XH - h],
      [410, XH], [55, XH], [55, XH - h], [280, XH - h], [45, h],
    ]);
  });

  // ==================== DIGITS 0-9 (Tabular 560 width) ====================
  const DW = 560;
  make('zero', 48, DW, (p) => {
    addChamferRing(p, 55, 0, 450, CAP, S, H, B);
    addRect(p, 245, 315, 70, 90);
  });
  make('one', 49, DW, (p) => {
    addPoly(p, [
      [135, 0], [435, 0], [435, H], [340, H], [340, CAP],
      [220, CAP], [115, CAP - 115], [185, CAP - 185], [230, CAP - 140],
      [230, H], [135, H],
    ]);
  });
  make('two', 50, DW, (p) => {
    addPoly(p, [
      [60, 0], [500, 0], [500, H], [210, H], [485, 355],
      [485, CAP - 105], [385, CAP], [165, CAP], [65, CAP - 105],
      [65, CAP - 210], [175, CAP - 210], [175, CAP - 125], [205, CAP - H],
      [345, CAP - H], [375, CAP - 125], [375, 385], [60, 105],
    ]);
  });
  make('three', 51, DW, (p) => {
    addPoly(p, [
      [65, 195], [175, 195], [175, 120], [205, H], [355, H], [385, 120],
      [385, 290], [355, 320], [215, 320], [215, 320 + H], [350, 320 + H],
      [380, 445], [380, CAP - 120], [350, CAP - H], [205, CAP - H],
      [175, CAP - 120], [175, CAP - 190], [65, CAP - 190], [65, CAP - 100],
      [165, CAP], [390, CAP], [490, CAP - 100], [490, 430], [435, 365],
      [495, 295], [495, 105], [395, 0], [165, 0], [65, 105],
    ]);
  });
  make('four', 52, DW, (p) => {
    addPoly(p, [
      [330, 0], [440, 0], [440, 185], [510, 185], [510, 185 + H],
      [440, 185 + H], [440, CAP], [320, CAP], [50, 275], [50, 185],
      [330, 185],
    ]);
    addPoly(p, [
      [175, 275], [330, 275], [330, 520],
    ], true);
  });
  make('five', 53, DW, (p) => {
    addPoly(p, [
      [65, 195], [175, 195], [175, 120], [205, H], [355, H], [385, 120],
      [385, 315], [355, 345], [75, 345], [75, CAP], [475, CAP],
      [475, CAP - H], [185, CAP - H], [185, 435], [395, 435], [495, 335],
      [495, 105], [395, 0], [165, 0], [65, 105],
    ]);
  });
  make('six', 54, DW, (p) => {
    addPoly(p, [
      [165, 0], [395, 0], [495, 105], [495, 335], [395, 435], [175, 435],
      [175, CAP - 125], [205, CAP - H], [355, CAP - H], [385, CAP - 125],
      [385, CAP - 180], [490, CAP - 180], [490, CAP - 105], [390, CAP],
      [165, CAP], [65, CAP - 105], [65, 105],
    ]);
    addPoly(p, [
      [175, H], [355, H], [385, 125], [385, 315], [355, 345], [175, 345],
    ], true);
  });
  make('seven', 55, DW, (p) => {
    addPoly(p, [
      [145, 0], [265, 0], [490, CAP - H], [490, CAP], [65, CAP],
      [65, CAP - H], [365, CAP - H],
    ]);
  });
  make('eight', 56, DW, (p) => {
    addPoly(p, [
      [165, 0], [395, 0], [495, 100], [495, 295], [435, 360],
      [490, 425], [490, CAP - 100], [390, CAP], [170, CAP], [70, CAP - 100],
      [70, 425], [125, 360], [65, 295], [65, 100],
    ]);
    addPoly(p, [
      [180, H], [380, H], [385, 285], [355, 315], [205, 315], [175, 285],
    ], true);
    addPoly(p, [
      [180, 405], [380, 405], [380, CAP - H], [180, CAP - H],
    ], true);
  });
  make('nine', 57, DW, (p) => {
    addPoly(p, [
      [165, 0], [395, 0], [495, 105], [495, CAP - 105], [395, CAP],
      [165, CAP], [65, CAP - 105], [65, 385], [165, 285], [385, 285],
      [385, 125], [355, H], [205, H], [175, 125], [175, 180], [70, 180],
      [70, 105],
    ]);
    addPoly(p, [
      [175, 375], [385, 375], [385, CAP - H], [175, CAP - H],
    ], true);
  });

  // ==================== PUNCTUATION & SYMBOLS ====================
  make('period', 46, 220, (p) => addRect(p, 55, 0, 110, 110, isDisp ? 20 : 0));
  make('comma', 44, 220, (p) => addPoly(p, [[55, -100], [135, -100], [165, 0], [165, 110], [55, 110], [55, 0], [95, 0]]));
  make('colon', 58, 220, (p) => {
    addRect(p, 55, 20, 110, 110, isDisp ? 20 : 0);
    addRect(p, 55, 340, 110, 110, isDisp ? 20 : 0);
  });
  make('semicolon', 59, 220, (p) => {
    addPoly(p, [[55, -100], [135, -100], [165, 0], [165, 110], [55, 110], [55, 0], [95, 0]]);
    addRect(p, 55, 340, 110, 110, isDisp ? 20 : 0);
  });
  make('exclam', 33, 250, (p) => {
    addRect(p, 70, 0, 110, 110, isDisp ? 20 : 0);
    addPoly(p, [[75, 210], [175, 210], [190, CAP], [60, CAP]]);
  });
  make('question', 63, 490, (p) => {
    addRect(p, 185, 0, 110, 110, isDisp ? 20 : 0);
    addPoly(p, [
      [185, 210], [295, 210], [295, 335], [435, 445], [435, CAP - 100],
      [340, CAP], [150, CAP], [55, CAP - 100], [55, CAP - 190], [165, CAP - 190],
      [165, CAP - 120], [195, CAP - H], [305, CAP - H], [330, CAP - 120],
      [330, 470], [185, 360],
    ]);
  });
  make('hyphen', 45, 350, (p) => addRect(p, 45, 265, 260, H));
  make('endash', 8211, 460, (p) => addRect(p, 45, 265, 370, H));
  make('emdash', 8212, 640, (p) => addRect(p, 45, 265, 550, H));
  make('plus', 43, 490, (p) => {
    addPoly(p, [
      [195, 120], [295, 120], [295, 275], [450, 275], [450, 275 + H],
      [295, 275 + H], [295, 530], [195, 530], [195, 275 + H], [40, 275 + H],
      [40, 275], [195, 275],
    ]);
  });
  make('slash', 47, 420, (p) => addPoly(p, [[40, -60], [150, -60], [380, CAP], [270, CAP]]));
  make('percent', 37, 720, (p) => {
    addPoly(p, [[135, 0], [235, 0], [585, CAP], [485, CAP]]);
    addChamferRing(p, 65, CAP - 270, 230, 270, 65, 65, 45);
    addChamferRing(p, 425, 0, 230, 270, 65, 65, 45);
  });
  make('parenleft', 40, 310, (p) => addPoly(p, [
    [165, -110], [255, -110], [175, 120], [175, CAP - 120], [255, CAP + 90],
    [165, CAP + 90], [65, CAP - 120], [65, 120],
  ]));
  make('parenright', 41, 310, (p) => addPoly(p, [
    [55, -110], [145, -110], [245, 120], [245, CAP - 120], [145, CAP + 90],
    [55, CAP + 90], [135, CAP - 120], [135, 120],
  ]));
  make('bracketleft', 91, 320, (p) => addPoly(p, [
    [80, -110], [250, -110], [250, -25], [175, -25], [175, CAP],
    [250, CAP], [250, CAP + 85], [80, CAP + 85],
  ]));
  make('bracketright', 93, 320, (p) => addPoly(p, [
    [70, -110], [240, -110], [240, CAP + 85], [70, CAP + 85], [70, CAP],
    [145, CAP], [145, -25], [70, -25],
  ]));
  make('quotesingle', 39, 190, (p) => addPoly(p, [[55, 480], [135, 480], [145, CAP], [45, CAP]]));
  make('quotedbl', 34, 340, (p) => {
    addPoly(p, [[45, 480], [125, 480], [135, CAP], [35, CAP]]);
    addPoly(p, [[205, 480], [285, 480], [295, CAP], [195, CAP]]);
  });
  make('periodcentered', 183, 250, (p) => addRect(p, 70, 290, 110, 110, isDisp ? 20 : 0));
  make('multiply', 215, 480, (p) => addPoly(p, [
    [75, 130], [165, 130], [240, 235], [315, 130], [405, 130],
    [290, 295], [400, 460], [310, 460], [240, 355], [170, 460],
    [80, 460], [190, 295],
  ]));
  make('equal', 61, 490, (p) => {
    addRect(p, 55, 200, 380, H);
    addRect(p, 55, 390, 380, H);
  });
  make('numbersign', 35, 560, (p) => {
    addPoly(p, [
      [145, 40], [230, 40], [230, 210], [330, 210], [330, 40], [415, 40],
      [415, 210], [510, 210], [510, 290], [415, 290], [415, 430], [510, 430],
      [510, 510], [415, 510], [415, 680], [330, 680], [330, 510], [230, 510],
      [230, 680], [145, 680], [145, 510], [50, 510], [50, 430], [145, 430],
      [145, 290], [50, 290], [50, 210], [145, 210],
    ]);
    addRect(p, 230, 290, 100, 140, 0, true);
  });
  make('ampersand', 38, 600, (p) => {
    addPoly(p, [
      [165, 0], [420, 0], [545, 135], [465, 200], [375, H], [205, H],
      [165, 120], [165, 275], [205, 315], [340, 315], [415, 390],
      [415, CAP - 100], [320, CAP], [155, CAP], [60, CAP - 100],
      [60, 415], [115, 360], [60, 295], [60, 105],
    ]);
    addPoly(p, [
      [170, 410], [310, 410], [310, CAP - H], [170, CAP - H],
    ], true);
  });
  make('copyright', 169, 650, (p) => {
    addChamferRing(p, 55, 40, 540, 640, 65, 65, 180);
    addPoly(p, [
      [430, 240], [355, 240], [355, 195], [250, 195], [220, 225],
      [220, 495], [250, 525], [355, 525], [355, 480], [430, 480],
      [430, 540], [375, 595], [225, 595], [150, 520], [150, 200],
      [225, 125], [375, 125], [430, 180],
    ]);
  });

  return glyphs;
}

const displayFont = new opentype.Font({
  familyName: 'PreserveDisplay',
  styleName: 'Bold',
  unitsPerEm: 1000,
  ascender: 750,
  descender: -180,
  glyphs: buildGlyphSet('display'),
});

const sansFont = new opentype.Font({
  familyName: 'PreserveSans',
  styleName: 'SemiBold',
  unitsPerEm: 1000,
  ascender: 750,
  descender: -180,
  glyphs: buildGlyphSet('sans'),
});

// Attach kerning pairs so capital-to-lowercase and diagonal pairs space naturally
function applyKerning(font) {
  if (!font.kerningPairs) font.kerningPairs = {};
  const pairs = [
    ['A', 'T', -55], ['A', 'V', -65], ['A', 'W', -55], ['A', 'Y', -70], ['A', 'v', -35], ['A', 'w', -30], ['A', 'y', -35],
    ['F', 'A', -50], ['F', 'a', -25], ['F', 'e', -25], ['F', 'o', -25],
    ['L', 'T', -55], ['L', 'V', -65], ['L', 'W', -55], ['L', 'Y', -70],
    ['P', 'A', -55], ['P', 'a', -20], ['P', 'e', -20], ['P', 'o', -20], ['P', '.', -60], ['P', ',', -60],
    ['R', 'T', -25], ['R', 'V', -30], ['R', 'Y', -35],
    ['T', 'A', -55], ['T', 'O', -25], ['T', 'a', -45], ['T', 'e', -45], ['T', 'o', -45], ['T', 'r', -35], ['T', 's', -35], ['T', '.', -60], ['T', ',', -60],
    ['V', 'A', -65], ['V', 'O', -25], ['V', 'a', -45], ['V', 'e', -45], ['V', 'o', -45], ['V', '.', -65], ['V', ',', -65],
    ['W', 'A', -55], ['W', 'O', -20], ['W', 'a', -35], ['W', 'e', -35], ['W', 'o', -35], ['W', '.', -55], ['W', ',', -55],
    ['Y', 'A', -70], ['Y', 'O', -30], ['Y', 'a', -55], ['Y', 'e', -55], ['Y', 'o', -55], ['Y', '.', -70], ['Y', ',', -70],
    ['f', '.', -35], ['f', ',', -35], ['r', '.', -40], ['r', ',', -40], ['v', '.', -45], ['v', ',', -45], ['w', '.', -35], ['w', ',', -35], ['y', '.', -45], ['y', ',', -45],
  ];
  for (const [l, r, val] of pairs) {
    const gl = font.charToGlyphIndex(l);
    const gr = font.charToGlyphIndex(r);
    if (gl > 0 && gr > 0) {
      font.kerningPairs[`${gl},${gr}`] = val;
    }
  }
}

applyKerning(displayFont);
applyKerning(sansFont);

// Verify every glyph's contours: non-empty bounds, valid winding, no self-intersection
function segIntersect(a, b, c, d) {
  const ccw = (p1, p2, p3) => (p3[1] - p1[1]) * (p2[0] - p1[0]) > (p2[1] - p1[1]) * (p3[0] - p1[0]);
  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
}

for (const [label, font] of [['PreserveDisplay', displayFont], ['PreserveSans', sansFont]]) {
  for (let i = 0; i < font.glyphs.length; i++) {
    const g = font.glyphs.get(i);
    if (g.name === 'space') continue;
    const bb = g.getBoundingBox();
    if (!(bb.y2 > bb.y1 && bb.x2 > bb.x1)) {
      throw new Error(`${label} "${g.name}" invalid bbox: ${JSON.stringify(bb)}`);
    }
    // Extract contours from g.path
    const contours = [];
    let cur = [];
    for (const cmd of g.path.commands) {
      if (cmd.type === 'M') { cur = [[cmd.x, cmd.y]]; }
      else if (cmd.type === 'L') { cur.push([cmd.x, cmd.y]); }
      else if (cmd.type === 'Z') { contours.push(cur); cur = []; }
    }
    if (contours.length === 0) throw new Error(`${label} "${g.name}" has 0 closed contours`);
    if (contourArea(contours[0]) <= 0) throw new Error(`${label} "${g.name}" outer contour is not CCW`);
    for (let ci = 1; ci < contours.length; ci++) {
      if (contourArea(contours[ci]) >= 0 && g.name !== 'zero' && g.name !== 'percent' && g.name !== 'colon' && g.name !== 'semicolon' && g.name !== 'quotedbl' && g.name !== 'equal' && g.name !== 'i' && g.name !== 'j' && g.name !== 'exclam' && g.name !== 'question' && g.name !== 'copyright') {
        throw new Error(`${label} "${g.name}" hole ${ci} is not CW`);
      }
    }
    for (const pts of contours) {
      for (let e1 = 0; e1 < pts.length; e1++) {
        const a = pts[e1], b = pts[(e1 + 1) % pts.length];
        for (let e2 = e1 + 2; e2 < pts.length; e2++) {
          if (e1 === 0 && e2 === pts.length - 1) continue;
          const c = pts[e2], d = pts[(e2 + 1) % pts.length];
          if (segIntersect(a, b, c, d)) {
            throw new Error(`${label} "${g.name}" self-intersects between edge ${e1} and ${e2}`);
          }
        }
      }
    }
  }
  console.log(`All ${font.glyphs.length} glyphs in ${label} passed winding + self-intersection + bbox checks!`);
}

function printPreview(font, ch) {
  const g = font.charToGlyph(ch);
  const p = g.getPath(0, 32, 36);
  const segs = [];
  let sx = 0, sy = 0, cx = 0, cy = 0, open = false;
  for (const c of p.commands) {
    if (c.type === 'M') {
      if (open) segs.push([cx, cy, sx, sy]);
      sx = cx = c.x; sy = cy = c.y; open = true;
    } else if (c.type === 'L') {
      segs.push([cx, cy, c.x, c.y]);
      cx = c.x; cy = c.y;
    } else if (c.type === 'Z') {
      if (open) segs.push([cx, cy, sx, sy]);
      open = false;
    }
  }
  if (open) segs.push([cx, cy, sx, sy]);

  let out = `[${ch}]\n`;
  for (let y = 4; y < 38; y += 2) {
    let row = '';
    for (let x = 0; x < 24; x++) {
      let inside = 0;
      for (const [x1, y1, x2, y2] of segs) {
        if ((y1 > y) !== (y2 > y) && x < x1 + (y - y1) * (x2 - x1) / (y2 - y1)) inside ^= 1;
      }
      row += inside ? '#' : '.';
    }
    out += row + '\n';
  }
  process.stdout.write(out);
}
for (const c of ['A', 'B', 'K', 'P', 'R', 'a', 'e', 'k']) printPreview(displayFont, c);

const dispB64 = Buffer.from(displayFont.toArrayBuffer()).toString('base64');
const sansB64 = Buffer.from(sansFont.toArrayBuffer()).toString('base64');

const outDir = path.resolve(__dirname, '../src/ui/typeface');
fs.mkdirSync(outDir, { recursive: true });

const tsContent = `// Auto-generated custom OpenType fonts for PRESERVE EVERYTHING.
// Built with direct Y-up font coordinates and single non-overlapping contours.
//   - PreserveDisplay: sculpted geometric-fantasy display typeface
//   - PreserveSans:    open-aperture, high-legibility UI & body typeface

export const PRESERVE_DISPLAY_FAMILY = 'PreserveDisplay';
export const PRESERVE_SANS_FAMILY = 'PreserveSans';

export const PRESERVE_DISPLAY_BASE64 = '${dispB64}';
export const PRESERVE_SANS_BASE64 = '${sansB64}';

export const PRESERVE_FONT_CSS = \`
@font-face {
  font-family: '\${PRESERVE_DISPLAY_FAMILY}';
  src: url('data:font/opentype;charset=utf-8;base64,\${PRESERVE_DISPLAY_BASE64}') format('opentype');
  font-weight: 400 900;
  font-style: normal;
  font-display: block;
}
@font-face {
  font-family: '\${PRESERVE_SANS_FAMILY}';
  src: url('data:font/opentype;charset=utf-8;base64,\${PRESERVE_SANS_BASE64}') format('opentype');
  font-weight: 400 900;
  font-style: normal;
  font-display: block;
}
\`;
`;

fs.writeFileSync(path.join(outDir, 'preserveFontData.ts'), tsContent, 'utf8');
console.log(`Generated PreserveDisplay (${dispB64.length} b64) & PreserveSans (${sansB64.length} b64)`);
