import * as pyo from 'pyodide'

import { is_deno } from "./util.ts";



export class PYO {
    constructor(private pyodide:pyo.PyodideAPI){}

    async plot_data(data:Int32Array): Promise<File> {
        const buffer = new Uint8Array(data.buffer);
        this.pyodide.FS.writeFile("/data_i32.bin", buffer, {encoding: "binary"});

        await this.pyodide.runPythonAsync(pyo_plot_code);

        const pngdata:Uint8Array<ArrayBuffer> = 
            this.pyodide.FS.readFile("/plt.png", {encoding: "binary"});
        return new File([pngdata], 'plot.png');
    }

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


const pyo_plot_code = `
import numpy as np; 
import matplotlib.pylab as plt; 
import matplotlib
matplotlib.use("AGG")

x = np.frombuffer(open('/data_i32.bin', 'rb').read(), dtype='int32')
fig = plt.figure();
plt.plot(x);
plt.savefig('/plt.png')
plt.close(fig)
`



const PYODIDE_CDN_URL = 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full'



export
async function initialize(vendored:boolean = is_deno()): Promise<PYO|Error> {
    try {
        const pyodide:pyo.PyodideAPI = await pyo.loadPyodide({
            indexURL: vendored? '' : PYODIDE_CDN_URL,
            packageBaseUrl: (is_deno() || vendored)? undefined : PYODIDE_CDN_URL,
            packages: ['numpy', 'matplotlib']
        });

        pyodide.runPythonAsync("import numpy as np; import matplotlib.pylab as plt;");

        return new PYO(pyodide);
    } catch(e) {
        return e as Error;
    }
}





if(import.meta.main) {
    const pyodide:PYO|Error = await initialize()
    if(pyodide instanceof Error)
        throw pyodide as Error;
    
    console.log('done');
}

