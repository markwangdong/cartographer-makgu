import { BlockPalette } from '@cartographer/pixels';

import palette_1_21_11 from './palettes/1.21.11.json';
import palette_1_21_4 from './palettes/1.21.4.json';
import palette_1_21_2 from './palettes/1.21.2.json';
import palette_1_21 from './palettes/1.21.json';
import palette_1_20 from './palettes/1.20.json';
import palette_1_19 from './palettes/1.19.json';
import palette_1_18 from './palettes/1.18.json';

export const palettes = {
  '1.21.11': palette_1_21_11 as unknown as BlockPalette,
  '1.21.4': palette_1_21_4 as unknown as BlockPalette,
  '1.21.2': palette_1_21_2 as unknown as BlockPalette,
  '1.21': palette_1_21 as unknown as BlockPalette,
  '1.20': palette_1_20 as unknown as BlockPalette,
  '1.19': palette_1_19 as unknown as BlockPalette,
  '1.18': palette_1_18 as unknown as BlockPalette
};
