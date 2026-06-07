#!/usr/bin/env node
// @ts-nocheck

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'tools', 'minecraft_reports', '1.21.11');
const BLOCK_MAP_COLORS_PATH = path.join(REPORT_DIR, 'block_map_colors_1_21_11.json');
const BUILDING_BLOCKS_PATH = path.join(REPORT_DIR, 'building_blocks_1_21_11.json');
const PREVIOUS_PALETTE_PATH = path.join(ROOT, 'packages', 'block-palettes', 'src', 'palettes', '1.21.4.json');
const OUTPUT_PATH = path.join(ROOT, 'packages', 'block-palettes', 'src', 'palettes', '1.21.11.json');
const DIAGNOSTICS_PATH = path.join(REPORT_DIR, 'cartographer_palette_diagnostics.json');

const shadeFactors = {
  light: 180 / 255,
  medium: 220 / 255,
  dark: 135 / 255
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const clamp = (value) => Math.max(0, Math.min(255, value));
const shade = (value, factor) => clamp(Math.round(value * factor));
const rgbKey = (rgb) => `${rgb.r},${rgb.g},${rgb.b}`;
const groupKey = (record) => `${record.mapColor}:${rgbKey(record.rgb)}`;

const getShadedColors = (rgb) => [
  { r: shade(rgb.r, shadeFactors.light), g: shade(rgb.g, shadeFactors.light), b: shade(rgb.b, shadeFactors.light) },
  { r: shade(rgb.r, shadeFactors.medium), g: shade(rgb.g, shadeFactors.medium), b: shade(rgb.b, shadeFactors.medium) },
  { r: shade(rgb.r, shadeFactors.dark), g: shade(rgb.g, shadeFactors.dark), b: shade(rgb.b, shadeFactors.dark) }
];

const requiredFiles = [BLOCK_MAP_COLORS_PATH, BUILDING_BLOCKS_PATH, PREVIOUS_PALETTE_PATH];
const missingFiles = requiredFiles.filter((filePath) => !fs.existsSync(filePath));
if (missingFiles.length) {
  console.error('Missing required input files:');
  for (const filePath of missingFiles) {
    console.error(`- ${path.relative(ROOT, filePath)}`);
  }
  process.exit(1);
}

const mapColorRecords = readJson(BLOCK_MAP_COLORS_PATH);
const buildingBlocks = readJson(BUILDING_BLOCKS_PATH);
const previousPalette = readJson(PREVIOUS_PALETTE_PATH);

const buildingBlockIds = new Set(buildingBlocks.map((block) => block.id));
const previousBlockById = new Map();
const previousItemByBaseRgb = new Map();

for (const item of previousPalette) {
  if (item.colors?.[0]) {
    previousItemByBaseRgb.set(rgbKey(item.colors[0]), item);
  }
  for (const block of item.blocks || []) {
    previousBlockById.set(block.id, block);
  }
}

const groups = new Map();
for (const record of mapColorRecords) {
  if (record.confidence !== 'exact' || !buildingBlockIds.has(record.id)) {
    continue;
  }

  const key = groupKey(record);
  if (!groups.has(key)) {
    groups.set(key, {
      mapColor: record.mapColor,
      rgb: record.rgb,
      records: []
    });
  }
  groups.get(key).records.push(record);
}

const diagnostics = {
  input: {
    block_map_colors: path.relative(ROOT, BLOCK_MAP_COLORS_PATH),
    building_blocks: path.relative(ROOT, BUILDING_BLOCKS_PATH),
    previous_palette: path.relative(ROOT, PREVIOUS_PALETTE_PATH)
  },
  rules: {
    included_records: 'confidence exact records that also exist in building_blocks_1_21_11.json',
    excluded_records: 'missing or ambiguous records and non-building-block records are not included',
    generated_color_source: 'base mapColor RGB from exact extractor, shaded by Minecraft map shade factors'
  },
  shade_factors: {
    light: 'round(base * 180 / 255)',
    medium: 'round(base * 220 / 255)',
    dark: 'round(base * 135 / 255)'
  },
  building_blocks_count: buildingBlocks.length,
  map_color_records_count: mapColorRecords.length,
  exact_building_block_records_count: 0,
  palette_group_count: 0,
  palette_block_count: 0,
  color_sources: {
    previous_palette_same_rgb: 0,
    exact_extractor_shaded_by_minecraft_map_shade_factors: 0
  }
};

const palette = Array.from(groups.values())
  .sort((a, b) => {
    if (a.mapColor === b.mapColor) {
      return rgbKey(a.rgb).localeCompare(rgbKey(b.rgb));
    }
    return a.mapColor.localeCompare(b.mapColor);
  })
  .map((group) => {
    const previousItem = previousItemByBaseRgb.get(rgbKey(group.rgb));
    const colors = previousItem?.colors || getShadedColors(group.rgb);
    if (previousItem) {
      diagnostics.color_sources.previous_palette_same_rgb += 1;
    } else {
      diagnostics.color_sources.exact_extractor_shaded_by_minecraft_map_shade_factors += 1;
    }

    const blocks = group.records
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((record) => {
        const previousBlock = previousBlockById.get(record.id);
        return {
          id: record.id,
          attributes: previousBlock?.attributes || {},
          properties: previousBlock?.properties || {}
        };
      });

    return {
      id: previousItem?.id || group.mapColor,
      colors,
      blocks
    };
  });

diagnostics.exact_building_block_records_count = palette.reduce((sum, item) => sum + item.blocks.length, 0);
diagnostics.palette_group_count = palette.length;
diagnostics.palette_block_count = diagnostics.exact_building_block_records_count;

fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(palette, null, 2)}\n`);
fs.writeFileSync(DIAGNOSTICS_PATH, `${JSON.stringify(diagnostics, null, 2)}\n`);

console.log(
  `Wrote ${path.relative(ROOT, OUTPUT_PATH)} with ${diagnostics.palette_group_count} groups and ${diagnostics.palette_block_count} blocks`
);
console.log(`Wrote ${path.relative(ROOT, DIAGNOSTICS_PATH)}`);
