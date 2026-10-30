import gaps from './gap.module.css';

/** The space tokens a layout can put between its children. */
export type Gap = '3xs' | '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';

export const gapClass = (gap: Gap): string => gaps[`gap-${gap}`] ?? '';
