import { Transformations } from '../workers/api.worker';
import * as overlay from './selection-overlay';
import * as constants from '../constants';
import styled from 'styled-components';
import * as hooks from '../hooks';
import * as defs from '../defs';
import * as React from 'react';
import Slider from './slider';
import * as _ from 'lodash';

import CheckBox from './check-box';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: stretch;
`;

const CanvasContainer = styled.div`
  display: flex;
  flex-grow: 1;
  position: relative;
  padding: 10px;
  border: 2px dashed ${(props) => props.theme.bg4};
`;

const Canvas = styled.canvas`
  border: 1px solid ${(props) => props.theme.bg2};
  background-color: ${(props) => props.theme.bg1};
  background-image: linear-gradient(45deg, ${(props) => props.theme.bg2} 25%, transparent 25%),
    linear-gradient(-45deg, ${(props) => props.theme.bg2} 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, ${(props) => props.theme.bg2} 75%),
    linear-gradient(-45deg, transparent 75%, ${(props) => props.theme.bg2} 75%);
  background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
  background-size: 16px 16px;
`;

const Options = styled.div`
  display: flex;
  flex-direction: row;
  flex-grow: 1;
`;

const EditPanel = styled.div`
  display: flex;
  flex-direction: column;
  margin-top: 10px;
  padding: 10px;
  border: 2px dashed ${(props) => props.theme.bg4};
`;

const EditRow = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 8px;
`;

const Description = styled.p`
  color: ${(props) => props.theme.fg2};
  margin-right: 10px;
`;

const EditButton = styled.button`
  color: ${(props) => props.theme.fg2};
  background: ${(props) => props.theme.bg2};
  border: 1px dashed ${(props) => props.theme.fg3};
  padding: 3px 7px;
  margin-right: 8px;
  cursor: pointer;
`;

const NumberInput = styled.input`
  width: 60px;
  color: ${(props) => props.theme.fg2};
  background: ${(props) => props.theme.bg2};
  border: 1px dashed ${(props) => props.theme.fg3};
  margin-right: 10px;
  padding: 2px;
`;

