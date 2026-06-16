#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";

const DEFAULTS = {
  keymap: "config/cool642tb-mini.keymap",
  layout: "config/cool642tb-mini.json",
  layoutName: "default_layout",
  out: "docs/keymap.svg",
  title: "cool642tb-mini",
};

const MODS = {
  LC: "Ctrl",
  RC: "RCtrl",
  LS: "Shift",
  RS: "RShift",
  LA: "Alt",
  RA: "RAlt",
  LG: "Cmd",
  RG: "RCmd",
};

const KEY_LABELS = {
  N0: "0",
  N1: "1",
  N2: "2",
  N3: "3",
  N4: "4",
  N5: "5",
  N6: "6",
  N7: "7",
  N8: "8",
  N9: "9",
  SEMICOLON: ";",
  COMMA: ",",
  DOT: ".",
  SLASH: "/",
  SQT: "'",
  DQT: "\"",
  UNDER: "_",
  PLUS: "+",
  CARET: "^",
  AMPERSAND: "&",
  ASTRK: "*",
  LBKT: "[",
  RBKT: "]",
  LBRC: "{",
  RBRC: "}",
  LPAR: "(",
  RPAR: ")",
  LT: "<",
  GT: ">",
  PIPE: "|",
  BACKSLASH: "\\",
  MINUS: "-",
  EXCL: "!",
  AT: "@",
  POUND: "#",
  DLLR: "$",
  PRCNT: "%",
  SPACE: "Space",
  TAB: "Tab",
  ESC: "Esc",
  ENTER: "Enter",
  BACKSPACE: "Bksp",
  DELETE: "Del",
  HOME: "Home",
  END: "End",
  PAGE_UP: "PgUp",
  PAGE_DOWN: "PgDn",
  LEFT: "Left",
  RIGHT: "Right",
  UP: "Up",
  DOWN: "Down",
  UP_ARROW: "Up",
  DOWN_ARROW: "Down",
  PRINTSCREEN: "Print",
  C_MUTE: "Mute",
  LANG1: "Lang1",
  LANG2: "Lang2",
  LEFT_CONTROL: "Ctrl",
  RIGHT_CONTROL: "RCtrl",
  LEFT_ALT: "Alt",
  RIGHT_ALT: "RAlt",
  LEFT_WIN: "Win",
  RIGHT_WIN: "RWin",
  LEFT_COMMAND: "Cmd",
  RIGHT_COMMAND: "RCmd",
  LSHIFT: "Shift",
  RSHIFT: "RShift",
  LEFT_SHIFT: "Shift",
  RIGHT_SHIFT: "RShift",
};

const MOUSE_LABELS = {
  MB1: "M1",
  MB2: "M2",
  MB3: "M3",
  SCRL_UP: "Scroll Up",
  SCRL_DOWN: "Scroll Dn",
  SCRL_LEFT: "Scroll Lt",
  SCRL_RIGHT: "Scroll Rt",
};

function usage() {
  return `Usage:
  node tools/render-keymap.mjs [options]

Options:
  --keymap <path>       ZMK keymap file. Default: ${DEFAULTS.keymap}
  --layout <path>       QMK info.json-like layout file. Default: ${DEFAULTS.layout}
  --layout-name <name>  Layout name inside the layout file. Default: ${DEFAULTS.layoutName}
  --out <path>          SVG output path, or "-" for stdout. Default: ${DEFAULTS.out}
  --format <svg|png>    Output format. Inferred from --out when omitted.
  --png-engine <name>   PNG renderer: auto, rsvg, inkscape, magick, convert, bitmap. Default: auto.
  --layers <names>      Comma-separated layer names to render.
  --title <text>        SVG title. Default: ${DEFAULTS.title}
  --help                Show this help.
`;
}

