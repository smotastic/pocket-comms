// Violations: an export typed `any`, or a factory that returns `any`, hides whether it is a layer.
export const layerLoose = JSON.parse('{}');

export const layerLooseFactory = () => JSON.parse('{}');
