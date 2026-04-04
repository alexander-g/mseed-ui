import {
    initialize as tremorwasm_initialize,
    type TremorWasm,
    type MSEED_Meta,
} from '../../wasm-cpp/mseed-wasm.ts'
import { read_csv_inference_file } from "./file-input.ts"
import { parse_stationxml_file, type Station } from './station-xml.ts'
import type { InferenceEvent } from '../ui/mseed-heatmap.tsx'




export type WorkerProcessFileCommand = {
    command: 'process-file'
    /** The file to process, can be uint8 instead of File, bc doesnt work in deno */
    filedata: Uint8Array<ArrayBuffer>|File
}


export type WorkerCommand =
    WorkerProcessFileCommand

export type FileResult = {
        type: 'mseed'
        file: File
        meta: MSEED_Meta
    } 
    | {
        type:    'station'
        stations: Station[]
    } 
    | {
        type:      'inference'
        inference: InferenceEvent[]
    } 
    | {
        type: 'unknown'
        file: File
    }

export type WorkerReadyResult = {
    message: 'ready'
}

export type WorkerFileResult = {
    message: 'file-result'
    result: FileResult
}

type WorkerResult =
    WorkerReadyResult
    | WorkerFileResult
    | Error

export type WorkerMessage = WorkerResult




let wasm: TremorWasm | null = null

const is_worker:boolean = typeof window === 'undefined';
if(is_worker){
    wasm = await tremorwasm_initialize()
    self.postMessage({message:'ready'} as WorkerMessage)
}




/** Process a single file */
async function process_file(file: File): Promise<FileResult | Error> {
    // Try StationXML
    const station: Station[] | Error = await parse_stationxml_file(file)
    if (!(station instanceof Error)) {
        return {
            type: 'station',
            stations: station,
        }
    }

    // Try MSEED
    if (wasm === null)
        return new Error('WASM not initialized')

    const meta: MSEED_Meta | Error = await wasm.read_metadata(file)
    if (!(meta instanceof Error)) {
        return {
            type: 'mseed',
            file: file,
            meta: meta,
        }
    }

    // Try CSV inference
    const inference: InferenceEvent[] | Error = await read_csv_inference_file(file)
    if (!(inference instanceof Error)) {
        return {
            type:     'inference',
            inference: inference,
        }
    }

    // Unknown file
    return {
        type: 'unknown',
        file: file,
    }
}

// main entry point
self.onmessage = async (e: MessageEvent) => {
    const data: WorkerCommand = e.data
    // console.log(`Worker ${self.name} onmessage: ${data.command}`)

    let result: WorkerMessage
    if(data.command === 'process-file') {
        if (wasm === null) 
            result = new Error('WASM not initialized')
        else {
            const file_to_process = 
                (data.filedata instanceof File)
                ? data.filedata
                : new File([data.filedata], `${data.filedata.length}.bytes`)
            const file_result:FileResult|Error = await process_file(file_to_process)
            if(file_result instanceof Error) {
                result = file_result as Error
            } else {
                result = {
                    message: 'file-result',
                    result: file_result,
                }
            }
        }
    } else {
        result = new Error(
            `Unknown worker command: ${(data as { command: string }).command}`
        )
    }
    self.postMessage(result)
}

self.addEventListener('error', (e: ErrorEvent) => {
    e.preventDefault()
    const msg: string =
        `Worker ${self.name} error: ${e.message} (${e.filename}:${e.lineno})-${e.colno})`
    console.error(msg)
    self.postMessage(new Error(msg))
    self.close()
})

self.onunhandledrejection = (e: PromiseRejectionEvent) => {
    e.preventDefault()
    const msg: string = `Worker ${self.name} unhandled rejection: ${e.reason}`
    console.error(msg)
    self.postMessage(new Error(msg))
    self.close()
}
