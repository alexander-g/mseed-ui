#!./deno.sh run  --cached-only --allow-read=./ --allow-write=./static/ --unstable-bundle ./build.ts


import * as fs   from "@std/fs"
import * as path from "@std/path"
// NOTE: adding /jsr for pretty rendering
import * as preact_ssr from "preact-render-to-string/jsx";

import { initialize, PYODIDE_SCRIPTS, type Pyodide } from "./frontend/lib/pyodide.ts"
import type { AppConfig, Index } from "./frontend/index.tsx";



const HARDCODED_OUTPUTDIR:string = 
    path.fromFileUrl(import.meta.resolve('./static') )
const HARDCODED_OUTPUTFILE_INDEX_JS:string   = 'index.tsx.js'
const HARDCODED_OUTPUTFILE_INDEX_HTML:string = 'index.html'
const HARDCODED_INDEX_TSX:string = './frontend/index.tsx'

const HARDCODED_PYODIDE_WORKER_JS:string = './frontend/lib/pyodide-worker.ts'
const HARDCODED_OUTPUTFILE_PYODIDE_WORKER_JS:string = 'pyodide-worker.ts.js'

const HARDCODED_MSEED_WORKER_JS:string = './frontend/lib/mseed-worker.ts'
const HARDCODED_OUTPUTFILE_MSEED_WORKER_JS:string = 'mseed-worker.ts.js'

const HARDCODED_PYODIDE_DIR:string = './frontend/lib'



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


async function bundle_js_file(inputpath:string, outputpath:string,  minify:boolean) {
    if(!Deno.bundle) 
        throw new Error(`No Deno.bundle(). Forgot --unstable-bundle?`)

    const output:Deno.BundleResult = await Deno.bundle({
        entrypoints: [inputpath],
        output:      "dist",
        platform:    "browser",
        minify:      minify,
        write:       false,
        sourcemap:   minify? undefined : 'inline'
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
    
    fs.ensureDirSync(path.dirname(outputpath));
    Deno.writeTextFileSync(outputpath, output.outputFiles[0]!.text())
}


async function bundle_index_js(minify:boolean) {
    const outputpath:string = 
        path.join(HARDCODED_OUTPUTDIR, HARDCODED_OUTPUTFILE_INDEX_JS)
    return await bundle_js_file(HARDCODED_INDEX_TSX, outputpath, minify)
}

async function bundle_pyodide_worker(minify:boolean) {
    const outputpath:string = 
        path.join(HARDCODED_OUTPUTDIR, HARDCODED_OUTPUTFILE_PYODIDE_WORKER_JS)
    return await bundle_js_file(HARDCODED_PYODIDE_WORKER_JS, outputpath, minify)
}

async function bundle_mseed_worker(minify:boolean) {
    const outputpath:string = 
        path.join(HARDCODED_OUTPUTDIR, HARDCODED_OUTPUTFILE_MSEED_WORKER_JS)
    return await bundle_js_file(HARDCODED_MSEED_WORKER_JS, outputpath, minify)
}

function copy_pyodide_scripts() {
    for(const py_script of PYODIDE_SCRIPTS) {
        const py_path:string = path.join(HARDCODED_PYODIDE_DIR, py_script)
        if( !fs.existsSync(py_path) )
            throw new Error(`Pyodide script ${py_path} missing`)

        const outputpath:string = path.join(HARDCODED_OUTPUTDIR, py_script)
        Deno.copyFileSync(py_path, outputpath)
    }
}



async function compile_index_html(app_config:AppConfig) {
    const module: { Index?: typeof Index } = 
        await import(HARDCODED_INDEX_TSX);
    if(!module.Index)
        throw new Error('Could not find <Index/> component')
    
    
    // deno-lint-ignore no-explicit-any
    const main_element:any = module.Index(app_config)
    const rendered:string  = preact_ssr.render(main_element, {}, {pretty:true, jsx:false})

    const outputpath:string = 
        path.join(HARDCODED_OUTPUTDIR, HARDCODED_OUTPUTFILE_INDEX_HTML)
    fs.ensureDirSync(path.dirname(outputpath));
    Deno.writeTextFileSync(outputpath, rendered)
}


async function copy_pyodide_files() {
    const pyo:Pyodide|Error = await initialize()
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
    const pyodide_vendored:boolean = !Deno.args.includes('--no-pyodide');
    const minify:boolean = Deno.args.includes('--minify')

    clear_outputdir()
    await compile_index_html({pyodide_vendored});
    await bundle_index_js(minify);
    await bundle_pyodide_worker(minify);
    await copy_pyodide_scripts();
    await bundle_mseed_worker(minify);
    
    if(pyodide_vendored)
        await copy_pyodide_files();

    console.log('done')
}


