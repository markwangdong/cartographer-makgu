import * as generation from '@cartographer/generation';
import * as pixels from '@cartographer/pixels';
import * as constants from '../constants';
import * as comlink from 'comlink';
import * as defs from '../defs';

export type Transformations = {
  saturation?: number;
  brightness?: number;
  dither?: boolean;
  remove_background?: boolean;
  background_color?: { r: number; g: number; b: number };
  background_tolerance?: number;
  background_feather?: number;
};
export type GenerationParams = {
  image_data: ImageData;

  bounds: defs.Bounds;
  scale: defs.Scale;

  palette: pixels.BlockPalette;
  color_spectrum: pixels.BlockColorSpectrum;

  transformations?: Transformations;
};

const removeBackground = (image_data: ImageData, options: Transformations) => {
  if (!options.remove_background || !options.background_color) {
    return image_data;
  }

  const { r, g, b } = options.background_color;
  const tolerance = options.background_tolerance ?? 32;
  const feather = options.background_feather ?? 12;
  const data = new Uint8ClampedArray(image_data.data);

  for (let i = 0; i < data.length; i += 4) {
    const distance = Math.sqrt(Math.pow(data[i] - r, 2) + Math.pow(data[i + 1] - g, 2) + Math.pow(data[i + 2] - b, 2));
    let alpha = data[i + 3];

    if (distance <= tolerance) {
      alpha = 0;
    } else if (feather > 0 && distance <= tolerance + feather) {
      alpha = Math.round(((distance - tolerance) / feather) * 255);
    }

    // The pixel conversion pipeline does not create minecraft:air; transparent pixels still map to nearest palette color.
    data[i] = Math.round((data[i] * alpha) / 255);
    data[i + 1] = Math.round((data[i + 1] * alpha) / 255);
    data[i + 2] = Math.round((data[i + 2] * alpha) / 255);
    data[i + 3] = alpha;
  }

  return new ImageData(data, image_data.width, image_data.height);
};

const baseImagePipeline = (params: GenerationParams) => {
  const [x, y, dx, dy] = params.bounds;

  const canvas = new OffscreenCanvas(params.image_data.width, params.image_data.height);
  const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  context.putImageData(params.image_data, 0, 0);

  const image_data = context.getImageData(x, y, dx, dy);
  const transformed_image_data = removeBackground(image_data, params.transformations || {});

  const palette_transformer = pixels.conversion.createColorPaletteTransformer(params);
  return pixels.conversion.scaleAndProcessImageData({
    image_data: transformed_image_data,
    target_width: params.scale.x * constants.SCALE_FACTOR,
    target_height: params.scale.y * constants.SCALE_FACTOR,
    transformers: [
      pixels.transformers.createColorTransformer(params.transformations || {}),
      params.transformations?.dither
        ? pixels.transformers.floydSteinbergDitherTransformer(palette_transformer)
        : palette_transformer
    ]
  });
};

const generatePreview = (params: GenerationParams) => {
  const color_converted = baseImagePipeline(params);

  const ratio_xy = params.scale.y / params.scale.x;
  const ratio_yx = params.scale.x / params.scale.y;
  let width, height;
  if (params.scale.x > params.scale.y) {
    width = constants.RENDER_IMAGE_MAX_SIZE;
    height = width * ratio_xy;
  } else {
    height = constants.RENDER_IMAGE_MAX_SIZE;
    width = height * ratio_yx;
  }

  return pixels.conversion.convertPixelGridToImageData(color_converted, width, height);
};

type BlockGenerationParams = GenerationParams & {
  staircase_alg: generation.block_generation.StaircaseAlgorithm;
  support_block_id: string;
};

const generateBlockSpaceFromImageData = (params: BlockGenerationParams) => {
  const color_converted = baseImagePipeline(params);

  const blocks = pixels.conversion.convertPixelGridToMCBlocks(color_converted, params.palette);
  return generation.block_generation.generateBlockSpace({
    block_grid: blocks,
    support_block_id: params.support_block_id,
    staircase_alg: params.staircase_alg
  });
};

export const generateLightmaticaSchema = async (params: BlockGenerationParams) => {
  const block_space = generateBlockSpaceFromImageData(params);
  const schema = generation.schema_generation.litematica.generateLitematicaSchema(block_space);
  return await generation.serialization.serializeNBTData(schema);
};

export const generateMapNBT = async (params: BlockGenerationParams) => {
  const block_space = generateBlockSpaceFromImageData(params);
  const map = generation.schema_generation.map.asNbtObject(block_space);
  return await generation.serialization.serializeNBTData(map);
};

export const generateMapJSON = async (params: BlockGenerationParams) => {
  const block_space = generateBlockSpaceFromImageData(params);
  return Buffer.from(JSON.stringify(block_space));
};

export const generateMaterialsList = async (params: BlockGenerationParams) => {
  const block_space = generateBlockSpaceFromImageData(params);

  return block_space.reduce((counts: Record<string, number>, block) => {
    counts[block.id] = (counts[block.id] || 0) + 1;
    return counts;
  }, {});
};

const API = {
  generatePreview: generatePreview,
  generateLitematicaSchema: generateLightmaticaSchema,
  generateMapNBT: generateMapNBT,
  generateMapJSON: generateMapJSON,
  generateMaterialsList: generateMaterialsList
};

export type API = typeof API;

comlink.expose(API);
