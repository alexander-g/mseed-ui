import type { WorkerCommand, WorkerMessage, FileResult } from './mseed-worker.ts'
import { is_deno } from './util.ts'

function get_worker_url(): URL {
    const ending: '.ts' | '.ts.js' =
        is_deno()
            ? '.ts'
            : '.ts.js'
    return new URL('./mseed-worker' + ending, import.meta.url)
}

export class WorkerPool {
    private workers: Worker[] = []

    constructor(private pool_size: number = 4) {}

    async initialize(): Promise<void> {
        for (let i:number = 0; i < this.pool_size; i++) {
            const worker = new Worker(
                get_worker_url(), 
                { type: 'module', name:self.crypto.randomUUID() }
            )
            this.workers.push(worker)
        }

        const init_promises:Promise<void>[] = this.workers.map(
            (worker) =>
                new Promise<void>((resolve, reject) => {
                    const timeout_id:number = setTimeout(
                        () => reject(new Error('Worker initialization timeout')),
                        5000
                    )

                    const handler = (e: MessageEvent) => {
                        clearTimeout(timeout_id)
                        worker.removeEventListener('message', handler)
                        worker.removeEventListener('error', error_handler)

                        const msg: WorkerMessage = e.data
                        if (msg instanceof Error)
                            reject(msg)
                        else if ('message' in msg && msg.message === 'ready')
                            resolve()
                        else
                            reject(new Error('Unexpected init response'))
                    }

                    const error_handler = (e: ErrorEvent) => {
                        clearTimeout(timeout_id)
                        worker.removeEventListener('message', handler)
                        worker.removeEventListener('error', error_handler)
                        reject(new Error(`Worker error: ${e.message}`))
                    }

                    worker.addEventListener('message', handler)
                    worker.addEventListener('error', error_handler)
                })
        )

        await Promise.all(init_promises)
    }

    /** Process a file on the specified worker and return a promise for the result */
    async process_file(file: File, worker_idx: number): Promise<FileResult|Error> {

        // NOTE: passing a file to a worker does not work in deno
        // whereas passing many Uint8Arrays causes issues in the browser
        const filedata:Uint8Array<ArrayBuffer>|Error = 
            await file.bytes().catch( _ => new Error(`Could not read file ${file.name}`) )
        if(filedata instanceof Error)
            return filedata as Error;
        
        return new Promise((resolve) => {
            const worker = this.workers[worker_idx]!
            const timeout_id = setTimeout(
                () => {
                    resolve(new Error('File processing timeout'))
                },
                25000 // 25s timeout per file
            )

            const handler = (e: MessageEvent) => {
                clearTimeout(timeout_id)
                worker.removeEventListener('message', handler)
                worker.removeEventListener('error', error_handler)

                const msg: WorkerMessage = e.data
                if (msg instanceof Error)
                    resolve(msg)
                else if ('message' in msg && msg.message === 'file-result')
                    resolve(msg.result)
                else
                    resolve(new Error('Unexpected file processing response'))
            }

            const error_handler = (e: ErrorEvent) => {
                clearTimeout(timeout_id)
                worker.removeEventListener('message', handler)
                worker.removeEventListener('error', error_handler)
                resolve(new Error(`Worker error: ${e.message}`))
            }

            worker.addEventListener('message', handler, { once: true })
            worker.addEventListener('error', error_handler, { once: true })

            const command:WorkerCommand = 
                {command:'process-file', filedata, filename:file.name}
            worker.postMessage(command, [filedata.buffer])
        })
    }

    terminate(): void {
        for (const worker of this.workers)
            worker.terminate()
        this.workers = []
    }
}
