#!./deno.sh run  --cached-only --allow-read=./ --allow-write=./static/ --unstable-bundle ./build.ts


import * as fs   from "@std/fs"
import * as path from "@std/path"
// NOTE: adding /jsr for pretty rendering
import * as preact_ssr from "preact-render-to-string/jsx";

import { initialize, type PYO } from "./frontend/lib/pyodide.ts"



const HARDCODED_OUTPUTDIR:string = 
    path.fromFileUrl(import.meta.resolve('./static') )
const HARDCODED_OUTPUTFILE_INDEX_JS:string   = 'index.tsx.js'
const HARDCODED_OUTPUTFILE_INDEX_HTML:string = 'index.html'
const HARDCODED_INDEX_TSX:string = './frontend/index.tsx'




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
    
    const outputpath:string = 
        path.join(HARDCODED_OUTPUTDIR, HARDCODED_OUTPUTFILE_INDEX_JS)
    fs.ensureDirSync(path.dirname(outputpath));
    Deno.writeTextFileSync(outputpath, output.outputFiles[0]!.text())
}



async function compile_index_html() {
    const module: { Index?: (props?:Record<string, unknown>) => unknown } = 
        await import(HARDCODED_INDEX_TSX);
    if(!module.Index)
        throw new Error('Could not find <Index/> component')
    
    
    // deno-lint-ignore no-explicit-any
    const main_element:any = module.Index()
    const rendered:string  = preact_ssr.render(main_element, {}, {pretty:true})

    const outputpath:string = 
        path.join(HARDCODED_OUTPUTDIR, HARDCODED_OUTPUTFILE_INDEX_HTML)
    fs.ensureDirSync(path.dirname(outputpath));
    Deno.writeTextFileSync(outputpath, rendered)
}


async function copy_pyodide_files() {
    const pyo:PYO|Error = await initialize()
    if(pyo instanceof Error)
        throw pyo as Error;

    const filepaths:string[]|Error = pyo.get_files_for_vendoring();
    if(filepaths instanceof Error)
        throw filepaths as Error;

    for(const filepath of filepaths) {
        const basename:string = path.basename(filepath)
        const outputpath:string = path.join(HARDCODED_OUTPUTDIR, basename)
        Deno.copyFileSync(filepath, outputpath)
    }
}

function clear_outputdir() {
    try {
        Deno.removeSync(HARDCODED_OUTPUTDIR, {recursive:true})
    // deno-lint-ignore no-empty
    } catch {}
    fs.ensureDirSync(HARDCODED_OUTPUTDIR);
}




if(import.meta.main) {
    clear_outputdir()
    await compile_index_html();
    await bundle_index_js();
    
    if(!Deno.args.includes('--no-pyodide'))
        await copy_pyodide_files();

    console.log('done')
}


