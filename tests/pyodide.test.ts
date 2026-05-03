import { assert } from "asserts"


import { 
    initialize, 
    initialize_in_worker,
    type Pyodide,
    type IPyodide 
} from "../frontend/lib/pyodide.ts"




export function sleep(ms: number): Promise<unknown> {
    return new Promise((resolve) => {
        setTimeout(() => resolve(0), ms)
    })
}


Deno.test( "pyodide-main-thread", async (t:Deno.TestContext) => {
    const pyo:Pyodide|Error = await initialize();
    assert(!(pyo instanceof Error))

    await t.step("get_vendoring_files", () => {
        const files:string[]|Error = pyo.get_files_for_vendoring()
        assert(!(files instanceof Error))

        for(const f of files)
            Deno.readFileSync(f);
    })

    await t.step("run_maplotlib_plot", async () => {
        const data = new Float32Array([0,10,30,10,20,30,25,25,26,22,10,10,9])
        const pngfile:File|Error = 
            await pyo.plot_data( data, 2, 6, new Date(Date.now()), 2.5, 'TESTDATA' );
        
        assert(!(pngfile instanceof Error))
        assert( (await pngfile.arrayBuffer()).byteLength > 0 )
    })
    
    // NOTE: deno complains about leaks without this
    await sleep(10);
} )



function with_timeout<T>(promise: Promise<T>, ms: number) {
    let timer = 0;
    return new Promise<T>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), ms);
        Promise.resolve(promise).then(
            (v) => { clearTimeout(timer); resolve(v); },
            (e) => { clearTimeout(timer); reject(e); },
        );
    });
}


Deno.test("pyodide-in-worker", async (t:Deno.TestContext) => {
    const pyo:IPyodide|Error = await initialize_in_worker()
    assert(!(pyo instanceof Error))

    await t.step("run_maplotlib_plot", async () => {
        const data = new Float32Array([0,10,30,10,20,30,25,25,26,22,10,10,9])
        const promise:Promise<File|Error> = 
            pyo.plot_data( data, 2, 6, new Date(Date.now()), 2.5, 'TESTDATA' );
        const pngfile:Error|File = await with_timeout(promise, 20000); 
        console.log(pngfile)

        assert(!(pngfile instanceof Error))
        assert( (await pngfile.arrayBuffer()).byteLength > 0 )
    })
})


Deno.test("pyodide-prepare-audio-in-worker", async (t:Deno.TestContext) => {
    const pyo:IPyodide|Error = await initialize_in_worker()
    assert(!(pyo instanceof Error))

    await t.step("prepare_audio", async () => {
        const data = new Float32Array([0,10,30,10,20,30,25,25,26,22,10,10,9])
        const promise:Promise<Float32Array|Error> = 
            pyo.prepare_obs_signal_for_audio( data, 8 );
        const result:Float32Array|Error = await with_timeout(promise, 20000); 

        assert(!(result instanceof Error))
        console.log(result.length)
        assert( result.length >= (data.length * 1000 / 8) )
    })
})
