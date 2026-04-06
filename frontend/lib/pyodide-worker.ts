import { 
    initialize as initialize_pyodide,
    type Pyodide
} from "./pyodide.ts";



export type WorkerInitCommand = {
    command: 'init';

    /** Whether pyodide should fetch wheels from index or from CDN */
    vendored: boolean;
}


export type WorkerPlotDataCommand = {
    command: 'plot-data';

    /** Data to plot */
    data: Int32Array;

}

export type WorkerCommand = 
    WorkerInitCommand
    | WorkerPlotDataCommand;






export type WorkerReadyResult = {
    message: 'ready';
}

export type WorkerPlotDataResult = {
    message: 'plot-data-result';

    /** RGB data of plot encoded as png.
        NOTE: uint8 instead of File, bc doesnt work (in deno) */
    outputdata_png: Uint8Array<ArrayBuffer>;
}

type WorkerResult = 
    WorkerReadyResult 
    | WorkerPlotDataResult 
    | Error;
export type WorkerMessage = WorkerResult;





let pyodide:Pyodide|null = null;


// main entry point
self.onmessage = async (e:MessageEvent) => {
    const data:WorkerCommand = e.data;
    console.log(`Worker ${self.name} onmessage: ${data.command}`)

    let result:WorkerMessage;
    if(data.command == 'init') {
        const pyo:Pyodide|Error = await initialize_pyodide(data.vendored)
        if(pyo instanceof Error)
            result = pyo as Error;
        else {
            pyodide = pyo;
            result = {message:'ready'}
        }
    } else if(data.command == 'plot-data') {
        if(pyodide == null)
            return new Error('Pyodide in worker not initialized');

        const output:File|Error = await pyodide.plot_data(data.data)
        if(output instanceof Error)
            result = output as Error;
        else {
            const outputdata_png:Uint8Array<ArrayBuffer>|Error = 
                await output.bytes().catch(_ => new Error())
            if(outputdata_png instanceof Error)
                result = outputdata_png as Error;
            else {
                const message:WorkerPlotDataResult = 
                    {message:'plot-data-result', outputdata_png};
                result = message;
            }
        }
    }
    else
        result = new Error(
            `Unknown worker command: ${(data as {command:string}).command}`
        )
    
    self.postMessage(result)
}


self.addEventListener('error', (e:ErrorEvent) => {
    e.preventDefault();
    const msg:string = 
        `Worker ${self.name} error: ${e.message} (${e.filename}:${e.lineno})-${e.colno})`
    console.error(msg)
    self.postMessage(new Error(msg));
    self.close();
});


self.onunhandledrejection = (e:PromiseRejectionEvent) => {
    e.preventDefault()
    const msg:string = `Worker ${self.name} unhandled rejection: ${e.reason}`
    console.error(msg)
    self.postMessage(new Error(msg))
    self.close()
}

