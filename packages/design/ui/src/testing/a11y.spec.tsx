import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { axeViolations } from './a11y.js';

afterEach(cleanup);

describe('axeViolations', () => {
  it('reports an accessibility violation by its rule id', async () => {
    const { container } = render(<button type="button" />);
    expect(await axeViolations(container)).toContain('button-name');
  });

  it('reports nothing for accessible markup', async () => {
    const { container } = render(<button type="button">Save</button>);
    expect(await axeViolations(container)).toEqual([]);
  });
});
