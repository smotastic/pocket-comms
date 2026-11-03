import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { ImageThumb } from './ImageThumb.js';

afterEach(cleanup);

const SRC = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

describe('ImageThumb', () => {
  it('shows the picture named by its label, linking to the full size', () => {
    render(<ImageThumb label="Image 1" src={SRC} href="/full.png" />);
    const picture = screen.getByRole('img', { name: 'Image 1' });
    expect(picture.closest('a')?.getAttribute('href')).toBe('/full.png');
    expect(picture.closest('a')?.getAttribute('target')).toBe('_blank');
  });

  it('says that it uploads', () => {
    render(<ImageThumb label="Image 1" src={SRC} state="uploading" />);
    expect(screen.getByText('Uploading…')).toBeDefined();
  });

  it('names why it failed and offers a retry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <ImageThumb label="Image 1" src={SRC} state="failed" reason="Too large" onRetry={onRetry} />,
    );
    expect(screen.getByRole('alert').textContent).toBe('Failed: Too large');

    await user.click(screen.getByRole('button', { name: 'Retry Image 1' }));

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('says that an image is no longer there, without the picture', () => {
    render(<ImageThumb label="Image 1" src={SRC} state="missing" href="/full.png" />);
    expect(screen.getByText('Removed')).toBeDefined();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('says that an image is no longer there when it does not load', () => {
    render(<ImageThumb label="Image 1" src="/gone.png" />);

    fireEvent.error(screen.getByRole('img', { name: 'Image 1' }));

    expect(screen.getByText('Removed')).toBeDefined();
  });

  it('is removed with its remove button', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<ImageThumb label="Image 2" src={SRC} onRemove={onRemove} />);

    await user.click(screen.getByRole('button', { name: 'Remove Image 2' }));

    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <div>
        <ImageThumb label="Image 1" src={SRC} href="/full.png" onRemove={() => undefined} />
        <ImageThumb label="Image 2" src={SRC} state="uploading" />
        <ImageThumb label="Image 3" state="failed" reason="Offline" onRetry={() => undefined} />
        <ImageThumb label="Image 4" state="missing" />
      </div>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
