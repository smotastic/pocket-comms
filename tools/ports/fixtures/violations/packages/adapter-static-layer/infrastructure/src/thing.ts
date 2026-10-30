import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { ThingOutbound } from '../../application/src/ports/thing.outbound.port.js';

export const layerInMemory = Layer.succeed(ThingOutbound, { find: Effect.succeed('thing') });

// Violations: static layers on infrastructure classes; adapter layers are module exports.
export class Holder extends Context.Service<Holder, Array<string>>()(
  'adapter-static-layer/infrastructure/Holder',
) {
  static readonly layer = Layer.succeed(ThingOutbound, { find: Effect.succeed('held') });

  static layerMethod() {
    return layerInMemory;
  }
}

export class Factory {
  static readonly layerSql = layerInMemory;

  static readonly #layerHidden = layerInMemory;

  static hidden() {
    return Factory.#layerHidden;
  }
}

export const Expr = class {
  static readonly layer = layerInMemory;
};

class Base {
  static readonly layerInherited = layerInMemory;
}

export class Child extends Base {}

export class Over {
  static make(): typeof layerInMemory;
  static make(name: string): typeof layerInMemory;
  static make() {
    return layerInMemory;
  }
}

export class Loose {
  static make() {
    return JSON.parse('{}');
  }
}
