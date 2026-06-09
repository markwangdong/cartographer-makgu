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

const ColorInput = styled.input`
  background: ${(props) => props.theme.bg2};
  border: 1px dashed ${(props) => props.theme.fg3};
  margin-right: 8px;
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

const hexToRgb = (hex: string) => {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
};

const rgbToHex = (rgb: { r: number; g: number; b: number }) => {
  return `#${[rgb.r, rgb.g, rgb.b].map((value) => clamp(value, 0, 255).toString(16).padStart(2, '0')).join('')}`;
};

const averageCornerColor = (image_data: ImageData, bounds?: defs.Bounds) => {
  const [x, y, dx, dy] = bounds || [0, 0, image_data.width, image_data.height];
  const coords = [
    [x, y],
    [x + dx - 1, y],
    [x, y + dy - 1],
    [x + dx - 1, y + dy - 1]
  ];

  const colors = coords.map(([raw_x, raw_y]) => {
    const px = clamp(Math.floor(raw_x), 0, image_data.width - 1);
    const py = clamp(Math.floor(raw_y), 0, image_data.height - 1);
    const i = py * image_data.width * 4 + px * 4;
    return {
      r: image_data.data[i],
      g: image_data.data[i + 1],
      b: image_data.data[i + 2]
    };
  });

  return {
    r: Math.round(_.meanBy(colors, 'r')),
    g: Math.round(_.meanBy(colors, 'g')),
    b: Math.round(_.meanBy(colors, 'b'))
  };
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
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const select_full_image_after_image_change = React.useRef(false);
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

  const getScaledBounds = (bounds: defs.Bounds) => {
    return bounds.map((item) => Math.floor(item * scale_factor)) as defs.Bounds;
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
    const bounds: defs.Bounds = select_full_image_after_image_change.current
      ? [0, 0, Math.floor(width), Math.floor(height)]
      : [0, 0, min_x, min_y];
    select_full_image_after_image_change.current = false;
    setBounds(bounds);
    scaleAndNotify(bounds);
  }, [props.image_data, min_x, min_y]);

  const selected_width = bounds ? Math.floor(bounds[2] * scale_factor) : undefined;
  const selected_height = bounds ? Math.floor(bounds[3] * scale_factor) : undefined;
  const output_width = props.scale.x * constants.SCALE_FACTOR;
  const output_height = props.scale.y * constants.SCALE_FACTOR;
  const background_color = props.transformations.background_color || { r: 255, g: 255, b: 255 };
  const background_tolerance = props.transformations.background_tolerance ?? 32;
  const background_feather = props.transformations.background_feather ?? 12;

  return (
    <Container>
      <CanvasContainer>
        <Canvas ref={canvas} style={{ width, height }} />

        {bounds ? (
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
          label="Saturation"
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
          label="Brightness"
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
            label="Enable dithering"
            label_side="left"
            tooltip={[
              "Enabling dithering will introduce some intentional noise to the image with the aim of keeping as much of the original images' color as possible.",
              'This has varying levels of success depending on the input image and scaling/zooming applied. It is recommended to play with the image saturation when enabling this.',
              'Your milage may vary.'
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
        <Description>Photo Edit</Description>

        <EditRow>
          <Description>
            Uploaded: {props.image_data.width}x{props.image_data.height}
          </Description>
          {selected_width && selected_height ? (
            <Description>
              Selection: {selected_width}x{selected_height}
            </Description>
          ) : null}
          <Description>
            Output: {output_width}x{output_height}
          </Description>
        </EditRow>

        <EditRow>
          <EditButton onClick={resetCrop}>Reset crop</EditButton>
          <EditButton onClick={centerCrop}>Center crop</EditButton>
          <EditButton onClick={applyImageCrop}>Apply crop</EditButton>
          <Description>Apply crop replaces the uploaded image with the selected area.</Description>
        </EditRow>

        <EditRow>
          <CheckBox
            style={{ marginRight: 10 }}
            label="Enable background removal"
            label_side="left"
            value={!!props.transformations.remove_background}
            onChange={(value) => {
              props.setTransformations({
                ...props.transformations,
                remove_background: value,
                background_color,
                background_tolerance,
                background_feather
              });
            }}
          />
          <Description>Removed background becomes transparent and will not place blocks.</Description>
        </EditRow>

        <EditRow>
          <Description>Background color</Description>
          <ColorInput
            type="color"
            value={rgbToHex(background_color)}
            onChange={(e) => {
              props.setTransformations({
                ...props.transformations,
                background_color: hexToRgb(e.target.value)
              });
            }}
          />
          <EditButton
            onClick={() => {
              props.setTransformations({
                ...props.transformations,
                background_color: averageCornerColor(props.image_data, bounds ? getScaledBounds(bounds) : undefined)
              });
            }}
          >
            Auto pick from corners
          </EditButton>
        </EditRow>

        <EditRow>
          <Description>Tolerance</Description>
          <NumberInput
            type="number"
            min={0}
            max={255}
            disabled={!props.transformations.remove_background}
            value={background_tolerance}
            onChange={(e) => {
              props.setTransformations({
                ...props.transformations,
                background_tolerance: clamp(parseInt(e.target.value, 10) || 0, 0, 255)
              });
            }}
          />

          <Description>Feather</Description>
          <NumberInput
            type="number"
            min={0}
            max={128}
            disabled={!props.transformations.remove_background}
            value={background_feather}
            onChange={(e) => {
              props.setTransformations({
                ...props.transformations,
                background_feather: clamp(parseInt(e.target.value, 10) || 0, 0, 128)
              });
            }}
          />
        </EditRow>
      </EditPanel>
    </Container>
  );
};

export default SourceImage;
