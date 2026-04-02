import { parse_stationxml_file, type Station } from "../frontend/lib/station-xml.ts";
import * as path from "@std/path"
import { assert } from "asserts";


const STATIONSXMLFILE:string = path.fromFileUrl(
    import.meta.resolve('./assets/stations.xml')
)


Deno.test('parse_stationxml', async () => {
    const f:File = new File([Deno.readFileSync(STATIONSXMLFILE)], "stations.xml")
    const output0:Station[]|Error = await parse_stationxml_file(f)
    assert(!(output0 instanceof Error))

    assert(output0.length == 23 )
})




