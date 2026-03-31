import { assert } from "asserts"


import { initialize, type PYO } from "../frontend/lib/pyodide.ts"




export function sleep(ms: number): Promise<unknown> {
    return new Promise((resolve) => {
        setTimeout(() => resolve(0), ms)
    })
}


Deno.test( "pyodide", async (t:Deno.TestContext) => {
    const pyo:PYO|Error = await initialize();
    assert(!(pyo instanceof Error))

    await t.step("get_vendoring_files", () => {
        const files:string[]|Error = pyo.get_files_for_vendoring()
        assert(!(files instanceof Error))

        for(const f of files)
            Deno.readFileSync(f);
    })

    await t.step("run_maplotlib_plot", async () => {
        const pngfile:File = await pyo.plot_data( new Int32Array([0,10,30,10,20,30]) );
        
        assert( (await pngfile.arrayBuffer()).byteLength > 0 )
    })
    
    // NOTE: deno complains about leaks without this
    await sleep(10);
} )