type Props = {
  image_data: ImageData;
  scale: defs.Scale;
  onBoundsChange: (bounds: defs.Bounds, raw_bounds: defs.Bounds) => void;
  onImageDataChange: (image_data: ImageData) => void;

  transformations: Transformations;
  setTransformations: (transformations: Transformations) => void;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const colorDistance = (data: Uint8ClampedArray, index: number, target: { r: number; g: number; b: number }) => {
  return Math.sqrt(
    Math.pow(data[index] - target.r, 2) +
      Math.pow(data[index + 1] - target.g, 2) +
      Math.pow(data[index + 2] - target.b, 2)
  );
};

export const eraseConnectedColorRegion = (
  image_data: ImageData,
  start_x: number,
  start_y: number,
  tolerance: number,
  feather: number
): ImageData => {
  const width = image_data.width;
  const height = image_data.height;
  const x = clamp(Math.floor(start_x), 0, width - 1);
  const y = clamp(Math.floor(start_y), 0, height - 1);
  const data = new Uint8ClampedArray(image_data.data);
  const start_index = y * width * 4 + x * 4;

  if (data[start_index + 3] <= 0) {
    return new ImageData(data, width, height);
  }

  const target = {
    r: data[start_index],
    g: data[start_index + 1],
    b: data[start_index + 2]
  };
  const threshold = clamp(tolerance, 0, 255) + clamp(feather, 0, 128);
  const visited = new Uint8Array(width * height);
  const stack = [y * width + x];

  while (stack.length) {
    const offset = stack.pop()!;
    if (visited[offset]) {
      continue;
    }
    visited[offset] = 1;

    const px = offset % width;
    const py = Math.floor(offset / width);
    const index = offset * 4;
    if (data[index + 3] <= 0 || colorDistance(data, index, target) > threshold) {
      continue;
    }

    data[index + 3] = 0;

    if (px > 0) {
      stack.push(offset - 1);
    }
    if (px < width - 1) {
      stack.push(offset + 1);
    }
    if (py > 0) {
      stack.push(offset - width);
    }
    if (py < height - 1) {
      stack.push(offset + width);
    }
  }

  return new ImageData(data, width, height);
};

const cropImageData = (image_data: ImageData, bounds: defs.Bounds, scale_factor: number): ImageData => {
  const [raw_x, raw_y, raw_dx, raw_dy] = bounds;
  const x = clamp(Math.floor(raw_x * scale_factor), 0, image_data.width - 1);
  const y = clamp(Math.floor(raw_y * scale_factor), 0, image_data.height - 1);
  const dx = clamp(Math.floor(raw_dx * scale_factor), 1, image_data.width - x);
  const dy = clamp(Math.floor(raw_dy * scale_factor), 1, image_data.height - y);

  const source_canvas = document.createElement('canvas');
  source_canvas.width = image_data.width;
  source_canvas.height = image_data.height;
  source_canvas.getContext('2d')!.putImageData(image_data, 0, 0);

  const target_canvas = document.createElement('canvas');
  target_canvas.width = dx;
  target_canvas.height = dy;
  const target_context = target_canvas.getContext('2d')!;
  target_context.drawImage(source_canvas, x, y, dx, dy, 0, 0, dx, dy);

  return target_context.getImageData(0, 0, dx, dy);
};

export const SourceImage: React.FC<Props> = (props) => {
  const [bounds, setBounds] = React.useState<defs.Bounds>();
  const [background_erase_mode, setBackgroundEraseMode] = React.useState(false);
  const [background_tolerance, setBackgroundTolerance] = React.useState(32);
  const [background_feather, setBackgroundFeather] = React.useState(12);
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const select_full_image_after_image_change = React.useRef(false);
  const preserve_bounds_after_image_change = React.useRef<defs.Bounds>();
  const api = hooks.withAPIWorker();

  const ratio_xy = props.image_data.height / props.image_data.width;
  const ratio_yx = props.image_data.width / props.image_data.height;

  let width: number, height: number, scale_factor: number;
  if (props.image_data.height > props.image_data.width) {
    height = constants.RENDER_IMAGE_MAX_SIZE;
    width = height * ratio_yx;
    scale_factor = props.image_data.height / height;
  } else {
    width = constants.RENDER_IMAGE_MAX_SIZE;
    height = width * ratio_xy;
    scale_factor = props.image_data.width / width;
  }

  const min_x = Math.min(Math.floor(width), Math.ceil((props.scale.x * constants.SCALE_FACTOR) / scale_factor));
  const min_y = Math.min(Math.floor(height), Math.ceil((props.scale.y * constants.SCALE_FACTOR) / scale_factor));

  const scaleAndNotify = (bounds: defs.Bounds) => {
    const scaled_bounds = bounds.map((item) => Math.floor(item * scale_factor)) as defs.Bounds;
    props.onBoundsChange(scaled_bounds, bounds);
  };

  const scaleAndNotifyDebounced = React.useCallback(_.debounce(scaleAndNotify, 100, { maxWait: 200 }), [
    props.image_data,
    props.scale
  ]);

  const updateBounds = (bounds: defs.Bounds) => {
    setBounds(bounds);
    scaleAndNotifyDebounced(bounds);
  };

  const applyBounds = (bounds: defs.Bounds) => {
    setBounds(bounds);
    scaleAndNotify(bounds);
  };

  const resetCrop = () => {
    applyBounds([0, 0, Math.floor(width), Math.floor(height)]);
  };

  const centerCrop = () => {
    const target_ratio = props.scale.x / props.scale.y;
    const image_ratio = width / height;
    let next_width = width;
    let next_height = height;

    if (image_ratio > target_ratio) {
      next_width = height * target_ratio;
    } else {
      next_height = width / target_ratio;
    }

    next_width = Math.max(min_x, Math.min(width, next_width));
    next_height = Math.max(min_y, Math.min(height, next_height));

    applyBounds([
      Math.floor((width - next_width) / 2),
      Math.floor((height - next_height) / 2),
      Math.floor(next_width),
      Math.floor(next_height)
    ]);
  };

  const applyImageCrop = () => {
    if (!bounds) {
      return;
    }

    scaleAndNotifyDebounced.cancel();
    const image_data = cropImageData(props.image_data, bounds, scale_factor);
    select_full_image_after_image_change.current = true;
    props.onImageDataChange(image_data);
  };

  const eraseBackgroundAtClick = (event: React.MouseEvent) => {
    if (!background_erase_mode || !canvas.current) {
      return;
    }

    const rect = canvas.current.getBoundingClientRect();
    const canvas_x = event.clientX - rect.left;
    const canvas_y = event.clientY - rect.top;
    if (canvas_x < 0 || canvas_y < 0 || canvas_x > rect.width || canvas_y > rect.height) {
      return;
    }

    scaleAndNotifyDebounced.cancel();
    const image_x = clamp(Math.floor(canvas_x * scale_factor), 0, props.image_data.width - 1);
    const image_y = clamp(Math.floor(canvas_y * scale_factor), 0, props.image_data.height - 1);
    const next_image_data = eraseConnectedColorRegion(
      props.image_data,
      image_x,
      image_y,
      background_tolerance,
      background_feather
    );
    preserve_bounds_after_image_change.current = bounds;
    props.onImageDataChange(next_image_data);
  };

  React.useEffect(() => {
    (async () => {
      if (!canvas.current || !api.current) {
        return;
      }

      const scale_canvas = new OffscreenCanvas(props.image_data.width, props.image_data.height);
      const scale_context = scale_canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;

      scale_context.putImageData(props.image_data, 0, 0);

      canvas.current.setAttribute('width', width.toString());
      canvas.current.setAttribute('height', height.toString());

      const context = canvas.current.getContext('2d')!;
      context.drawImage(scale_canvas, 0, 0, width, height);
    })();
  }, [props.image_data, api.current]);

  React.useEffect(() => {
    const preserved_bounds = preserve_bounds_after_image_change.current;
    const bounds: defs.Bounds = select_full_image_after_image_change.current
      ? [0, 0, Math.floor(width), Math.floor(height)]
      : preserved_bounds
      ? [
          clamp(preserved_bounds[0], 0, Math.floor(width) - preserved_bounds[2]),
          clamp(preserved_bounds[1], 0, Math.floor(height) - preserved_bounds[3]),
          preserved_bounds[2],
          preserved_bounds[3]
        ]
      : [0, 0, min_x, min_y];
    select_full_image_after_image_change.current = false;
    preserve_bounds_after_image_change.current = undefined;
    setBounds(bounds);
    scaleAndNotify(bounds);
  }, [props.image_data, min_x, min_y]);

  const selected_width = bounds ? Math.floor(bounds[2] * scale_factor) : undefined;
  const selected_height = bounds ? Math.floor(bounds[3] * scale_factor) : undefined;
  const output_width = props.scale.x * constants.SCALE_FACTOR;
  const output_height = props.scale.y * constants.SCALE_FACTOR;

  return (
    <Container>
      <CanvasContainer onClick={eraseBackgroundAtClick}>
        <Canvas ref={canvas} style={{ width, height, cursor: background_erase_mode ? 'crosshair' : undefined }} />

        {bounds && !background_erase_mode ? (
          <overlay.SelectionOverlay
            bounds={bounds}
            scale={props.scale}
            min_x={min_x}
            min_y={min_y}
            onBoundsChange={updateBounds}
            canvas_dimensions={[width, height]}
          />
        ) : null}
      </CanvasContainer>

      <Options>
        <Slider
          label="채도"
          style={{ marginTop: 10, marginRight: 15 }}
          value={props.transformations.saturation || 0}
          onChange={(value) => {
            props.setTransformations({
              ...props.transformations,
              saturation: value
            });
          }}
        />

        <Slider
          label="밝기"
          style={{ marginTop: 10 }}
          value={props.transformations.brightness || 0}
          onChange={(value) => {
            props.setTransformations({
              ...props.transformations,
              brightness: value
            });
          }}
        />
      </Options>

      <Options>
        <div>
          <CheckBox
            style={{ marginTop: 5 }}
            label="디더링 사용"
            label_side="left"
            tooltip={[
              '디더링을 켜면 원본 이미지의 색상을 최대한 유지하기 위해 의도적인 노이즈가 이미지에 추가됩니다.',
              '입력 이미지와 적용된 스케일/확대에 따라 결과가 달라질 수 있습니다. 이 옵션을 켤 때는 이미지 채도도 함께 조정해 보는 것이 좋습니다.',
              '결과는 달라질 수 있습니다.'
            ]}
            value={!!props.transformations.dither}
            onChange={(value) => {
              props.setTransformations({
                ...props.transformations,
                dither: value
              });
            }}
          />
        </div>
      </Options>

      <EditPanel>
        <Description>사진 편집</Description>

        <EditRow>
          <Description>
            업로드됨: {props.image_data.width}x{props.image_data.height}
          </Description>
          {selected_width && selected_height ? (
            <Description>
              선택 영역: {selected_width}x{selected_height}
            </Description>
          ) : null}
          <Description>
            출력: {output_width}x{output_height}
          </Description>
        </EditRow>

        <EditRow>
          <EditButton onClick={resetCrop}>자르기 초기화</EditButton>
          <EditButton onClick={centerCrop}>가운데로 자르기</EditButton>
          <EditButton onClick={applyImageCrop}>자르기 적용</EditButton>
          <Description>자르기를 적용하면 업로드된 이미지가 선택 영역으로 대체됩니다.</Description>
        </EditRow>

        <EditRow>
          <CheckBox
            style={{ marginRight: 10 }}
            label="배경 지우기 모드 사용"
            label_side="left"
            value={background_erase_mode}
            onChange={setBackgroundEraseMode}
          />
          <Description>원본 이미지를 클릭하면 연결된 배경 영역을 지웁니다.</Description>
          <Description>투명 픽셀에는 블록이 배치되지 않습니다.</Description>
        </EditRow>

        <EditRow>
          <Description>허용 오차</Description>
          <NumberInput
            type="number"
            min={0}
            max={255}
            disabled={!background_erase_mode}
            value={background_tolerance}
            onChange={(e) => {
              setBackgroundTolerance(clamp(parseInt(e.target.value, 10) || 0, 0, 255));
            }}
          />

          <Description>가장자리 부드럽게</Description>
          <NumberInput
            type="number"
            min={0}
            max={128}
            disabled={!background_erase_mode}
            value={background_feather}
            onChange={(e) => {
              setBackgroundFeather(clamp(parseInt(e.target.value, 10) || 0, 0, 128));
            }}
          />
        </EditRow>
      </EditPanel>
    </Container>
  );
};

export default SourceImage;
