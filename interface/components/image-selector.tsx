import styled from 'styled-components';
import * as utils from '../utils';
import * as React from 'react';

const Container = styled.div<{ dragging: boolean }>`
  display: flex;
  flex-direction: column;
  border: 2px dashed ${(props) => (props.dragging ? props.theme['dark-blue'] : props.theme['dark-purple'])};
  align-items: center;
  justify-content: center;
  padding: 20px;
`;

const Content = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Error = styled.p`
  color: ${(props) => props.theme['light-red']};
  border: 2px dashed ${(props) => props.theme['dark-red']};
  font-weight: bold;
  padding: 10px;
  max-width: 300px;
  margin-top: 20px;
`;

const Text = styled.p`
  color: ${(props) => props.theme.fg2};
  font-weight: bold;
`;

const SelectButton = styled.div`
  display: flex;
  padding: 5px;
  cursor: pointer;
  color: ${(props) => props.theme['light-yellow']};
  background-color: ${(props) => props.theme.bg4};
  transition: all 0.1s ease;

  :hover {
    opacity: 0.8;
  }
`;

type Props = {
  style?: React.CSSProperties;
  onFileSelected: (image_data: ImageData) => void;
};

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGE_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 8192;
const MAX_IMAGE_PIXELS = MAX_IMAGE_DIMENSION * MAX_IMAGE_DIMENSION;

const validateImageFile = (file: File) => {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return '지원하지 않는 이미지 형식입니다. PNG, JPG, WEBP 이미지만 사용할 수 있습니다.';
  }

  if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
    return '이미지 파일이 너무 큽니다. 20MB 이하의 이미지를 사용해 주세요.';
  }

  return '';
};

export const ImageSelector: React.FC<Props> = (props) => {
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleFile = async (file: File) => {
    const file_error = validateImageFile(file);
    if (file_error) {
      setError(file_error);
      return;
    }

    let image_data: ImageData;
    try {
      image_data = await utils.extractImageDataFromFile(file);
    } catch (err) {
      setError('이미지를 읽을 수 없습니다. 다른 이미지 파일을 사용해 주세요.');
      return;
    }

    if (
      image_data.width > MAX_IMAGE_DIMENSION ||
      image_data.height > MAX_IMAGE_DIMENSION ||
      image_data.width * image_data.height > MAX_IMAGE_PIXELS
    ) {
      setError('이미지 해상도가 너무 큽니다. 8192x8192 이하의 이미지를 사용해 주세요.');
      return;
    }

    if (image_data.width < 128 || image_data.height < 128) {
      setError(
        `제공된 이미지가 너무 작습니다. 최소 128x128 픽셀 이상의 이미지를 선택해야 합니다. 제공된 이미지 크기: ${image_data.width}x${image_data.height} 픽셀`
      );
      return;
    }

    setError('');
    props.onFileSelected(image_data);
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    handleFile(file);
  };

  React.useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const file = e.clipboardData?.files[0];
      if (!file) {
        return;
      }
      handleFile(file);
    };
    document.addEventListener('paste', handler);
    return () => {
      document.removeEventListener('paste', handler);
    };
  }, []);

  const selectFile = () => {
    document.getElementById('file-selector')?.click();
  };

  return (
    <Container
      style={props.style}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(true);
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (!file) {
          return;
        }
        handleFile(file);
      }}
      dragging={dragging}
    >
      <Content>
        <Text>이미지를 드롭하거나 붙여넣거나</Text>

        <SelectButton style={{ marginLeft: 10, marginRight: 10 }} onClick={selectFile}>
          선택
        </SelectButton>

        <Text>하세요</Text>
      </Content>

      {!!error && <Error>{error}</Error>}

      <input
        type="file"
        id="file-selector"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />
    </Container>
  );
};

export default ImageSelector;
