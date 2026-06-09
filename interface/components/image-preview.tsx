import { Transformations } from '../workers/api.worker';
import * as pixels from '@cartographer/pixels';
import styled from 'styled-components';
import * as hooks from '../hooks';
import * as utils from '../utils';
import * as defs from '../defs';
import * as React from 'react';
import * as async from 'async';
import Loader from './loader';

type Props = {
  image_data: ImageData;
  scale: defs.Scale;
  bounds: defs.Bounds;
  color_spectrum: pixels.BlockColorSpectrum;

  transformations: Transformations;

  palette: defs.ColorPalette;

  className?: string;
  style?: React.CSSProperties;
};

const Container = styled.div`
  position: relative;
  display: flex;
  padding: 10px;
  align-items: center;
  justify-content: center;
  border: 2px dashed ${(props) => props.theme['dark-green']};
  background-color: ${(props) => props.theme.bg1};
  background-image: linear-gradient(45deg, ${(props) => props.theme.bg2} 25%, transparent 25%),
    linear-gradient(-45deg, ${(props) => props.theme.bg2} 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, ${(props) => props.theme.bg2} 75%),
    linear-gradient(-45deg, transparent 75%, ${(props) => props.theme.bg2} 75%);
  background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
  background-size: 16px 16px;
`;

const Canvas = styled.canvas`
  border: 1px solid ${(props) => props.theme.bg2};
`;

const LoadingContainer = styled.div`
  position: absolute;
  left 10px;
  top: 15px;
`;

const createPreviewQueue = () => {
  return async.cargoQueue(async (tasks: Array<() => Promise<void>>, done) => {
    const last_task = tasks[tasks.length - 1];
    try {
      await last_task();
    } catch (err) {}
    done();
  });
};

export const ImagePreview: React.FC<Props> = (props) => {
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const queue = React.useRef(createPreviewQueue());
  const api = hooks.withAPIWorker();

  const [[width, height], setDimensions] = React.useState([0, 0]);

  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!canvas.current || !api.current) {
      return;
    }

    queue.current.push(async () => {
      setLoading(true);
      const image_data = await api.current!.generatePreview({
        image_data: props.image_data,
        bounds: props.bounds,
        scale: props.scale,
        color_spectrum: props.color_spectrum,
        palette: utils.normalizeColorPalette(props.palette),
        transformations: props.transformations
      });

      canvas.current!.setAttribute('width', image_data.width.toString());
      canvas.current!.setAttribute('height', image_data.height.toString());
      canvas.current!.getContext('2d')!.putImageData(image_data, 0, 0);

      setDimensions([image_data.width, image_data.height]);
      setLoading(false);
    });
  }, [
    props.image_data,
    canvas.current,
    api.current,
    props.bounds,
    props.palette,
    props.scale,
    props.transformations.brightness,
    props.transformations.saturation,
    props.transformations.dither,
    props.transformations.remove_background,
    props.transformations.background_color,
    props.transformations.background_tolerance,
    props.transformations.background_feather,
    props.color_spectrum
  ]);

  return (
    <Container
      className={props.className}
      style={{
        ...props.style,
        width,
        height
      }}
    >
      <LoadingContainer>{loading ? <Loader /> : null}</LoadingContainer>
      <Canvas ref={canvas} />
    </Container>
  );
};

export default ImagePreview;