function parseArgs(argv) {
  const args = { ...DEFAULTS, layers: null, format: null, pngEngine: "auto", outProvided: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const readValue = () => {
      i += 1;
      if (i >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[i];
    };

    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--keymap") {
      args.keymap = readValue();
    } else if (arg === "--layout") {
      args.layout = readValue();
    } else if (arg === "--layout-name") {
      args.layoutName = readValue();
    } else if (arg === "--out") {
      args.out = readValue();
      args.outProvided = true;
    } else if (arg === "--format") {
      args.format = readValue();
    } else if (arg === "--png-engine") {
      args.pngEngine = readValue();
    } else if (arg === "--layers") {
      args.layers = readValue()
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
    } else if (arg === "--title") {
      args.title = readValue();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

function findMatching(source, openIndex, openChar = "{", closeChar = "}") {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    if (source[i] === openChar) {
      depth += 1;
    } else if (source[i] === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  throw new Error(`Could not find matching ${closeChar}`);
}

function findNamedBlock(source, name) {
  const regex = new RegExp(`\\b${escapeRegExp(name)}\\s*\\{`, "m");
  const match = regex.exec(source);
  if (!match) {
    return null;
  }
  const openIndex = source.indexOf("{", match.index);
  const closeIndex = findMatching(source, openIndex);
  return source.slice(openIndex + 1, closeIndex);
}

function parseChildBlocks(body) {
  const blocks = [];
  let i = 0;

  while (i < body.length) {
    while (i < body.length && /[\s;]/.test(body[i])) {
      i += 1;
    }
    if (i >= body.length) {
      break;
    }

    const nameMatch = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(body.slice(i));
    if (!nameMatch) {
      i += 1;
      continue;
    }

    const name = nameMatch[0];
    i += name.length;

    while (i < body.length && /\s/.test(body[i])) {
      i += 1;
    }

    if (body[i] === "{") {
      const closeIndex = findMatching(body, i);
      blocks.push({ name, body: body.slice(i + 1, closeIndex) });
      i = closeIndex + 1;
    } else {
      const nextSemi = body.indexOf(";", i);
      i = nextSemi === -1 ? body.length : nextSemi + 1;
    }
  }

  return blocks;
}

function extractAngleProperty(body, propName) {
  const regex = new RegExp(`\\b${escapeRegExp(propName)}\\s*=\\s*<([\\s\\S]*?)>\\s*;`, "m");
  const match = regex.exec(body);
  return match ? match[1] : null;
}

function tokenizeBindings(bindingText) {
  const tokens = bindingText
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const bindings = [];
  let current = [];

  for (const token of tokens) {
    if (token.startsWith("&")) {
      if (current.length > 0) {
        bindings.push(current);
      }
      current = [token];
    } else if (current.length > 0) {
      current.push(token);
    }
  }

  if (current.length > 0) {
    bindings.push(current);
  }

  return bindings;
}

function parseDefines(source) {
  const defines = new Map();
  for (const match of source.matchAll(/^\s*#define\s+([A-Za-z_][A-Za-z0-9_]*)\s+([0-9]+)\s*$/gm)) {
    defines.set(match[1], Number.parseInt(match[2], 10));
  }
  return defines;
}

function parseKeymap(source) {
  const clean = stripComments(source);
  const keymapBody = findNamedBlock(clean, "keymap");
  if (!keymapBody) {
    throw new Error("Could not find keymap block");
  }

  const rawLayers = parseChildBlocks(keymapBody)
    .map((block, index) => {
      const bindings = extractAngleProperty(block.body, "bindings");
      if (!bindings) {
        return null;
      }
      return {
        rawName: block.name,
        name: displayLayerName(index),
        bindingTokens: tokenizeBindings(bindings),
      };
    })
    .filter(Boolean);

  const defines = parseDefines(source);
  const layerAlias = new Map();
  rawLayers.forEach((layer, index) => {
    layerAlias.set(String(index), layer.name);
  });
  for (const [name, index] of defines.entries()) {
    if (rawLayers[index]) {
      layerAlias.set(name, rawLayers[index].name);
    }
  }

  const layers = rawLayers.map((layer) => ({
    ...layer,
    keys: layer.bindingTokens.map((tokens) => formatBinding(tokens, layerAlias)),
  }));

  return {
    layers,
    combos: parseCombos(clean, layerAlias),
  };
}

function parseCombos(source, layerAlias) {
  const combosBody = findNamedBlock(source, "combos");
  if (!combosBody) {
    return [];
  }

  return parseChildBlocks(combosBody)
    .map((block) => {
      const bindingText = extractAngleProperty(block.body, "bindings");
      const positionsText = extractAngleProperty(block.body, "key-positions");
      if (!bindingText || !positionsText) {
        return null;
      }

      const bindingTokens = tokenizeBindings(bindingText)[0];
      const positions = positionsText
        .trim()
        .split(/\s+/)
        .map((pos) => Number.parseInt(pos, 10))
        .filter((pos) => Number.isInteger(pos));

      return {
        name: block.name,
        key: formatBinding(bindingTokens, layerAlias).tap,
        positions,
      };
    })
    .filter(Boolean);
}

function formatBinding(tokens, layerAlias) {
  const behavior = tokens[0]?.replace(/^&/, "");
  const args = tokens.slice(1);

  if (!behavior || behavior === "none") {
    return { tap: "", hold: "", type: "none" };
  }

  if (behavior === "trans") {
    return { tap: "", hold: "", type: "trans" };
  }

  if (behavior === "kp") {
    return { tap: formatKey(args[0]), hold: "", type: "" };
  }

  if (behavior === "mt") {
    return {
      tap: formatKey(args.at(-1)),
      hold: formatKey(args.slice(0, -1).join("+")),
      type: "mod-tap",
    };
  }

  if (behavior === "lt") {
    return {
      tap: formatKey(args[1]),
      hold: formatLayer(args[0], layerAlias),
      type: "layer-tap",
    };
  }

  if (behavior === "mo") {
    return {
      tap: formatLayer(args[0], layerAlias),
      hold: "MO",
      type: "layer",
    };
  }

  if (behavior === "to" || behavior === "tog") {
    return {
      tap: `${behavior.toUpperCase()} ${formatLayer(args[0], layerAlias)}`,
      hold: "",
      type: "layer",
    };
  }

  if (behavior === "bt") {
    return { tap: formatBluetooth(args), hold: "", type: "system" };
  }

  if (behavior === "mkp" || behavior === "msc") {
    return { tap: formatMouse(args[0]), hold: "", type: "mouse" };
  }

  return {
    tap: [behavior, ...args].filter(Boolean).join(" "),
    hold: "",
    type: "unknown",
  };
}

function displayLayerName(index) {
  return `layer${index}`;
}

function formatLayer(value, layerAlias) {
  if (!value) {
    return "";
  }
  return layerAlias.get(value) ?? value.replace(/^L_/, "").replace(/_/g, " ");
}

function formatBluetooth(args) {
  if (args[0] === "BT_SEL") {
    return `BT ${args[1] ?? ""}`.trim();
  }
  if (args[0] === "BT_CLR") {
    return "BT CLR";
  }
  return ["BT", ...args].join(" ");
}

function formatMouse(value) {
  return MOUSE_LABELS[value] ?? value ?? "";
}

function formatKey(raw) {
  if (!raw) {
    return "";
  }

  const value = raw.trim();
  const modCall = parseModCall(value);
  if (modCall && MODS[modCall.mod]) {
    return `${MODS[modCall.mod]}+${formatKey(modCall.inner)}`;
  }

  if (value.includes("+")) {
    return value
      .split("+")
      .map((part) => formatKey(part))
      .join("+");
  }

  if (/^F[0-9]{1,2}$/.test(value)) {
    return value;
  }

  return KEY_LABELS[value] ?? value;
}

function parseModCall(value) {
  const open = value.indexOf("(");
  if (!open || !value.endsWith(")")) {
    return null;
  }

  const mod = value.slice(0, open);
  const close = findMatching(value, open, "(", ")");
  if (close !== value.length - 1) {
    return null;
  }

  return {
    mod,
    inner: value.slice(open + 1, -1),
  };
}

function loadLayout(layoutPath, layoutName) {
  const json = JSON.parse(fs.readFileSync(layoutPath, "utf8"));

  if (Array.isArray(json)) {
    return json;
  }

  const layouts = json.layouts;
  if (!layouts) {
    throw new Error(`No layouts found in ${layoutPath}`);
  }

  const layoutSpec = layouts[layoutName] ?? layouts[Object.keys(layouts)[0]];
  if (!layoutSpec?.layout) {
    throw new Error(`Layout ${layoutName} was not found in ${layoutPath}`);
  }

  return layoutSpec.layout;
}

function renderSvg({ title, layers, layout, combos }) {
  const scale = 58;
  const gap = 5;
  const margin = 24;
  const titleHeight = 30;
  const layerGap = 48;

  const normalizedLayout = layout.map((key) => ({
    x: key.x ?? 0,
    y: key.y ?? 0,
    w: key.w ?? 1,
    h: key.h ?? 1,
    r: key.r ?? 0,
    rx: key.rx,
    ry: key.ry,
  }));

  const minX = Math.min(...normalizedLayout.map((key) => key.x));
  const minY = Math.min(...normalizedLayout.map((key) => key.y));
  const maxX = Math.max(...normalizedLayout.map((key) => key.x + key.w));
  const maxY = Math.max(...normalizedLayout.map((key) => key.y + key.h));
  const keyAreaWidth = (maxX - minX) * scale;
  const keyAreaHeight = (maxY - minY) * scale;
  const width = Math.ceil(keyAreaWidth + margin * 2);
  const perLayerHeight = titleHeight + keyAreaHeight + layerGap;
  const height = Math.ceil(margin + layers.length * perLayerHeight - layerGap + margin);

  const defs = `<style>
  :root { color-scheme: light; }
  svg { background: #ffffff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .title { fill: #17202a; font-size: 16px; font-weight: 700; }
  .key rect { fill: #f8fafc; stroke: #9aa4b2; stroke-width: 1.2; }
  .key.mod-tap rect { fill: #f2f7ff; }
  .key.layer-tap rect, .key.layer rect { fill: #eef8f4; }
  .key.mouse rect { fill: #fff5e9; }
  .key.system rect { fill: #f7f1ff; }
  .key.trans rect { fill: #fbfbfb; stroke: #d7dce2; stroke-dasharray: 4 3; }
  .key.none rect { fill: #ffffff; stroke: #e2e5e9; }
  .tap { fill: #17202a; font-size: 11px; font-weight: 650; text-anchor: middle; dominant-baseline: middle; }
  .hold { fill: #46515f; font-size: 8.5px; font-weight: 600; text-anchor: middle; dominant-baseline: middle; }
  .key.trans text, .key.none text { opacity: 0.35; }
  .combo rect { fill: #fff4c7; stroke: #c18a10; stroke-width: 1; }
  .combo text { fill: #5f4100; font-size: 8px; font-weight: 700; text-anchor: middle; dominant-baseline: middle; }
</style>`;

  const layerSvgs = layers
    .map((layer, layerIndex) => {
      const originX = margin - minX * scale;
      const originY = margin + titleHeight + layerIndex * perLayerHeight - minY * scale;
      const keys = normalizedLayout
        .map((key, keyIndex) => renderKey(key, layer.keys[keyIndex], { originX, originY, scale, gap }))
        .join("\n");
      const comboSvg = renderCombos(combos, normalizedLayout, { originX, originY, scale });

      return `<g class="layer" data-layer="${escapeXml(layer.name)}">
  <text class="title" x="${margin}" y="${originY + minY * scale - 12}">${escapeXml(layer.name)}</text>
${keys}
${comboSvg}
</g>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)} keymap">
<title>${escapeXml(title)} keymap</title>
${defs}
${layerSvgs}
</svg>
`;
}

function renderPng({ layers, layout, combos }) {
  const scale = 58;
  const gap = 5;
  const margin = 24;
  const titleHeight = 30;
  const layerGap = 48;

  const normalizedLayout = layout.map((key) => ({
    x: key.x ?? 0,
    y: key.y ?? 0,
    w: key.w ?? 1,
    h: key.h ?? 1,
    r: key.r ?? 0,
    rx: key.rx,
    ry: key.ry,
  }));

  const minX = Math.min(...normalizedLayout.map((key) => key.x));
  const minY = Math.min(...normalizedLayout.map((key) => key.y));
  const maxX = Math.max(...normalizedLayout.map((key) => key.x + key.w));
  const maxY = Math.max(...normalizedLayout.map((key) => key.y + key.h));
  const keyAreaWidth = (maxX - minX) * scale;
  const keyAreaHeight = (maxY - minY) * scale;
  const width = Math.ceil(keyAreaWidth + margin * 2);
  const perLayerHeight = titleHeight + keyAreaHeight + layerGap;
  const height = Math.ceil(margin + layers.length * perLayerHeight - layerGap + margin);
  const image = createImage(width, height, COLORS.page);

  layers.forEach((layer, layerIndex) => {
    const originX = margin - minX * scale;
    const originY = margin + titleHeight + layerIndex * perLayerHeight - minY * scale;
    drawBitmapText(image, layer.name, margin, originY + minY * scale - 23, {
      scale: 3,
      color: COLORS.text,
    });

    normalizedLayout.forEach((key, keyIndex) => {
      drawPngKey(image, key, layer.keys[keyIndex], { originX, originY, scale, gap });
    });

    drawPngCombos(image, combos, normalizedLayout, { originX, originY, scale });
  });

  return encodePng(image);
}

function renderKey(layoutKey, binding = { tap: "", hold: "", type: "none" }, options) {
  const { originX, originY, scale, gap } = options;
  const w = Math.max(layoutKey.w * scale - gap, 20);
  const h = Math.max(layoutKey.h * scale - gap, 20);
  const x = originX + layoutKey.x * scale;
  const y = originY + layoutKey.y * scale;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const classes = ["key", binding.type].filter(Boolean).join(" ");
  const transform = rotationTransform(layoutKey, originX, originY, scale);

  const tapText = renderTextLines(binding.tap, {
    x: cx,
    y: cy - (binding.hold ? 3 : 0),
    className: "tap",
    maxWidth: w - 8,
    baseSize: 11,
  });
  const holdText = binding.hold
    ? renderTextLines(binding.hold, {
        x: cx,
        y: y + h - 9,
        className: "hold",
        maxWidth: w - 8,
        baseSize: 8.5,
      })
    : "";

  return `<g class="${classes}"${transform}>
  <rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="6" ry="6"/>
${tapText}
${holdText}
</g>`;
}

function rotationTransform(key, originX, originY, scale) {
  if (!key.r) {
    return "";
  }
  const rx = originX + (key.rx ?? key.x + key.w / 2) * scale;
  const ry = originY + (key.ry ?? key.y + key.h / 2) * scale;
  return ` transform="rotate(${round(key.r)} ${round(rx)} ${round(ry)})"`;
}

function renderCombos(combos, layout, options) {
  if (!combos.length) {
    return "";
  }

  const { originX, originY, scale } = options;
  return combos
    .map((combo) => {
      const points = combo.positions
        .map((position) => layout[position])
        .filter(Boolean)
        .map((key) => ({
          x: originX + (key.x + key.w / 2) * scale,
          y: originY + (key.y + key.h / 2) * scale,
        }));

      if (!points.length) {
        return "";
      }

      const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
      const y = Math.min(...points.map((point) => point.y)) - 24;
      const w = Math.max(34, combo.key.length * 5.7 + 12);
      const h = 18;

      const lines = points
        .map((point) => `<line x1="${round(x)}" y1="${round(y + h / 2)}" x2="${round(point.x)}" y2="${round(point.y - 16)}" stroke="#d6aa36" stroke-width="1"/>`)
        .join("\n");

      return `<g class="combo">
${lines}
  <rect x="${round(x - w / 2)}" y="${round(y)}" width="${round(w)}" height="${h}" rx="5" ry="5"/>
  <text x="${round(x)}" y="${round(y + h / 2 + 0.5)}">${escapeXml(combo.key)}</text>
</g>`;
    })
    .join("\n");
}

const COLORS = {
  page: [255, 255, 255, 255],
  text: [23, 32, 42, 255],
  subText: [70, 81, 95, 255],
  border: [154, 164, 178, 255],
  faintBorder: [215, 220, 226, 255],
  key: [248, 250, 252, 255],
  modTap: [242, 247, 255, 255],
  layer: [238, 248, 244, 255],
  mouse: [255, 245, 233, 255],
  system: [247, 241, 255, 255],
  trans: [251, 251, 251, 255],
  combo: [255, 244, 199, 255],
  comboBorder: [193, 138, 16, 255],
  comboText: [95, 65, 0, 255],
};

const FONT_5X7 = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "\"": ["01010", "01010", "01010", "00000", "00000", "00000", "00000"],
  "#": ["01010", "01010", "11111", "01010", "11111", "01010", "01010"],
  "$": ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "*": ["00000", "10101", "01110", "11111", "01110", "10101", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  ",": ["00000", "00000", "00000", "00000", "00100", "00100", "01000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "<": ["00010", "00100", "01000", "10000", "01000", "00100", "00010"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  ">": ["01000", "00100", "00010", "00001", "00010", "00100", "01000"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "@": ["01110", "10001", "10111", "10101", "10111", "10000", "01110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10011", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  a: ["00000", "00000", "01110", "00001", "01111", "10001", "01111"],
  b: ["10000", "10000", "10110", "11001", "10001", "10001", "11110"],
  c: ["00000", "00000", "01111", "10000", "10000", "10000", "01111"],
  d: ["00001", "00001", "01101", "10011", "10001", "10001", "01111"],
  e: ["00000", "00000", "01110", "10001", "11111", "10000", "01110"],
  f: ["00110", "01001", "01000", "11100", "01000", "01000", "01000"],
  g: ["00000", "00000", "01111", "10001", "01111", "00001", "01110"],
  h: ["10000", "10000", "10110", "11001", "10001", "10001", "10001"],
  i: ["00100", "00000", "01100", "00100", "00100", "00100", "01110"],
  j: ["00010", "00000", "00110", "00010", "00010", "10010", "01100"],
  k: ["10000", "10000", "10010", "10100", "11000", "10100", "10010"],
  l: ["01100", "00100", "00100", "00100", "00100", "00100", "01110"],
  m: ["00000", "00000", "11010", "10101", "10101", "10101", "10101"],
  n: ["00000", "00000", "10110", "11001", "10001", "10001", "10001"],
  o: ["00000", "00000", "01110", "10001", "10001", "10001", "01110"],
  p: ["00000", "00000", "11110", "10001", "11110", "10000", "10000"],
  q: ["00000", "00000", "01111", "10001", "01111", "00001", "00001"],
  r: ["00000", "00000", "10110", "11001", "10000", "10000", "10000"],
  s: ["00000", "00000", "01111", "10000", "01110", "00001", "11110"],
  t: ["01000", "01000", "11100", "01000", "01000", "01001", "00110"],
  u: ["00000", "00000", "10001", "10001", "10001", "10011", "01101"],
  v: ["00000", "00000", "10001", "10001", "10001", "01010", "00100"],
  w: ["00000", "00000", "10001", "10101", "10101", "10101", "01010"],
  x: ["00000", "00000", "10001", "01010", "00100", "01010", "10001"],
  y: ["00000", "00000", "10001", "10001", "01111", "00001", "01110"],
  z: ["00000", "00000", "11111", "00010", "00100", "01000", "11111"],
  "[": ["01110", "01000", "01000", "01000", "01000", "01000", "01110"],
  "\\": ["10000", "01000", "01000", "00100", "00010", "00010", "00001"],
  "]": ["01110", "00010", "00010", "00010", "00010", "00010", "01110"],
  "^": ["00100", "01010", "10001", "00000", "00000", "00000", "00000"],
  "_": ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  "|": ["00100", "00100", "00100", "00100", "00100", "00100", "00100"],
};

function createImage(width, height, color) {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
    data[i + 3] = color[3];
  }
  return { width, height, data };
}

function drawPngKey(image, layoutKey, binding = { tap: "", hold: "", type: "none" }, options) {
  const { originX, originY, scale, gap } = options;
  const x = Math.round(originX + layoutKey.x * scale);
  const y = Math.round(originY + layoutKey.y * scale);
  const w = Math.max(Math.round(layoutKey.w * scale - gap), 20);
  const h = Math.max(Math.round(layoutKey.h * scale - gap), 20);
  const cx = x + Math.floor(w / 2);
  const cy = y + Math.floor(h / 2);
  const fill = keyFill(binding.type);
  const border = binding.type === "trans" || binding.type === "none" ? COLORS.faintBorder : COLORS.border;

  fillRect(image, x, y, w, h, fill);
  strokeRect(image, x, y, w, h, border, binding.type === "trans" || binding.type === "none");

  if (binding.tap) {
    drawCenteredLabel(image, binding.tap, cx, cy - (binding.hold ? 4 : 0), w - 8, {
      scale: 2,
      color: COLORS.text,
    });
  }

  if (binding.hold) {
    drawCenteredLabel(image, binding.hold, cx, y + h - 11, w - 8, {
      scale: 1,
      color: COLORS.subText,
      maxLines: 1,
    });
  }
}

function drawPngCombos(image, combos, layout, options) {
  const { originX, originY, scale } = options;

  for (const combo of combos) {
    const points = combo.positions
      .map((position) => layout[position])
      .filter(Boolean)
      .map((key) => ({
        x: Math.round(originX + (key.x + key.w / 2) * scale),
        y: Math.round(originY + (key.y + key.h / 2) * scale),
      }));

    if (!points.length) {
      continue;
    }

    const x = Math.round(points.reduce((sum, point) => sum + point.x, 0) / points.length);
    const y = Math.round(Math.min(...points.map((point) => point.y)) - 24);
    const w = Math.max(34, textPixelWidth(combo.key, 1) + 12);
    const h = 18;

    for (const point of points) {
      drawLine(image, x, y + Math.floor(h / 2), point.x, point.y - 16, COLORS.comboBorder);
    }

    fillRect(image, x - Math.floor(w / 2), y, w, h, COLORS.combo);
    strokeRect(image, x - Math.floor(w / 2), y, w, h, COLORS.comboBorder);
    drawCenteredLabel(image, combo.key, x, y + Math.floor(h / 2), w - 4, {
      scale: 1,
      color: COLORS.comboText,
      maxLines: 1,
    });
  }
}

function keyFill(type) {
  if (type === "mod-tap") {
    return COLORS.modTap;
  }
  if (type === "layer-tap" || type === "layer") {
    return COLORS.layer;
  }
  if (type === "mouse") {
    return COLORS.mouse;
  }
  if (type === "system") {
    return COLORS.system;
  }
  if (type === "trans" || type === "none") {
    return COLORS.trans;
  }
  return COLORS.key;
}

function fillRect(image, x, y, w, h, color) {
  const startX = Math.max(0, x);
  const startY = Math.max(0, y);
  const endX = Math.min(image.width, x + w);
  const endY = Math.min(image.height, y + h);

  for (let py = startY; py < endY; py += 1) {
    for (let px = startX; px < endX; px += 1) {
      setPixel(image, px, py, color);
    }
  }
}

function strokeRect(image, x, y, w, h, color, dashed = false) {
  for (let px = x; px < x + w; px += 1) {
    if (!dashed || Math.floor((px - x) / 4) % 2 === 0) {
      setPixel(image, px, y, color);
      setPixel(image, px, y + h - 1, color);
    }
  }
  for (let py = y; py < y + h; py += 1) {
    if (!dashed || Math.floor((py - y) / 4) % 2 === 0) {
      setPixel(image, x, py, color);
      setPixel(image, x + w - 1, py, color);
    }
  }
}

function drawLine(image, x0, y0, x1, y1, color) {
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;

  while (true) {
    setPixel(image, x, y, color);
    if (x === x1 && y === y1) {
      break;
    }
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function setPixel(image, x, y, color) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
    return;
  }
  const index = (Math.floor(y) * image.width + Math.floor(x)) * 4;
  image.data[index] = color[0];
  image.data[index + 1] = color[1];
  image.data[index + 2] = color[2];
  image.data[index + 3] = color[3];
}

function drawCenteredLabel(image, label, cx, cy, maxWidth, options) {
  const normalized = label;
  const maxChars = Math.max(4, Math.floor(maxWidth / (6 * options.scale)));
  const lines = splitLabel(normalized, maxChars).slice(0, options.maxLines ?? 3);
  let scale = options.scale;
  const longestWidth = Math.max(...lines.map((line) => textPixelWidth(line, scale)));

  while (scale > 1 && longestWidth > maxWidth) {
    scale -= 1;
  }

  const lineHeight = 8 * scale;
  const totalHeight = lines.length * lineHeight - scale;
  const yStart = Math.round(cy - totalHeight / 2);

  lines.forEach((line, index) => {
    const width = textPixelWidth(line, scale);
    drawBitmapText(image, line, Math.round(cx - width / 2), yStart + index * lineHeight, {
      scale,
      color: options.color,
    });
  });
}

function drawBitmapText(image, text, x, y, options) {
  let cursorX = x;
  const scale = options.scale ?? 1;
  const color = options.color ?? COLORS.text;

  for (const char of text) {
    const glyph = FONT_5X7[char] ?? FONT_5X7["?"];
    drawGlyph(image, glyph, cursorX, y, scale, color);
    cursorX += 6 * scale;
  }
}

function drawGlyph(image, glyph, x, y, scale, color) {
  glyph.forEach((row, rowIndex) => {
    for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
      if (row[colIndex] === "1") {
        fillRect(image, x + colIndex * scale, y + rowIndex * scale, scale, scale, color);
      }
    }
  });
}

function textPixelWidth(text, scale) {
  return Math.max(0, text.length * 6 * scale - scale);
}

function encodePng(image) {
  const scanlineLength = image.width * 4 + 1;
  const raw = Buffer.alloc(scanlineLength * image.height);

  for (let y = 0; y < image.height; y += 1) {
    const rawOffset = y * scanlineLength;
    const dataOffset = y * image.width * 4;
    raw[rawOffset] = 0;
    image.data.copy(raw, rawOffset + 1, dataOffset, dataOffset + image.width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(image.width, 0);
  ihdr.writeUInt32BE(image.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function renderTextLines(label, options) {
  if (!label) {
    return "";
  }

  const lines = splitLabel(label, Math.max(4, Math.floor(options.maxWidth / 6.2)));
  const longest = Math.max(...lines.map((line) => line.length));
  const fontSize = Math.max(6.5, Math.min(options.baseSize, options.maxWidth / Math.max(1, longest) / 0.58));
  const lineHeight = fontSize * 1.05;
  const yStart = options.y - ((lines.length - 1) * lineHeight) / 2;
  const tspans = lines
    .map((line, index) => `<tspan x="${round(options.x)}" y="${round(yStart + index * lineHeight)}">${escapeXml(line)}</tspan>`)
    .join("");

  return `  <text class="${options.className}" style="font-size:${round(fontSize)}px">${tspans}</text>`;
}

function splitLabel(label, maxChars) {
  if (label.length <= maxChars) {
    return [label];
  }

  const separator = label.includes("+") ? "+" : label.includes(" ") ? " " : "";
  if (!separator) {
    return chunk(label, maxChars).slice(0, 3);
  }

  const parts = label.split(separator).filter(Boolean);
  const lines = [];
  let current = "";

  for (const part of parts) {
    const next = current ? `${current}${separator}${part}` : part;
    if (next.length <= maxChars || !current) {
      current = next;
    } else {
      lines.push(current);
      current = part;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.slice(0, 3);
}

function chunk(value, size) {
  const chunks = [];
  for (let i = 0; i < value.length; i += size) {
    chunks.push(value.slice(i, i + size));
  }
  return chunks;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function resolveFormat(args) {
  const requested = args.format?.toLowerCase();
  if (requested && requested !== "svg" && requested !== "png") {
    throw new Error(`Unsupported format: ${args.format}`);
  }

  if (requested) {
    if (!args.outProvided && requested === "png") {
      args.out = "docs/keymap.png";
    }
    return requested;
  }

  return path.extname(args.out).toLowerCase() === ".png" ? "png" : "svg";
}

function renderPngFromSvg(svg, args, bitmapInput) {
  const requestedEngine = args.pngEngine.toLowerCase();
  const engines = requestedEngine === "auto" ? ["rsvg", "inkscape", "magick", "convert"] : [requestedEngine];

  if (requestedEngine === "bitmap") {
    return renderPng(bitmapInput);
  }

  if (!["auto", "rsvg", "inkscape", "magick", "convert", "bitmap"].includes(requestedEngine)) {
    throw new Error(`Unsupported PNG engine: ${args.pngEngine}`);
  }

  const failures = [];
  for (const engine of engines) {
    const result = convertSvgToPng(svg, engine);
    if (result.ok) {
      if (requestedEngine === "auto") {
        process.stderr.write(`Rendered PNG via ${result.command}\n`);
      }
      return result.png;
    }
    failures.push(result.reason);
  }

  if (requestedEngine !== "auto") {
    throw new Error(
      `Could not render PNG via ${requestedEngine}.\n${failures.join("\n")}\n\nInstall librsvg, Inkscape, or ImageMagick, or use --png-engine bitmap.`,
    );
  }

  process.stderr.write(
    "No SVG-to-PNG renderer found; falling back to built-in bitmap PNG. Install librsvg for smooth text: brew install librsvg\n",
  );
  return renderPng(bitmapInput);
}

function convertSvgToPng(svg, engine) {
  const command = pngCommand(engine);
  if (!executableExists(command)) {
    return { ok: false, reason: `${command}: not found` };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "render-keymap-"));
  const svgPath = path.join(tmpDir, "keymap.svg");
  const pngPath = path.join(tmpDir, "keymap.png");

  try {
    fs.writeFileSync(svgPath, svg);
    const result = spawnSync(command, pngArgs(engine, svgPath, pngPath), {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 8,
    });

    if (result.status !== 0) {
      const message = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
      return { ok: false, reason: `${command}: ${message || `exit ${result.status}`}` };
    }

    if (!fs.existsSync(pngPath)) {
      return { ok: false, reason: `${command}: did not create ${pngPath}` };
    }

    return { ok: true, command, png: fs.readFileSync(pngPath) };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function pngCommand(engine) {
  if (engine === "rsvg") {
    return "rsvg-convert";
  }
  return engine;
}

function pngArgs(engine, svgPath, pngPath) {
  if (engine === "rsvg") {
    return ["-o", pngPath, svgPath];
  }
  if (engine === "inkscape") {
    return [svgPath, "--export-type=png", `--export-filename=${pngPath}`];
  }
  return [svgPath, pngPath];
}

function executableExists(command) {
  const paths = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  return paths.some((dir) => {
    const candidate = path.join(dir, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const keymapSource = fs.readFileSync(args.keymap, "utf8");
  const parsed = parseKeymap(keymapSource);
  const layout = loadLayout(args.layout, args.layoutName);
  const layerFilter = args.layers ? new Set(args.layers.map((name) => name.toUpperCase())) : null;
  const layers = layerFilter
    ? parsed.layers.filter((layer) => layerFilterAliases(layer).some((name) => layerFilter.has(name)))
    : parsed.layers;

  if (!layers.length) {
    throw new Error("No layers selected for rendering");
  }

  for (const layer of layers) {
    if (layer.keys.length !== layout.length) {
      throw new Error(
        `Layer ${layer.name} has ${layer.keys.length} keys, but layout has ${layout.length} keys.`,
      );
    }
  }

  const format = resolveFormat(args);
  const svg = renderSvg({
    title: args.title,
    layers,
    layout,
    combos: parsed.combos,
  });
  const output =
    format === "png"
      ? renderPngFromSvg(svg, args, {
          layers,
          layout,
          combos: parsed.combos,
        })
      : svg;

  if (args.out === "-") {
    process.stdout.write(output);
  } else {
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, output);
    process.stderr.write(`Wrote ${args.out}\n`);
  }
}

function layerFilterAliases(layer) {
  return [layer.name, layer.rawName, legacyLayerName(layer.rawName)].map((name) => name.toUpperCase());
}

function legacyLayerName(rawName) {
  if (rawName === "default_layer") {
    return "BASE";
  }
  return rawName.replace(/^layer_/, "LAYER ").replace(/_/g, " ");
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n\n${usage()}`);
  process.exit(1);
}
