import ImageSelector from '../components/image-selector';
import ImagePreview from '../components/image-preview';
import SourceImage from '../components/source-image';
import MultiButton from '../components/multi-button';
import BlockList from '../components/block-list';
import CheckBox from '../components/check-box';

import * as block_palettes from '@cartographer/block-palettes';
import { Transformations } from '../workers/api.worker';
import * as generation from '@cartographer/generation';
import * as pixels from '@cartographer/pixels';
import * as rr from 'react-responsive';
import styled from 'styled-components';
import patches from '../patches';
import * as utils from '../utils';
import * as hooks from '../hooks';
import * as defs from '../defs';
import * as React from 'react';
import Head from 'next/head';
import * as _ from 'lodash';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import * as icons from '@fortawesome/free-brands-svg-icons';
import MaterialsList from '../components/materials-list';
import Tooltip from '../components/tooltip';

const DEFAULT_PALETTE_VERSION = '1.21.11' as keyof typeof block_palettes.palettes;
const SCALE_FACTOR = 128;
const STAIRCASE_LABELS: Record<string, string> = {
  Continuous: '연속',
  Baseline: '기준선',
  Boundary: '경계'
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const Container = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  background: ${(props) => props.theme.bg0};
`;

const Header = styled.div<{ border_left?: boolean }>`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  border-bottom: 2px dashed ${(props) => props.theme['dark-yellow']};
  border-left: ${(props) => (props.border_left ? `2px dashed ${props.theme['dark-yellow']}` : 'none')};
`;

const Title = styled.p`
  color: ${(props) => props.theme['light-yellow']};
`;

const Warning = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  border: 4px dashed ${(props) => props.theme['dark-red']};
  margin: 5px;
  color: ${(props) => props.theme['light-red']};
`;

const Content = styled.div`
  display: flex;
  justify-content: space-between;
  flex-direction: row;
  flex-grow: 1;
  overflow: hidden;
`;

const Workspace = styled.div<{ small: boolean }>`
  display: flex;
  align-items: center;
  justify-content: ${(props) => (props.small ? 'flex-start' : 'space-around')};
  flex-direction: ${(props) => (props.small ? 'column' : 'row')};
  overflow-y: auto;
  flex-grow: 1;
`;

const Border = styled.div<{ small: boolean }>`
  flex-direction: column;
  opacity: 0.5;
  ${(props) => `${props.small ? 'border-bottom' : 'border-left'}: 2px dashed ${props.theme['dark-orange']}`};
  ${(props) => `${props.small ? 'width' : 'height'}: 100%`};
  ${(props) => `${props.small ? 'margin: 10px 0px' : 'margin: 0px 10px'}`};
`;

const PreviewContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
`;

const MapOptions = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
`;

const ResolutionDetails = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-bottom: 10px;
`;

const ResolutionInput = styled.input`
  width: 70px;
  color: ${(props) => props.theme.fg2};
  background: ${(props) => props.theme.bg2};
  border: 1px dashed ${(props) => props.theme.fg3};
  margin-left: 5px;
  padding: 2px;
`;

const updateScaleAxis = (value: string, max_scale: number) => {
  const next_value = parseInt(value, 10) || SCALE_FACTOR;
  return clamp(Math.round(next_value / SCALE_FACTOR), 1, max_scale);
};

const Icon = styled(FontAwesomeIcon)`
  color: ${(props) => props.theme['light-purple']};
  border: 1px dashed ${(props) => props.theme['dark-purple']};
  padding: 5px;
  cursor: pointer;
`;

export const Description = styled.p`
  color: ${(props) => props.theme.fg2};
`;

export const ErrorText = styled.p`
  color: ${(props) => props.theme['light-red']};
`;

export const ClearButton = styled.p`
  font-weight: bold;
  align-self: flex-start;
  margin: 10px;
  color: ${(props) => props.theme.fg2};
  border: 1px dashed ${(props) => props.theme.fg3};
  padding: 3px 7px;
  cursor: pointer;
`;

export default function Root() {
  const [image_data, setImageData] = React.useState<ImageData>();
  const [bounds, setBounds] = React.useState<defs.Bounds>();
  const [transformations, setTransformations] = React.useState<Transformations>({});
  const [color_spectrum, setColorSpectrum] = React.useState(pixels.BlockColorSpectrum.Flat);
  const [scale_range, setScaleRange] = React.useState<[number, number]>([1, 1]);
  const [scale, setScale] = React.useState<defs.Scale>({ x: 1, y: 1 });
  const [palette, setPalette] = React.useState<defs.ColorPalette>(
    utils.applyPalettePatch(block_palettes.palettes[DEFAULT_PALETTE_VERSION], patches[0].patch)
  );
  const [materialCounts, setMaterialCounts] = React.useState<Record<string, number>>({});
  const [materialCountsLoading, setMaterialCountsLoading] = React.useState(false);
  const [materials_list_visible, showMaterialsList] = React.useState(false);

  const [staircase_alg, setStaircaseAlg] = React.useState(generation.block_generation.StaircaseAlgorithm.Boundary);
  const [support_block_id, setSupportBlockId] = React.useState('minecraft:cobblestone');

  const api = hooks.withAPIWorker();

  const [generating, isGenerating] = React.useState(false);
  const [generation_error, setGenerationError] = React.useState(false);

  const output_width = scale.x * SCALE_FACTOR;
  const output_height = scale.y * SCALE_FACTOR;
  const selected_width = bounds?.[2];
  const selected_height = bounds?.[3];
  const max_scale_x = Math.max(1, Math.floor((image_data?.width || SCALE_FACTOR) / SCALE_FACTOR));
  const max_scale_y = Math.max(1, Math.floor((image_data?.height || SCALE_FACTOR) / SCALE_FACTOR));
  const total_used_blocks = Object.values(materialCounts).reduce((sum, count) => sum + count, 0);

  const is_small_screen = rr.useMediaQuery({ query: '(max-width: 1750px)' });
  const is_safari =
    !globalThis.window?.OffscreenCanvas ||
    /^((?!chrome|android).)*safari/i.test(globalThis.window?.navigator.userAgent || '');

  const applyImageData = (image_data: ImageData) => {
    const next_scale_range: [number, number] = [
      Math.max(1, Math.floor(image_data.width / SCALE_FACTOR)),
      Math.max(1, Math.floor(image_data.height / SCALE_FACTOR))
    ];

    setScaleRange(next_scale_range);
    setScale((scale) => ({
      x: clamp(scale.x, 1, next_scale_range[0]),
      y: clamp(scale.y, 1, next_scale_range[1])
    }));
    setBounds(undefined);
    setImageData(image_data);
  };

  const generate = async (type: 'litematic' | 'nbt' | 'json') => {
    if (!image_data || !bounds || !api.current) {
      return;
    }

    const params = {
      image_data,
      scale,
      bounds,
      palette: utils.normalizeColorPalette(palette),
      color_spectrum,
      staircase_alg,
      support_block_id,
      transformations
    };

    setGenerationError(false);
    isGenerating(true);
    try {
      switch (type) {
        case 'litematic': {
          const schema_nbt = await api.current.generateLitematicaSchema(params);
          utils.download(schema_nbt, 'map.litematic');
          break;
        }
        case 'nbt': {
          const nbt = await api.current.generateMapNBT(params);
          utils.download(nbt, 'map.nbt');
          break;
        }
        case 'json': {
          const json = await api.current.generateMapJSON(params);
          utils.download(json, 'map.json');
          break;
        }
      }
    } catch (err) {
      console.log('Failed to generate', err);
      setGenerationError(true);
    }
    isGenerating(false);
  };

  React.useEffect(() => {
    if (!image_data || !bounds || !api.current) {
      setMaterialCounts({});
      setMaterialCountsLoading(false);
      return;
    }

    let cancelled = false;
    setMaterialCountsLoading(true);

    (async () => {
      try {
        const counts = await api.current!.generateMaterialsList({
          image_data,
          scale,
          bounds,
          color_spectrum,
          support_block_id,
          staircase_alg,
          palette: utils.normalizeColorPalette(palette),
          transformations
        });

        if (!cancelled) {
          setMaterialCounts(counts);
          setMaterialCountsLoading(false);
        }
      } catch (err) {
        console.log('Failed to generate materials list', err);
        if (!cancelled) {
          setMaterialCounts({});
          setMaterialCountsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    image_data,
    api.current,
    palette,
    scale,
    bounds,
    transformations.brightness,
    transformations.saturation,
    transformations.dither,
    color_spectrum,
    support_block_id,
    staircase_alg
  ]);

  return (
    <Container>
      <Head>
        <title>Cartographer</title>
        {/* <link rel="icon" href="/favicon.ico" /> */}
      </Head>

      <Header>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Title>Cartographer</Title>

          <Description style={{ marginLeft: 10 }}>- 마인크래프트 지도 아트 생성기</Description>
        </div>

        <a target="_blank" rel="noopener noreferrer" href="https://github.com/julienvincent/cartographer">
          <Icon icon={icons.faGithub} />
        </a>
      </Header>

      <Content>
        <Workspace small={is_small_screen}>
          {is_safari ? (
            <Warning>
              죄송하지만 Cartographer는 Safari [WebKit]을 지원하지 않습니다. Safari WebKit에는 OffScreenCanvas 같은 일부
              브라우저 API가 아직 없어 사용할 수 없습니다.
              <br />
              <br />
              Cartographer를 사용하려면 Chrome 기반 브라우저로 전환해야 합니다.
            </Warning>
          ) : null}

          {image_data && (
            <ClearButton
              onClick={() => {
                setImageData(undefined);
              }}
            >
              초기화
            </ClearButton>
          )}

          {image_data ? (
            <PreviewContainer>
              <MapOptions style={{ marginTop: is_small_screen ? 10 : 0, marginBottom: 10 }}>
                <CheckBox
                  label="전체 색상 스펙트럼"
                  label_side="left"
                  tooltip={[
                    '전체 색상 스펙트럼을 켜면 색상 팔레트에 3배 더 많은 색상이 추가되어 이미지가 더 세밀해지지만, 계단식 배치(staircasing)가 발생해 서바이벌에서 제작하기가 훨씬 어려워집니다.',
                    '계단식 배치는 인접한 블록의 색조를 조정하기 위해 블록을 서로 다른 높이에 배치하는 방식입니다. 마인크래프트 지도에서 블록의 색조는 그 블록 북쪽에 있는 블록의 높이로 결정됩니다.',
                    '완전히 평평하고 만들기 쉬운 2D 지도를 원하면 이 옵션을 끄세요.'
                  ]}
                  style={{ marginRight: 15 }}
                  value={color_spectrum === pixels.BlockColorSpectrum.Full}
                  onChange={(value) => {
                    if (value) {
                      return setColorSpectrum(pixels.BlockColorSpectrum.Full);
                    }
                    setColorSpectrum(pixels.BlockColorSpectrum.Flat);
                  }}
                />

                <Tooltip
                  style={{ alignItems: 'center' }}
                  tooltip={[
                    '이 크기는 전체 이미지를 표시하기 위해 나란히 배치해야 하는 확대 레벨 1 지도 수와 관련됩니다.',
                    '이 값을 변경하면 이미지가 더 세밀해지지만 훨씬 더 많은 블록을 배치해야 합니다.'
                  ]}
                >
                  <Description style={{ marginRight: 10 }}>지도 크기</Description>

                  <MultiButton
                    disabled={!image_data}
                    style={{ marginRight: 5 }}
                    selected={`${scale.x}`}
                    actions={_.range(1, scale_range[0] + 1).map((option) => {
                      return {
                        name: `${option}`
                      };
                    })}
                    onSelectionChange={(name) => {
                      setScale({
                        ...scale,
                        x: parseInt(name)
                      });
                    }}
                    action_opens_picker
                    prefix="X "
                  />

                  <MultiButton
                    disabled={!image_data}
                    selected={`${scale.y}`}
                    actions={_.range(1, scale_range[1] + 1).map((option) => {
                      return {
                        name: `${option}`
                      };
                    })}
                    onSelectionChange={(name) => {
                      setScale({
                        ...scale,
                        y: parseInt(name)
                      });
                    }}
                    action_opens_picker
                    prefix="Y "
                  />
                </Tooltip>
              </MapOptions>

              <ResolutionDetails>
                <Description>
                  업로드 해상도: {image_data.width}x{image_data.height}
                </Description>

                {selected_width && selected_height ? (
                  <Description>
                    선택 영역 해상도: {selected_width}x{selected_height}
                  </Description>
                ) : null}

                <Description>
                  출력 해상도: {output_width}x{output_height}
                </Description>

                <MapOptions style={{ marginTop: 5 }}>
                  <Description>출력 너비</Description>
                  <ResolutionInput
                    type="number"
                    min={SCALE_FACTOR}
                    max={scale_range[0] * SCALE_FACTOR}
                    step={SCALE_FACTOR}
                    value={output_width}
                    onChange={(e) => {
                      setScale({
                        ...scale,
                        x: updateScaleAxis(e.target.value, max_scale_x)
                      });
                    }}
                  />

                  <Description style={{ marginLeft: 10 }}>출력 높이</Description>
                  <ResolutionInput
                    type="number"
                    min={SCALE_FACTOR}
                    max={scale_range[1] * SCALE_FACTOR}
                    step={SCALE_FACTOR}
                    value={output_height}
                    onChange={(e) => {
                      setScale({
                        ...scale,
                        y: updateScaleAxis(e.target.value, max_scale_y)
                      });
                    }}
                  />
                </MapOptions>
              </ResolutionDetails>

              <SourceImage
                image_data={image_data}
                scale={scale}
                onBoundsChange={async (bounds) => {
                  setBounds(bounds);
                }}
                onImageDataChange={applyImageData}
                setTransformations={setTransformations}
                transformations={transformations}
              />
            </PreviewContainer>
          ) : (
            <ImageSelector
              style={{ margin: 'auto' }}
              onFileSelected={async (image_data) => {
                applyImageData(image_data);
              }}
            />
          )}

          {image_data && bounds ? (
            <>
              <Border small={is_small_screen} />

              <PreviewContainer>
                <ImagePreview
                  style={{ alignSelf: 'center' }}
                  palette={palette}
                  bounds={bounds}
                  image_data={image_data}
                  scale={scale}
                  color_spectrum={color_spectrum}
                  transformations={transformations}
                />

                <Description style={{ marginTop: 10 }}>설치 후 지도가 어떻게 보일지 미리보기입니다.</Description>

                <Tooltip
                  style={{ marginTop: 10 }}
                  direction="up"
                  tooltip={[
                    '계단식 배치(staircasing)는 남쪽 블록의 색조를 제어하기 위해 블록을 서로 다른 높이에 배치하는 방식입니다. Cartographer는 특성이 조금씩 다른 여러 계단식 배치 알고리즘을 제공합니다.',
                    '연속: y=0으로 되돌아가지 않는 연속 계단을 만듭니다. 제작은 쉬워지지만 큰 지도에서는 최대 건축 높이에 도달할 수 있습니다.',
                    '기준선: 기회가 생길 때마다 y=0으로 계속 되돌아가는 계단을 만듭니다. 더 compact한 지도가 되지만 제작은 더 어려울 수 있습니다.',
                    '경계: 지도 경계를 넘을 때를 제외하고 되돌아가지 않는 연속 계단을 선호하며, 경계를 넘을 때는 한 번만 되돌아갈 수 있습니다. 연속 방식의 장점을 대부분 유지하면서 건축 높이 제한에 도달하는 것을 방지합니다.'
                  ]}
                >
                  <Description style={{ marginRight: 10 }}>계단 알고리즘</Description>
                  <MultiButton
                    disabled={color_spectrum === pixels.BlockColorSpectrum.Flat}
                    selected={_.upperFirst(staircase_alg)}
                    action_opens_picker
                    onSelectionChange={(name) => setStaircaseAlg(name.toLowerCase() as any)}
                    actions={Object.values(generation.block_generation.StaircaseAlgorithm).map((alg) => {
                      const name = _.upperFirst(alg);
                      return {
                        name,
                        label: STAIRCASE_LABELS[name]
                      };
                    })}
                  />
                </Tooltip>

                <Tooltip
                  style={{ marginTop: 10 }}
                  direction="up"
                  tooltip={['모래처럼 지지가 필요한 블록 아래에 배치될 블록입니다.']}
                >
                  <Description style={{ marginRight: 10 }}>받침 블록</Description>
                  <MultiButton
                    selected={support_block_id}
                    action_opens_picker
                    onSelectionChange={(name) => setSupportBlockId(name)}
                    actions={[
                      {
                        name: 'minecraft:cobblestone',
                        label: utils.formatBlockName('minecraft:cobblestone')
                      },
                      {
                        name: 'minecraft:stone',
                        label: utils.formatBlockName('minecraft:stone')
                      },
                      {
                        name: 'minecraft:dirt',
                        label: utils.formatBlockName('minecraft:dirt')
                      }
                    ]}
                  />
                </Tooltip>

                <MapOptions style={{ marginTop: 10, marginBottom: 10 }}>
                  {generation_error ? <ErrorText>생성 실패</ErrorText> : null}

                  <MultiButton
                    style={{ marginRight: 10 }}
                    actions={[
                      {
                        name: 'Show materials list',
                        label: '재료 목록 보기',
                        fn: () => {
                          showMaterialsList(true);
                        }
                      }
                    ]}
                  />

                  <MultiButton
                    disabled={!image_data}
                    loading={generating}
                    actions={[
                      {
                        name: 'Generate Litematic',
                        label: 'Litematic 생성',
                        fn: () => generate('litematic')
                      },
                      {
                        name: 'Generate NBT',
                        label: 'NBT 생성',
                        fn: () => generate('nbt')
                      },
                      {
                        name: 'Generate JSON',
                        label: 'JSON 생성',
                        fn: () => generate('json')
                      }
                    ]}
                  />
                </MapOptions>
              </PreviewContainer>
            </>
          ) : null}
        </Workspace>

        <BlockList
          palette={palette}
          onChange={setPalette}
          material_counts={materialCounts}
          material_counts_loading={materialCountsLoading}
          total_used_blocks={total_used_blocks}
        />
      </Content>

      {image_data && bounds && materials_list_visible && (
        <MaterialsList
          onClose={() => {
            showMaterialsList(false);
          }}
          palette={palette}
          image_data={image_data}
          scale={scale}
          bounds={bounds}
          color_spectrum={color_spectrum}
          support_block_id={support_block_id}
          transformations={transformations}
        />
      )}
    </Container>
  );
}
