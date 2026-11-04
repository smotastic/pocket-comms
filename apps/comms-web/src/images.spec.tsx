import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { fitWithin, keepsAsIs } from './attachments.js';
import type { TranscriptView } from './comms-client.js';
import { fakeAgent, fakeClient, renderApp } from './testing.js';

afterEach(cleanup);

// Images in the agent chat and the New task form (spec 014).

const image = (name: string) => new File(['x'], name, { type: 'image/png' });
const picker = () => document.querySelector<HTMLInputElement>('input[type="file"]');

const open = (transcript: TranscriptView = { entries: [], activity: 'Thinking…' }) => {
  const agent = fakeAgent({ status: 'idle' });
  const fake = fakeClient({
    agents: new Map([[agent.ref, agent]]),
    transcripts: new Map([[agent.ref, transcript]]),
  });
  return { ...fake, agent, ...renderApp({ client: fake.client, path: `/agents/${agent.ref}` }) };
};

const attach = async (...names: ReadonlyArray<string>) => {
  await screen.findByRole('textbox', { name: 'Message' });
  await userEvent.upload(picker() as HTMLInputElement, names.map(image));
};

describe('the sent size of an image', () => {
  it('shrinks the longer side to 2000 pixels, keeping the proportions', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(1170, 2532)).toEqual({ width: 924, height: 2000 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('keeps a small PNG as it is, and nothing else', () => {
    expect(keepsAsIs('image/png', 500_000, 1170, 2000)).toBe(true);
    expect(keepsAsIs('image/png', 2_000_000, 1170, 2000)).toBe(false);
    expect(keepsAsIs('image/png', 500_000, 2532, 1170)).toBe(false);
    expect(keepsAsIs('image/jpeg', 500_000, 800, 600)).toBe(false);
  });
});

describe('images in the conversation', () => {
  it('uploads the attached images and sends their ids with the text', async () => {
    const fake = open();

    await attach('a.png', 'b.png');
    expect(await screen.findAllByRole('img', { name: /^Image \d$/u })).toHaveLength(2);
    await userEvent.type(screen.getByRole('textbox', { name: 'Message' }), 'Why?{Enter}');

    await waitFor(() => expect(fake.calls.prompts).toEqual([[fake.agent.ref, 'Why?']]));
    expect(fake.calls.promptImages).toEqual([['image-1', 'image-2']]);
    expect(fake.calls.uploads.map((upload) => (upload as File).name)).toEqual(['a.png', 'b.png']);
    await waitFor(() => expect(screen.queryAllByRole('img', { name: /^Image/u })).toHaveLength(0));
  });

  it('sends images without text', async () => {
    const fake = open();

    await attach('a.png');
    await waitFor(() =>
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Send' }).disabled).toBe(false),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(fake.calls.promptImages).toEqual([['image-1']]));
    expect(fake.calls.prompts).toEqual([[fake.agent.ref, '']]);
  });

  it('attaches at most five and says how many were left out', async () => {
    open();

    await attach('1.png', '2.png', '3.png', '4.png');
    await userEvent.upload(picker() as HTMLInputElement, [
      image('5.png'),
      image('6.png'),
      image('7.png'),
    ]);

    expect(await screen.findByText('2 images left out: a message holds at most 5.')).toBeDefined();
    expect(screen.getAllByRole('img', { name: /^Image \d$/u })).toHaveLength(5);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Attach image' }).disabled).toBe(
      true,
    );
  });

  it('counts images still being shrunk, so no sixth can be picked meanwhile', async () => {
    open();

    await attach('slow.1.png', 'slow.2.png', 'slow.3.png', 'slow.4.png', 'slow.5.png');

    expect(screen.queryAllByRole('img', { name: /^Image \d$/u })).toHaveLength(0);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Attach image' }).disabled).toBe(
      true,
    );
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Send' }).disabled).toBe(true);
    await waitFor(() =>
      expect(screen.getAllByRole('img', { name: /^Image \d$/u })).toHaveLength(5),
    );
  });

  it('holds the send back while an upload failed, until the image is removed', async () => {
    const fake = open();
    fake.state.uploadFailure = 'The image is larger than 10 MB.';

    await attach('big.png');
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Failed: The image is larger than 10 MB.',
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Message' }), 'Look');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Send' }).disabled).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Remove Image 1' }));

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Send' }).disabled).toBe(false);
  });

  it('uploads a failed image again on retry', async () => {
    const fake = open();
    fake.state.uploadFailure = 'Offline';

    await attach('a.png');
    await userEvent.click(await screen.findByRole('button', { name: 'Retry Image 1' }));

    await waitFor(() => expect(fake.calls.uploads).toHaveLength(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says that a file cannot be read and attaches nothing', async () => {
    const fake = open();

    await attach('broken.png');

    expect(await screen.findByText('broken.png cannot be read as an image.')).toBeDefined();
    expect(fake.calls.uploads).toEqual([]);
  });

  it('keeps the text and the images when the send fails', async () => {
    const fake = open();
    fake.state.promptFailure = 'The agent did not take the input';

    await attach('a.png');
    await userEvent.type(screen.getByRole('textbox', { name: 'Message' }), 'Look{Enter}');

    expect(await screen.findByText('The agent did not take the input')).toBeDefined();
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Message' }).value).toBe(
      'Look',
    );
    expect(screen.getAllByRole('img', { name: 'Image 1' })).toHaveLength(1);
  });

  it("shows a sent prompt's images as thumbnails linking to the full size", async () => {
    open({
      entries: [{ type: 'user', id: 'u1', at: 1, text: 'Look', images: ['abc', 'def'] }],
      activity: 'Thinking…',
    });

    const card = (await screen.findByText('Look')).parentElement as HTMLElement;
    const pictures = within(card).getAllByRole('img');

    expect(pictures.map((picture) => picture.getAttribute('src'))).toEqual([
      '/api/v1/images/abc',
      '/api/v1/images/def',
    ]);
    expect(pictures[0]?.closest('a')?.getAttribute('href')).toBe('/api/v1/images/abc');
  });
});

