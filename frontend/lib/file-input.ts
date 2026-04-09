import { parse_stationxml_file, type Station } from './station-xml.ts'
import { parse_quakeml_file, type QuakeEvent } from './quakeml.ts'
import type { InferenceEvent } from "../ui/mseed-heatmap.tsx"
import { WorkerPool }          from "./worker-pool.ts"
import type { FileResult }     from "./mseed-worker.ts"
import { MSeedMetadata, read_mseed_metadata } from "./mseed-parsing.ts"

import { 
    initialize as tremorwasm_initialize, 
    type TremorWasm,
    type MSEED_Meta,
} from "../../wasm-cpp/mseed-wasm.ts"
export const tremorwasm:TremorWasm = await tremorwasm_initialize()


export type MSEED_FileAndMeta = {
    file: File;
    meta: MSEED_Meta;
}


export type ProcessedFiles = {
    mseeds:     MSEED_FileAndMeta[];
    stations:   Station[];
    inference_events: InferenceEvent[];
    events:     QuakeEvent[];

    unknown_files: File[];
}

export type ProgressCallback = (processed: number, total: number) => void



/** Try to parse a single file, as stationxml, quakeml, mseed or a custom format */
export 
async function parse_file(file: File): Promise<FileResult|Error> {
    // Try MSEED
    // NOTE: should be first, much faster that way
    const meta:Error|MSeedMetadata = await read_mseed_metadata(file)
    if(!(meta instanceof Error))
        return {
            type: 'mseed',
            filename: file.name,
            meta: {
                code: `${meta.network}.${meta.station}.${meta.location}.${meta.channel}`,
                start: meta.starttime,
                end:   meta.endtime,
                samplerate: meta.samplerate,
                nsamples: 0,   // TODO: temporary for now
            }
        }

    // Try StationXML
    const station: Station[] | Error = await parse_stationxml_file(file)
    if(!(station instanceof Error))
        return {
            type: 'station',
            stations: station,
        }

    // try quakeml
    const events:QuakeEvent[]|Error = await parse_quakeml_file(file)
    if(!(events instanceof Error))
        return {
            type: 'quakeevent',
            quakeevents: events
        }



    // Try CSV inference
    const inference: InferenceEvent[] | Error = await read_csv_inference_file(file)
    if(!(inference instanceof Error))
        return {
            type:     'inference',
            inference: inference,
        }

    // Unknown file
    return {
        type: 'unknown',
        filename: file.name,
    }
}


/** Process dropped files using worker pool for parallelization.
 *  Optionally call progress callback as batches complete. */
