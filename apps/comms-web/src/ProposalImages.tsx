import { Checkbox, ImageThumb, Inline, Stack, Text } from '@smotastic/pocket-design';
import { MISSING } from './AttachedImages.js';

/** At most this many images go with one proposal (spec 023, requirement 9). */
export const MAX_PROPOSAL_IMAGES = 5;

/** A image of the brainstorm chat, by its number, and where it is served. */
export interface BrainstormImage {
  readonly id: string;
  readonly number: number;
  /** The app still keeps the image, so it can go to Gitea. */
  readonly available: boolean;
  readonly src: string;
}

/** The chat image as a thumbnail that opens it at full size. */
export const BrainstormImageThumb = ({ image }: { readonly image: BrainstormImage }) => (
  <ImageThumb
    label={`Image ${image.number}`}
    src={image.src}
    href={image.src}
    missingText={MISSING}
    {...(image.available ? {} : { state: 'missing' as const, status: MISSING })}
  />
);

/** The chosen ids in the order of the images' numbers. */
export const inNumberOrder = (
  images: ReadonlyArray<BrainstormImage>,
  chosen: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  images.filter((image) => chosen.includes(image.id)).map((image) => image.id);

/**
 * The chat images of an open proposal, each with a checkbox. A removed image cannot be
 * checked, and no more than `MAX_PROPOSAL_IMAGES` can be.
 */
export const ImageChoice = ({
  images,
  chosen,
  onChange,
  disabled = false,
}: {
  readonly images: ReadonlyArray<BrainstormImage>;
  readonly chosen: ReadonlyArray<string>;
  readonly onChange: (chosen: ReadonlyArray<string>) => void;
  readonly disabled?: boolean;
}) => {
  if (images.length === 0) return null;
  const full = chosen.length >= MAX_PROPOSAL_IMAGES;
  return (
    <Stack gap="xs">
      <Text tone="muted" size="sm">
        Images
      </Text>
      <Inline gap="sm" wrap>
        {images.map((image) => {
          const checked = chosen.includes(image.id);
          return (
            <Stack key={image.id} gap="xs">
              <BrainstormImageThumb image={image} />
              <Checkbox
                label={`Attach image ${image.number}`}
                isSelected={checked}
                isDisabled={disabled || !image.available || (full && !checked)}
                onChange={(selected) =>
                  onChange(
                    selected
                      ? inNumberOrder(images, [...chosen, image.id])
                      : chosen.filter((id) => id !== image.id),
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

/** The images that went along with a decided proposal, as thumbnails. */
export const ProposalAttachedImages = ({
  images,
  attached,
}: {
  readonly images: ReadonlyArray<BrainstormImage>;
  readonly attached: ReadonlyArray<{ readonly image: string }>;
}) => {
  const shown = images.filter((image) => attached.some((done) => done.image === image.id));
  return shown.length === 0 ? null : (
    <Inline gap="xs" wrap>
      {shown.map((image) => (
        <BrainstormImageThumb key={image.id} image={image} />
      ))}
    </Inline>
  );
};
