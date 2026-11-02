import { useEffect, useRef, type RefObject } from 'react';

// How close to the end, in pixels, still counts as reading the end.
const END_SLACK = 32;

/**
 * Fits a fixed element to the visual viewport. A phone's keyboard shrinks the visual viewport
 * only; the element follows it, so what sits at its bottom stays in view above the keyboard.
 */
export const useFitVisualViewport = (ref: RefObject<HTMLElement | null>) => {
  useEffect(() => {
    // Missing in older browsers and in jsdom, whatever the type says.
    const viewport = window.visualViewport ?? undefined;
    const element = ref.current;
    if (viewport === undefined || element === null) return;
    const fit = () => {
      element.style.height = `${viewport.height}px`;
      element.style.top = `${viewport.offsetTop}px`;
    };
    fit();
    viewport.addEventListener('resize', fit);
    viewport.addEventListener('scroll', fit);
    return () => {
      viewport.removeEventListener('resize', fit);
      viewport.removeEventListener('scroll', fit);
    };
  }, [ref]);
};

/**
 * Keeps a scrolling element at its end as content is added while the reader is there, and stays
 * put once they scroll up to read. Does nothing unless `active`.
 */
export const useFollowEnd = (ref: RefObject<HTMLElement | null>, active = true) => {
  const atEnd = useRef(true);
  useEffect(() => {
    const element = ref.current;
    if (!active || element === null) return;
    const toEnd = () => {
      if (atEnd.current) element.scrollTop = element.scrollHeight;
    };
    const onScroll = () => {
      atEnd.current = element.scrollHeight - element.scrollTop - element.clientHeight <= END_SLACK;
    };
    toEnd();
    element.addEventListener('scroll', onScroll);
    const added = new MutationObserver(toEnd);
    added.observe(element, { childList: true, subtree: true, characterData: true });
    // A footer that grows, or a keyboard that opens, shrinks the element: keep its end in view.
    const resized = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(toEnd);
    resized?.observe(element);
    return () => {
      element.removeEventListener('scroll', onScroll);
      added.disconnect();
      resized?.disconnect();
    };
  }, [ref, active]);
};

/** The page variable that holds the height of a docked footer, which a `Fab` floats above. */
export const FOOTER_HEIGHT_VARIABLE = '--docked-footer-height';

/**
 * Publishes the element's height on the page as `--docked-footer-height` while it is mounted, so
 * a floating button never covers the footer, however tall it grows.
 */
export const usePublishFooterHeight = (ref: RefObject<HTMLElement | null>) => {
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const root = document.documentElement.style;
    const publish = () =>
      root.setProperty(FOOTER_HEIGHT_VARIABLE, `${element.getBoundingClientRect().height}px`);
    publish();
    const resized = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(publish);
    resized?.observe(element);
    return () => {
      resized?.disconnect();
      root.removeProperty(FOOTER_HEIGHT_VARIABLE);
    };
  }, [ref]);
};