export async function process_dropped_files(
    files:        File[],
    on_progress?: ProgressCallback,
    pool_size?:   number
): Promise<ProcessedFiles> {
    const all_meta:MSEED_FileAndMeta[]   = []
    const all_stations:Station[]         = []
    const all_inference:InferenceEvent[] = []
    const all_events:  QuakeEvent[]      = []
    const all_unknown: File[]            = []

    // Determine worker pool size based on CPU cores
    pool_size = Math.min(
        files.length, 
        pool_size ?? Math.max(2, navigator.hardwareConcurrency ?? 4)
    )
    // getting crashes with full 20 cpu workers on my machine, 10 should be enough?
    pool_size = Math.min(pool_size, 10)

    if (pool_size === 0) {
        let processed_count:number = 0

        const batchsize = 20;
        for(let index:number = 0; index < files.length; index+=batchsize) {
            const promises:Promise<FileResult|Error>[] = []
            for(let file_index:number = index; file_index < Math.min(index+batchsize, files.length); file_index++) {
                const file:File = files[file_index]!
                promises.push( parse_file(file) )
            }

            for(const promise_index in promises) {
                const file_index:number = Number(promise_index) + index;
                const file = files[file_index]!
                const result:FileResult|Error = await promises[promise_index]!

                if (result instanceof Error)
                    console.warn('File processing error:', result)
                else {
                    if (result.type === 'mseed')
                        all_meta.push({
                            file: file,
                            meta: result.meta,
                        })
                    else if (result.type === 'station')
                        all_stations.push(...result.stations)
                    else if (result.type === 'inference')
                        all_inference.push(...result.inference)
                    else if (result.type === 'quakeevent')
                        all_events.push(...result.quakeevents)
                    else if (result.type === 'unknown')
                        all_unknown.push(file)
                }
                processed_count++
            }
            if (on_progress)
                on_progress(processed_count, files.length)
        }

        return {
            mseeds:           all_meta,
            stations:         all_stations,
            inference_events: all_inference,
            events:           all_events,
            unknown_files:    all_unknown,
        }
    }

    const pool = new WorkerPool(pool_size)

    try {
        console.log(`Starting pool of ${pool_size} workers`)
        await pool.initialize()

        // 1 file per worker at at a time
        // NOTE: dont increase, will result in incorrect behavior atm
        const batch_size:number = pool_size * 1;
        let processed_count = 0

        const filemap:Record<string, File> = 
            Object.fromEntries(files.map( f => [f.name, f] ))
        const filenames:string[] = Object.keys(filemap)

        for (let i:number = 0; i < files.length; i += batch_size) {
            const batch_of_filenames:string[] = 
                filenames.slice(i, Math.min(i + batch_size, files.length))

            const all_promises: Promise<FileResult|Error>[] = []
            for(const filename of batch_of_filenames) {
                const worker_idx = all_promises.length % pool_size
                all_promises.push(pool.process_file(filemap[filename]!, worker_idx))
            }

            // wait for all results and aggregate
            const results:(FileResult|Error)[] = await Promise.all(all_promises)

            for (const result of results) {
                if (result instanceof Error) {
                    console.warn('File processing error:', result)
                } else {
                    const file_result: FileResult = result
                    if (file_result.type === 'mseed')
                        all_meta.push({
                            file: filemap[file_result.filename]!, 
                            meta: file_result.meta 
                        })
                    else if (file_result.type === 'station')
                        all_stations.push(...file_result.stations)
                    else if (file_result.type === 'inference')
                        all_inference.push(...file_result.inference)
                    else if (file_result.type === 'quakeevent')
                        all_events.push(...file_result.quakeevents)
                    else if (file_result.type === 'unknown')
                        all_unknown.push(filemap[file_result.filename]!)
                }

                // Report progress every batch_size files
                processed_count++
                if (processed_count % batch_size === 0 && on_progress)
                    on_progress(processed_count, files.length)
            }
        }

        // Final progress update
        if (on_progress)
            on_progress(files.length, files.length)
    } finally {
        pool.terminate()
    }

    return {
        mseeds:           all_meta,
        stations:         all_stations,
        inference_events: all_inference,
        events:           all_events,
        unknown_files:    all_unknown,
    }
}



export 
async function read_csv_inference_file(file:File): Promise<InferenceEvent[]|Error> {
    try {
        const code:string|null = parse_station_code_from_filename(file.name)
        if(code == null)
            return new Error(`Could not parse station code from "${file.name}"`)
        const content:string = await file.text()
        const lines:string[] = content.trim().split('\n')

        const inference:InferenceEvent[] = []
        for(const line of lines) {
            const d = new Date(line)
            if(isNaN(d.getTime())) 
                return new Error();
            

            inference.push( {code, time:d} )
        }
        return inference;
    } catch {
        return new Error('Could not read inference csv file')
    }
}

export function parse_station_code_from_filename(input: string): string|null {
    input = input.replace(/\.(txt)$/i, '')
    input = input.replace(/\.(csv)$/i, '')

    const timestring:string|null = find_iso_time(input)
    if(timestring)
        input = input.replace(timestring, '')

    // characters only
    //const rx = /([A-Z]{0,5})\.([A-Z]{0,5})\.([A-Z]{0,5})\.([A-Z]{0,5})/;

    // characters and numbers
    const rx = /([A-Z0-9]{0,5})\.([A-Z0-9]{0,5})\.([A-Z0-9]{0,5})\.([A-Z0-9]{0,5})/i;
    
    const m:RegExpMatchArray|null = input.match(rx)
    return m ? m[0] : null;
}

export function find_iso_time(input: string): string|null {
    const iso_time_regex = /\b\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)?\b/;
    const m:RegExpMatchArray|null = input.match(iso_time_regex);
    return m ? m[0] : null;
}
