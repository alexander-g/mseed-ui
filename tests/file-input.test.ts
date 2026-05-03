import { 
    process_dropped_files, 
    type ProcessedFiles,
    find_iso_time,
    parse_station_code_from_filename,
} from '../frontend/lib/file-input.ts'
import { combine_mseed_codes } from "../frontend/lib/mseed-parsing.ts"

import * as path from '@std/path'
import { assert } from 'asserts'

const MSEED_FILES: string[] = [
    path.fromFileUrl(import.meta.resolve('./assets/2018-01-27T13:05:00-CN.OZB..BHN')),
    path.fromFileUrl(import.meta.resolve('./assets/2018-01-27T19:27:54-CN.PFB..HHE')),
    path.fromFileUrl(import.meta.resolve('./assets/2018-01-28T00:00:00-CN.SHB..BHZ')),
]



Deno.test('process_dropped_files() with mseed files', async () => {
    const files: File[] = MSEED_FILES.map((filepath) => {
        const filename:string = path.basename(filepath)
        return new File([Deno.readFileSync(filepath)], filename)
    })

    let progress_count = 0
    const processed: ProcessedFiles = await process_dropped_files(
        files,
        (_processed: number, _total: number) => {
            progress_count++
            //console.log(`Progress: ${processed}/${total}`)
        }
    )

    assert(processed.mseeds.length == 3)
    assert(processed.stations.length == 0)
    assert(processed.inference_events.length == 0)
    assert(processed.unknown_files.length == 0)
    assert(progress_count > 0, 'Progress callback should be called')


    // bug: duplicate station codes
    const unique_codes = new Set(processed.mseeds.map( m => combine_mseed_codes(m.meta) ))
    assert(unique_codes.size == 3)
    
})



Deno.test('find_iso_time', () => {
    const invalid = 'banana'
    const output_inv = find_iso_time(invalid)
    assert(output_inv == null)


    const x0 = '2018-01-01T00:00:00-CN.NLLB..HHZ'
    const output0:string|null = find_iso_time(x0)
    assert(output0 == '2018-01-01T00:00:00')

    // assert(0)
})


Deno.test('parse_station_code_from_filename', () => {
    const out0 = parse_station_code_from_filename('2018-01-01T00:00:00-CN.PGC..HHE.csv')
    assert(out0 == 'CN.PGC..HHE')

    const out1 = parse_station_code_from_filename('CN.PGC..HHE.csv')
    assert(out1 == 'CN.PGC..HHE')


    const out2 = parse_station_code_from_filename('2018-01-01T00:00:00-C8.PA01..HHN.csv')
    assert(out2 == 'C8.PA01..HHN')

})

