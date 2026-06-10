import PaletteSelector, { EnabledSelector } from '../components/pallete-selector';
import * as block_palettes from '@cartographer/block-palettes';
import SearchBox from '../components/search-box';
import MultiButton from './multi-button';
import styled from 'styled-components';
import * as defs from '../defs';
import * as React from 'react';
import Fuse from 'fuse.js';

import * as utils from '../utils';
import patches from '../patches';

const PALETTE_VERSIONS = Object.keys(block_palettes.palettes) as (keyof typeof block_palettes.palettes)[];
const DEFAULT_PALETTE_VERSION = '1.21.11' as keyof typeof block_palettes.palettes;

const PALETTE_PRESET_LABELS: Record<string, string> = {
  Full: '전체',
  Affordable: '저비용',
  'Concrete Powder': '콘크리트 가루'
};

const Container = styled.div`
  display: flex;
  flex-direction: column;
  width: 400px;
  border-left: 2px dashed ${(props) => props.theme['dark-yellow']};
`;

const Header = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  border-bottom: 2px dashed ${(props) => props.theme['dark-yellow']};
`;

const Title = styled.p`
  color: ${(props) => props.theme['light-yellow']};
`;

const HeaderDetails = styled.div`
  display: flex;
  flex-direction: column;
`;

const Detail = styled.p`
  color: ${(props) => props.theme.fg2};
  font-size: 12px;
  margin-top: 4px;
`;

type Props = {
  palette: defs.ColorPalette;
  onChange: (palette: defs.ColorPalette) => void;
  material_counts: Record<string, number>;
  material_counts_loading: boolean;
  total_used_blocks: number;
};

export const BlockList: React.FC<Props> = (props) => {
  const [search, setSearch] = React.useState('');
  const [palette_version, setPaletteVersion] = React.useState(DEFAULT_PALETTE_VERSION);
  const [palette_preset, setPalettePreset] = React.useState('Full');
  const estimated_minutes = Math.round((props.total_used_blocks / 6000) * 60);
  const estimated_hours = props.total_used_blocks / 6000;
  const estimated_build_time = props.material_counts_loading
    ? '계산 중...'
    : props.total_used_blocks === 0
    ? '0분'
    : `${estimated_hours.toFixed(1)}시간 (${estimated_minutes.toLocaleString()}분), 6000 블록/시간 기준`;

  const blocks = props.palette
    .map((item) =>
      item.blocks.map((block) => {
        const label = utils.formatBlockName(block.id);
        return { id: block.id, label, searchText: `${block.id} ${label}` };
      })
    )
    .flat();
  const fuse = new Fuse(blocks, {
    keys: ['id', 'label', 'searchText'],
    threshold: 0.3
  });

  let palette = props.palette;
  if (search) {
    const filtered = fuse.search(search);
    const filtered_block_ids = filtered.map(({ item }) => item.id);
    palette = props.palette.reduce((palette: defs.ColorPalette, item) => {
      const match = filtered.find((filtered) => {
        return item.blocks.map((block) => block.id).includes(filtered.item.id);
      });
      if (match) {
        palette.push({
          ...item,
          blocks: item.blocks.filter((block) => filtered_block_ids.includes(block.id))
        });
      }
      return palette;
    }, []);
  }

  let shared_selector: boolean | -1 = -1;
  const [all_enabled, all_disabled] = props.palette.reduce(
    ([enabled, disabled]: [boolean, boolean], item) => {
      if (item.enabled) {
        if (disabled) {
          return [enabled, false];
        }
      } else {
        if (enabled) {
          return [false, disabled];
        }
      }
      return [enabled, disabled];
    },
    [true, true]
  );

  if (all_enabled) {
    shared_selector = true;
  } else if (all_disabled) {
    shared_selector = false;
  } else {
    shared_selector = -1;
  }

  return (
    <Container>
      <Header>
        <HeaderDetails>
          <Title>블록 팔레트</Title>
          <Detail>
            전체 블록 수: {props.material_counts_loading ? '계산 중...' : props.total_used_blocks.toLocaleString()}
          </Detail>
          <Detail>예상 건설 시간: {estimated_build_time}</Detail>
          <Detail>생성된 재료 수를 기준으로 추정합니다.</Detail>
        </HeaderDetails>

        <SearchBox value={search} onChange={setSearch} />
      </Header>

      <Header style={{ marginBottom: 5 }}>
        <MultiButton
          action_opens_picker
          selected={palette_version}
          style={{ marginRight: 10 }}
          actions={PALETTE_VERSIONS.map((key) => {
            return {
              name: key
            };
          })}
          onSelectionChange={(name) => {
            setPaletteVersion(name as any);
            const patch = patches.find((patch) => patch.name === palette_preset);
            if (patch) {
              props.onChange(
                utils.applyPalettePatch(
                  block_palettes.palettes[name as keyof typeof block_palettes.palettes],
                  patch.patch
                )
              );
            }
          }}
        />

        <MultiButton
          action_opens_picker
          selected={palette_preset}
          actions={patches.map((patch) => {
            return {
              name: patch.name,
              label: PALETTE_PRESET_LABELS[patch.name]
            };
          })}
          onSelectionChange={(name) => {
            const patch = patches.find((patch) => patch.name === name);
            if (patch) {
              props.onChange(utils.applyPalettePatch(block_palettes.palettes[palette_version], patch.patch));
              setPalettePreset(name);
            }
          }}
        />

        <EnabledSelector
          enabled={shared_selector}
          onChange={(enabled) => {
            props.onChange(
              props.palette.map((item) => {
                return {
                  ...item,
                  enabled
                };
              })
            );
          }}
        ></EnabledSelector>
      </Header>

      <PaletteSelector
        palette={palette}
        material_counts={props.material_counts}
        onChange={(item) => {
          props.onChange(
            props.palette.map((original) => {
              if (original.id !== item.id) {
                return original;
              }
              return {
                ...original,
                enabled: item.enabled,
                selected_block_ids: item.selected_block_ids
              };
            })
          );
        }}
      />
    </Container>
  );
};

export default BlockList;
