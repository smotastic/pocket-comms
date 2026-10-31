import { StatusHistoryOutbound, type StatusMark } from '@pocket-comms/comms-application';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';

/** The last status mark of each pane, in server memory. */
export const layerMemory = Layer.sync(StatusHistoryOutbound, () => {
  const marks = new Map<string, StatusMark>();
  return StatusHistoryOutbound.of({
    get: (paneId) => Effect.sync(() => Option.fromNullishOr(marks.get(paneId))),
    set: (paneId, mark) => Effect.sync(() => void marks.set(paneId, mark)),
  });
});
