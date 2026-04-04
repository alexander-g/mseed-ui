import { parse_quakeml_file, type QuakeEvent } from "../frontend/lib/quakeml.ts";
import * as path from "@std/path"
import { assert } from "asserts";




const QUAKEMLFILE:string = path.fromFileUrl(
    import.meta.resolve('./assets/events.xml')
)
const STATIONSXMLFILE:string = path.fromFileUrl(
    import.meta.resolve('./assets/stations.xml')
)


Deno.test('parse_quakeml', async () => {
    const f:File = new File([Deno.readFileSync(QUAKEMLFILE)], "events.xml")
    const output0:QuakeEvent[]|Error = await parse_quakeml_file(f)
    assert(!(output0 instanceof Error))

    assert(output0.length == 133 )
})



Deno.test('parse_quakeml.invalid', async () => {
    const f:File = new File([Deno.readFileSync(STATIONSXMLFILE)], "events.xml")
    const output0:QuakeEvent[]|Error = await parse_quakeml_file(f)
    assert(output0 instanceof Error)
})



