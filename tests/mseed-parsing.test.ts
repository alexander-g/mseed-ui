import { assert } from "asserts";
import * as path from '@std/path'

import { 
    type MSeedMetadata, 
    read_mseed_metadata,
    is_mseed,
} from "../frontend/lib/mseed-parsing.ts";


const MSEED_FILES: string[] = [
    // bug: little endian
    path.fromFileUrl(import.meta.resolve('./assets/X2.H030.00.HHE.D.2022.132_slice')),
    // big endian
    path.fromFileUrl(import.meta.resolve('./assets/2018-01-28T00:00:00-CN.SHB..BHZ')),
]



Deno.test('mseed-parsing0', async (t:Deno.TestContext) => {

    await t.step('little-endian', async () => {
        const mseeddata= Deno.readFileSync(MSEED_FILES[0]!)
        assert( is_mseed( new DataView(mseeddata.buffer) ) )
    
        const blob = new Blob([mseeddata])
        const output:MSeedMetadata|Error = await read_mseed_metadata(blob)
        // console.log(output)
        assert(!(output instanceof Error))
        assert(output.starttime.getUTCFullYear() == 2022)
    })


    await t.step('big-endian',async () => {
        const mseeddata= Deno.readFileSync(MSEED_FILES[1]!)
        assert( is_mseed( new DataView(mseeddata.buffer) ) )
    
        const blob = new Blob([mseeddata])
        const output:MSeedMetadata|Error = await read_mseed_metadata(blob)
        // console.log(output)
        assert(!(output instanceof Error))
        assert(output.starttime.getUTCFullYear() == 2018)
    })
})



