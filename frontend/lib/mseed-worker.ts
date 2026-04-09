import {
    initialize as tremorwasm_initialize,
    type TremorWasm,
    type MSEED_Meta,
} from '../../wasm-cpp/mseed-wasm.ts'
import { parse_file } from "./file-input.ts"
import { type Station } from './station-xml.ts'
import { type QuakeEvent } from './quakeml.ts'
import type { InferenceEvent } from '../ui/mseed-heatmap.tsx'




export type WorkerProcessFileCommand = {
    command: 'process-file'
    /** The file to process, can be uint8 instead of File, bc doesnt work in deno */
    filedata: Uint8Array<ArrayBuffer>
    filename: string
}


export type WorkerCommand =
    WorkerProcessFileCommand

export type FileResult = {
        type:    'mseed'
        meta:     MSEED_Meta
        filename: string
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
        type:       'quakeevent'
        quakeevents: QuakeEvent[]
    }
    | {
        type:    'unknown'
        filename: string
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
                : new File([data.filedata], data.filename)
            const file_result:FileResult|Error = 
                await parse_file(file_to_process, wasm)
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
