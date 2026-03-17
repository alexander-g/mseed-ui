import * as preact from "preact";
import JSX = preact.JSX;
export { preact, type JSX };

//make preact global (for javascript)
// @ts-ignore used only for debugging
globalThis.preact = preact;

import * as signals from "@preact/signals";
import Signal           = signals.Signal;
type ReadonlySignal<T>  = signals.ReadonlySignal<T>;
export { signals, Signal, type ReadonlySignal }


