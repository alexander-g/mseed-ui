import { process_dropped_files, type ProcessedFiles } from '../frontend/lib/file-input.ts'
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
        },
        /*pool_size = */ 2,
    )

    assert(processed.mseeds.length == 3)
    assert(processed.stations.length == 0)
    assert(processed.inference_events.length == 0)
    assert(processed.unknown_files.length == 0)
    assert(progress_count > 0, 'Progress callback should be called')


    // bug: duplicate station codes
    const unique_codes = new Set(processed.mseeds.map( m => m.meta.code ))
    assert(unique_codes.size == 3)
    
})


