import { Checkbox, ImageThumb, Inline, Stack, Text } from '@smotastic/pocket-design';
import { MISSING } from './AttachedImages.js';

/** At most this many pictures go with one proposal (spec 023, requirement 9). */
export const MAX_PROPOSAL_PICTURES = 5;

/** A picture of the brainstorm chat, by its number, and where it is served. */
export interface ChatPicture {
  readonly id: string;
  readonly number: number;
  /** The app still keeps the picture, so it can go to Gitea. */
  readonly available: boolean;
  readonly src: string;
}

/** The chat picture as a thumbnail that opens it at full size. */
export const PictureThumb = ({ picture }: { readonly picture: ChatPicture }) => (
  <ImageThumb
    label={`Picture ${picture.number}`}
    src={picture.src}
    href={picture.src}
    missingText={MISSING}
    {...(picture.available ? {} : { state: 'missing' as const, status: MISSING })}
  />
);

/** The chosen ids in the order of the pictures' numbers. */
export const inNumberOrder = (
  pictures: ReadonlyArray<ChatPicture>,
  chosen: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  pictures.filter((picture) => chosen.includes(picture.id)).map((picture) => picture.id);

/**
 * The chat pictures of an open proposal, each with a checkbox. A removed picture cannot be
 * checked, and no more than `MAX_PROPOSAL_PICTURES` can be.
 */
export const PictureChoice = ({
  pictures,
  chosen,
  onChange,
  disabled = false,
}: {
  readonly pictures: ReadonlyArray<ChatPicture>;
  readonly chosen: ReadonlyArray<string>;
  readonly onChange: (chosen: ReadonlyArray<string>) => void;
  readonly disabled?: boolean;
}) => {
  if (pictures.length === 0) return null;
  const full = chosen.length >= MAX_PROPOSAL_PICTURES;
  return (
    <Stack gap="xs">
      <Text tone="muted" size="sm">
        Pictures
      </Text>
      <Inline gap="sm" wrap>
        {pictures.map((picture) => {
          const checked = chosen.includes(picture.id);
          return (
            <Stack key={picture.id} gap="xs">
              <PictureThumb picture={picture} />
              <Checkbox
                label={`Attach picture ${picture.number}`}
                isSelected={checked}
                isDisabled={disabled || !picture.available || (full && !checked)}
                onChange={(selected) =>
                  onChange(
                    selected
                      ? inNumberOrder(pictures, [...chosen, picture.id])
                      : chosen.filter((id) => id !== picture.id),
                  )
                }
              />
            </Stack>
          );
        })}
      </Inline>
    </Stack>
  );
};

/** The pictures that went along with a decided proposal, as thumbnails. */
export const AttachedPictures = ({
  pictures,
  attached,
}: {
  readonly pictures: ReadonlyArray<ChatPicture>;
  readonly attached: ReadonlyArray<{ readonly image: string }>;
}) => {
  const shown = pictures.filter((picture) => attached.some((done) => done.image === picture.id));
  return shown.length === 0 ? null : (
    <Inline gap="xs" wrap>
      {shown.map((picture) => (
        <PictureThumb key={picture.id} picture={picture} />
      ))}
    </Inline>
  );
};
