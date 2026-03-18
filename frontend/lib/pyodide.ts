import * as pyo from 'pyodide'

import { is_deno } from "./util.ts";

const PYODIDE_CDN_URL = `https://cdn.jsdelivr.net/pyodide/v${pyo.version}/full/`

async function hello_python() {
    const pyodide = await pyo.loadPyodide({
        indexURL: is_deno()? undefined : PYODIDE_CDN_URL,
    });
    await pyodide.loadPackage('numpy')
    // NOTE: obspy not available
    // await pyodide.loadPackage("micropip");
    // const micropip = pyodide.pyimport("micropip");
    // await micropip.install("obspy");
    return pyodide.runPythonAsync("import numpy as np; print(np)");
}
 

export async function test_pyo() {
    const result = await hello_python();
    console.log("Python says:", result);
}