describe('images in the New task form', () => {
  const at = { path: '/projects/pocket-home' };

  const openSheet = async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'New task' }));
    return screen.findByRole('dialog', { name: 'New task' });
  };

  it("sends the uploaded images with the agent's task", async () => {
    const fake = fakeClient();
    renderApp({ client: fake.client, ...at });
    const sheet = await openSheet();

    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Task' }), 'Fix the header');
    await userEvent.upload(picker() as HTMLInputElement, [image('shot.png')]);
    await within(sheet).findByRole('img', { name: 'Image 1' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(fake.calls.tasks).toEqual([
        {
          project: 'pocket-home',
          task: 'Fix the header',
          branch: 'fix/the-header',
          agent: { kind: 'claude' },
          imageIds: ['image-1'],
        },
      ]),
    );
  });

  it('keeps and sends the images when the agent is switched off, so the server refuses them', async () => {
    const fake = fakeClient();
    renderApp({ client: fake.client, ...at });
    const sheet = await openSheet();

    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Task' }), 'Fix the header');
    await userEvent.upload(picker() as HTMLInputElement, [image('shot.png')]);
    await within(sheet).findByRole('img', { name: 'Image 1' });
    await userEvent.click(within(sheet).getByRole('switch', { name: 'Start an agent' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Create' }));

    expect(within(sheet).getByRole('img', { name: 'Image 1' })).toBeDefined();
    await waitFor(() => expect(fake.calls.tasks[0]?.imageIds).toEqual(['image-1']));
    expect(fake.calls.tasks[0]?.agent).toBeUndefined();
  });

  it('offers no images for a task without an agent', async () => {
    renderApp({ client: fakeClient().client, ...at });
    const sheet = await openSheet();

    await userEvent.click(within(sheet).getByRole('switch', { name: 'Start an agent' }));

    expect(within(sheet).queryByRole('button', { name: 'Attach image' })).toBeNull();
  });
});
