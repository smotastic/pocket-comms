import * as Layer from 'effect/Layer';
import { TransactionOutbound } from '../../../application/src/ports/note-event.outbound.port.js';

export const layerSql = Layer.succeed(TransactionOutbound, { run: (effect) => effect });
