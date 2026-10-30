import axe from 'axe-core';

/**
 * The ids of the axe rules that a rendered component violates. jsdom computes no layout, so the
 * color-contrast rule cannot run here; the tokens and the catalog cover contrast instead.
 */
export const axeViolations = async (container: Element): Promise<ReadonlyArray<string>> => {
  const { violations } = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  return violations.map((violation) => violation.id);
};
