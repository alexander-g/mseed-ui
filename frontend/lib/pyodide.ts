import * as pyo from 'pyodide'

import { is_deno, fetch_no_throw } from "./util.ts";
import type { 
    WorkerInitCommand,
    WorkerPlotDataCommand,
    WorkerMessage,
} from "./pyodide-worker.ts";


const PLOT_DATA_PY_SCRIPT:string = 'pyodide-plot.py'

// NOTE: used by the build script
export const PYODIDE_SCRIPTS:string[] = [PLOT_DATA_PY_SCRIPT]



export interface IPyodide {
    /** Plot a 1D time series via matplotlib and return a PNG file. */
    plot_data(
        data:Int32Array,
        i0:number,
        i1:number,
        start_time:Date,
        sample_rate_hz:number,
        title:string,
    ): Promise<File|Error>;
}




/** Public interface for pyodide running in a worker */
export class PyodideInWorker implements IPyodide {
    constructor(private readypromise:Promise<PyodideToWorkerInterface|Error>){}

    async plot_data(
        data:Int32Array,
        i0:number,
        i1:number,
        start_time:Date,
        sample_rate_hz:number,
        title:string,
    ): Promise<File|Error> {
        const internal:IPyodide|Error = await this.readypromise;
        if(internal instanceof Error)
            return internal as Error;

        return internal.plot_data(data, i0, i1, start_time, sample_rate_hz, title)
    }
}


/** Pyodide module in the main thread */
export class Pyodide implements IPyodide {
    constructor(private pyodide:pyo.PyodideAPI){}

    async plot_data(
        data:Int32Array,
        i0:number,
        i1:number,
        start_time:Date,
        sample_rate_hz:number,
        title:string,
    ): Promise<File|Error> {

        const pyo_plot_code:string|Error = await load_plot_code()
        if(pyo_plot_code instanceof Error)
            return pyo_plot_code as Error;

        await this.pyodide.runPythonAsync(pyo_plot_code)
        const plot_fn:(...x:unknown[]) => void = this.pyodide.globals.get("plot_data");
        plot_fn(
            this.pyodide.toPy(data), 
            i0, 
            i1, 
            start_time.getTime()/1000, 
            sample_rate_hz, 
            title, 
            '/plt.png'
        )

        const pngdata:Uint8Array<ArrayBuffer> = 
            this.pyodide.FS.readFile('/plt.png', {encoding: 'binary'})
        return new File([pngdata], 'plot.png')
    }

    /** Find all required to be copied during build */
    get_files_for_vendoring(): string[]|Error {
        if(!is_deno())
            return new Error('Only available for Deno');

        const all_files:string[] = [];
        for(const modulename of Object.keys(this.pyodide.loadedPackages)) {
            const wheelname:string|undefined = 
                this.pyodide.lockfile.packages[modulename.toLowerCase()]?.file_name
            if(wheelname == undefined)
                return new Error(`"${modulename}" not in pyodide lockfile`)
            else 
                all_files.push(`${this.pyodide.lockfileBaseUrl}${wheelname}`);
        }
        const extrafiles:string[] = [
            'pyodide.asm.js', 
            'pyodide.asm.wasm', 
            'pyodide-lock.json', 
            'python_stdlib.zip'
        ];
        for(const extrafile of extrafiles)
            all_files.push(`${this.pyodide.lockfileBaseUrl}${extrafile}`);

        return all_files;
    }
}



/** Load python script for plotting data. */
async function load_plot_code(): Promise<string|Error> {
    const py_path:URL = new URL(PLOT_DATA_PY_SCRIPT, import.meta.url)

    if(is_deno()) {
        try {
            return await Deno.readTextFile(py_path)
        } catch(e) {
            const error:Error = e instanceof Error
                ? e as Error
                : new Error(`Failed to load ${py_path.toString()}`)
            return error;
        }
    }
    // else: fetch()

    const response:Response|Error = await fetch_no_throw(py_path)
    if(response instanceof Error)
        return response as Error;


    const script:string|Error = 
        await response.text().catch(_ => new Error('Reading fetch response failed'))
    return script;
}


