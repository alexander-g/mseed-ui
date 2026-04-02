import { parse_stationxml_file, type Station } from "./station-xml.ts"
import {
    initialize as tremorwasm_initialize,
    type TremorWasm,
    type MSEED_Meta,
} from "../../wasm-cpp/mseed-wasm.ts"
import type { InferenceEvent } from "../ui/mseed-heatmap.tsx"

export const tremorwasm:TremorWasm = await tremorwasm_initialize()


export type MSEED_FileAndMeta = {
    file: File;
    meta: MSEED_Meta;
}


export type ProcessedFiles = {
    mseeds:     MSEED_FileAndMeta[];
    stations:   Station[];
    inference_events: InferenceEvent[];

    unknown_files: File[];
}


export async function process_dropped_files(files:File[]): Promise<ProcessedFiles> {
    const all_meta:MSEED_FileAndMeta[]   = []
    const all_stations:Station[]         = []
    const all_inference:InferenceEvent[] = []
    const all_unknown: File[]    = []

    for(const f of files) {
        const station:Station[]|Error = await parse_stationxml_file(f)
        if(!(station instanceof Error)) {
            all_stations.push(...station)
            continue;
        }


        const meta:MSEED_Meta|Error = await tremorwasm.read_metadata(f)
        if(!(meta instanceof Error)) {
            all_meta.push({file:f, meta})
            continue
        }


        const inference:InferenceEvent[]|Error = await read_csv_inference_file(f)
        if(!(inference instanceof Error)) {
            all_inference.push(...inference);
            continue;
        }


        // else
        all_unknown.push(f)
    }

    return {
        mseeds:           all_meta,
        stations:         all_stations,
        inference_events: all_inference,
        unknown_files:    all_unknown,
    }
}



export 
async function read_csv_inference_file(file:File): Promise<InferenceEvent[]|Error> {
    try {
        const code:string = file.name.split('.').slice(0,4).join('.')
        const content:string = await file.text()
        const lines:string[] = content.trim().split('\n')

        const inference:InferenceEvent[] = []
        for(const line of lines) {
            const d = new Date(line)
            if(isNaN(d.getTime())) {
                return new Error();
            }

            inference.push( {code, time:d} )
        }
        return inference;
    } catch {
        return new Error('Could not read inference csv file')
    }
}
