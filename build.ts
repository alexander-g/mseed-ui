#!./deno.sh run  --cached-only --allow-read=./ --allow-write=./static/ --unstable-bundle ./build.ts


import * as fs   from "@std/fs"
import * as path from "@std/path"
// NOTE: adding /jsr for pretty rendering
import * as preact_ssr from "preact-render-to-string/jsx";




const HARDCODED_OUTPUTFILE:string = './static/index.tsx.js'
const HARDCODED_OUTPUTFILE_INDEX_HTML:string = './static/index.html'
const HARDCODED_INDEX_TSX:string = './ui/index.tsx'




// adding bundle etc to Deno because otherwise always get errors during checks
// --unstable-bundle does not help
declare global {
    namespace Deno {

        interface BundleOptions {
            entrypoints?: string[];
            output?:      string;
            platform?:    "browser" | "deno" ;
            minify?:      boolean;
            write?:       boolean;
            sourcemap?:   'inline'
        }
        
        interface BundleResult {
            success: boolean,
            errors: {
                text:string,
            }[],
            outputFiles: {
                contents: Uint8Array<ArrayBuffer>,
                text: () => string,
                hash: string,
            }[]
        }

        // optional because undefined if run without --unstable-bundle
        const bundle: ((options: BundleOptions) => Promise<BundleResult>) | undefined;
    }
}


async function bundle_index_js() {
    if(!Deno.bundle) 
        throw new Error(`No Deno.bundle(). Forgot --unstable-bundle?`)

    const output:Deno.BundleResult = await Deno.bundle({
        entrypoints: [HARDCODED_INDEX_TSX],
        output:      "dist",
        platform:    "browser",
        minify:      false,
        write:       false,
        sourcemap:   'inline'
    })

    if(!output.success) {
        //TODO: return new Error(`deno bundle failed with code ${output.code}`)
        const errormessages:string = output.errors.map(
            (e:{text:string}) => e.text
        ).join('\n\n')
        throw new Error(`Bundling failed: ${errormessages}`)
    }
    //else
    if(output.outputFiles.length != 1)
        // should not happen
        throw (
            new Error(`Expected one output file. Got ${output.outputFiles.length}`)
        )
    
    const outputfile:string = HARDCODED_OUTPUTFILE;
    fs.ensureDirSync(path.dirname(outputfile));
    Deno.writeTextFileSync(outputfile, output.outputFiles[0]!.text())
}



async function compile_index_html() {
    const module: { Index?: (props?:Record<string, unknown>) => unknown } = 
        await import(HARDCODED_INDEX_TSX);
    if(!module.Index)
        throw new Error('Could not find <Index/> component')
    
    
    // deno-lint-ignore no-explicit-any
    const main_element:any = module.Index()
    const rendered:string  = preact_ssr.render(main_element, {}, {pretty:true})

    const outputfile:string = HARDCODED_OUTPUTFILE_INDEX_HTML;
    fs.ensureDirSync(path.dirname(outputfile));
    Deno.writeTextFileSync(outputfile, rendered)
}


if(import.meta.main) {
    await compile_index_html();
    await bundle_index_js();
}


