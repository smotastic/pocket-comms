import { useRef, type ChangeEvent } from 'react';
import { IconButton } from '../icon-button/IconButton.js';
import hidden from '../visually-hidden.module.css';

export type AttachButtonProps = {
  /** Names the button, such as "Attach image". */
  readonly label: string;
  /** Called with the files the user picked, in the picker's order. */
  readonly onFiles: (files: ReadonlyArray<File>) => void;
  /** Which files the picker offers. Default images. */
  readonly accept?: string;
  /** Lets the user pick several files at once. Default true. */
  readonly multiple?: boolean;
  readonly disabled?: boolean;
};

/**
 * An icon button that opens the device's file picker; on a phone it offers the photo library,
 * the camera and the files.
 */
export const AttachButton = ({
  label,
  onFiles,
  accept = 'image/*',
  multiple = true,
  disabled = false,
}: AttachButtonProps) => {
  const input = useRef<HTMLInputElement>(null);
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    // Cleared, so picking the same file again is a change too.
    event.target.value = '';
    if (files.length > 0) onFiles(files);
  };
  return (
    <>
      <IconButton
        icon="image"
        label={label}
        disabled={disabled}
        onClick={() => input.current?.click()}
      />
      <input
        ref={input}
        type="file"
        className={hidden.visuallyHidden}
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        onChange={onChange}
      />
    </>
  );
};
