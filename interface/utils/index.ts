import * as pixels from '@cartographer/pixels';
import * as defs from '../defs';
import koKr from '../../tools/ko_kr.json';

const minecraftTranslations = koKr as Record<string, string>;

export const formatBlockName = (blockId: string): string => {
  const idWithoutNamespace = blockId.replace('minecraft:', '');
  const translationKey = `block.minecraft.${idWithoutNamespace}`;
  return minecraftTranslations[translationKey] ?? idWithoutNamespace;
};

export const extractImageDataFromFile = (file: File) => {
  const image = new Image();
  const objectUrl = URL.createObjectURL(file);

  return new Promise<ImageData>((resolve, reject) => {
    image.onload = () => {
      try {
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
        if (!context) {
          reject(new Error('Failed to create canvas context'));
          return;
        }
        context.drawImage(image, 0, 0, width, height);
        resolve(context.getImageData(0, 0, width, height));
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };

    image.src = objectUrl;
  });
};

export const download = (data: Uint8Array, file_name: string) => {
  const data_url = URL.createObjectURL(
    new Blob([data], {
      type: 'application/octet-stream'
    })
  );

  const a = document.createElement('a') as HTMLAnchorElement;
  a.setAttribute('href', data_url);
  a.setAttribute('style', 'display: none');
  a.setAttribute('download', file_name);

  document.body.appendChild(a);

  a.click();
  a.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(data_url);
  }, 0);
};

export const applyPalettePatch = (palette: pixels.BlockPalette, patch: defs.PalettePatch): defs.ColorPalette => {
  const indexed = Object.fromEntries(patch.map((patch) => [patch.id, patch]));
  return palette.map((mapping) => {
    const block_patch = indexed[mapping.id];
    return {
      id: mapping.id,
      colors: mapping.colors,
      blocks: mapping.blocks,
      selected_block_ids: block_patch?.selected_block_ids ?? [mapping.blocks[0].id],
      enabled: block_patch?.enabled ?? true
    };
  });
};

export const normalizeColorPalette = (palette: defs.ColorPalette) => {
  return palette
    .filter((item) => item.enabled)
    .map((item) => {
      const blocks = item.blocks.filter((block) => item.selected_block_ids.includes(block.id));
      return {
        ...item,
        blocks,
        colors: item.colors
      };
    });
};