/** Private interface to communicate with a pyodide worker */
class PyodideToWorkerInterface implements IPyodide {
    constructor(private worker:Worker){}

    plot_data(
        data: Int32Array,
        i0:number,
        i1:number,
        start_time:Date,
        sample_rate_hz:number,
        title:string,
    ): Promise<File|Error> {
        const command:WorkerPlotDataCommand = {
            command: 'plot-data',
            data:    data,
            i0,
            i1,
            start_time,
            sample_rate_hz,
            title,
        }
        const promise:Promise<File|Error> = 
            new Promise( (resolve: (x:File|Error) => void) => {
                this.worker.addEventListener('message', (e:MessageEvent) => {
                    const message:WorkerMessage = e.data;
                    
                    if(message instanceof Error) {
                        resolve(message as Error)
                        return;
                    } else if (message.message != 'plot-data-result') {
                        resolve(
                            new Error(`Unexpected worker message: ${message.message}`)
                        )
                        return;
                    }
                    // else   

                    const pngfile = new File([message.outputdata_png], 'plot.png')
                    resolve(pngfile)
                    return;
                })
            } )
        this.worker.postMessage(command);
        return promise;
    }
}


function get_worker_url(): URL {
    const ending:'.ts'|'.ts.js' = 
        is_deno()
        ? '.ts'
        : '.ts.js';
    return new URL('./pyodide-worker'+ending, import.meta.url)
}



const PYODIDE_CDN_URL = 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full'


/** Initialize pyodide in the main thread */
export
async function initialize(vendored:boolean = is_deno()): Promise<Pyodide|Error> {
    try {
        const pyodide:pyo.PyodideAPI = await pyo.loadPyodide({
            indexURL: vendored? '' : PYODIDE_CDN_URL,
            packageBaseUrl: (is_deno() || vendored)? undefined : PYODIDE_CDN_URL,
            packages: ['numpy', 'matplotlib']
        });

        pyodide.runPythonAsync("import numpy as np; import matplotlib.pylab as plt;");

        return new Pyodide(pyodide);
    } catch(e) {
        return e as Error;
    }
}

/** Initialize pyodide in the worker thread */
export async function initialize_in_worker(
    vendored:boolean = is_deno()
): Promise<PyodideInWorker|Error> {
    const worker = new Worker( get_worker_url(), {type:'module'} )
        
    const errorpromise = new Promise((resolve: (x:Error) => void) => {
        worker.addEventListener('error', (e:ErrorEvent) => {
            e.preventDefault()
            console.error('Error in worker:', e.message)
            resolve(new Error(e.message))
        })
    })

    const resultfilepromise:Promise<PyodideToWorkerInterface|Error> = 
        new Promise( (resolve: (x:PyodideToWorkerInterface|Error) => void) => {
            worker.onmessage = (e:MessageEvent) => {
                const message:WorkerMessage = e.data;
                if(message instanceof Error)
                    resolve(message as Error)

                const internal = new PyodideToWorkerInterface(worker)
                resolve(internal); // all ok
            }
            worker.onerror = (e:ErrorEvent) => {
                e.preventDefault()
                console.error('Error in worker:', e.message)
                resolve(new Error(e.message))
            }

            const initcommand:WorkerInitCommand = {command:'init', vendored}
            worker.postMessage(initcommand);
        })
    
    const combinedpromise:Promise<PyodideToWorkerInterface|Error> = 
        Promise.race([errorpromise, resultfilepromise])
    return await new PyodideInWorker(combinedpromise);
}




if(import.meta.main) {
    const pyodide:Pyodide|Error = await initialize()
    if(pyodide instanceof Error)
        throw pyodide as Error;
    
    console.log('done');
}

