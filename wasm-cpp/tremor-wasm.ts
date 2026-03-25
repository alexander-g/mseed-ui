

// for readability
type pointer = number;

type TremorWASM_Module = {
    _read_mseed: (
        buffer:         pointer, 
        bufferlength:   bigint,
        // outputs
        starttime_u64:  pointer,
        endtime_u64:    pointer,
        nsamples_u64:   pointer,
        samplerate_f64: pointer,
        code_32bytes:   pointer,

        // optional outputs
        samplebuffer_i32:  pointer,
        samplebuffer_size: pointer,
    ) => number;

    _malloc: (nbytes:number) => pointer,
    _free:   (ptr:pointer) => void,

    HEAPU8: {
        set:   (src:Uint8Array, dst:pointer) => void,
        slice: (start:number,   end:number)  => Uint8Array,
        [i:number]: number,
    },
    HEAP64: {
        [i:number]: bigint,
    },
}


export type MSEED_Meta = {
    start: Date
    end:   Date
    code:  string
    samplerate: number
}


export class TremorWasm {
    constructor(private wasm:TremorWASM_Module){}

    async read_metadata(file:File): Promise<MSEED_Meta|Error> {
        try {
            const buffer:Uint8Array = await file.bytes()
            const buffer_p:pointer  = this.#malloc(buffer.length)
            this.wasm.HEAPU8.set(buffer, buffer_p);

            const starttime_p:  pointer = this.#malloc(8);
            const endtime_p:    pointer = this.#malloc(8);
            const nsamples_p:   pointer = this.#malloc(8);
            const samplerate_p: pointer = this.#malloc(8);
            const code_p:       pointer = this.#malloc(32);

            const rc:number = this.wasm._read_mseed(
                buffer_p,
                BigInt(buffer.length), 
                starttime_p, 
                endtime_p, 
                nsamples_p, 
                samplerate_p, 
                code_p,
                /*samplebuffer     = */ 0,
                /*samplebuffersize = */ 0,
            );
            if(rc != 0)
                return new Error('Could not read mseed meta data')
        
            const starttime_u64:BigUint64Array = new BigUint64Array(
                this.wasm.HEAPU8.slice(
                    starttime_p, 
                    starttime_p + 8
                ).buffer
            )
            const endtime_u64:BigUint64Array = new BigUint64Array(
                this.wasm.HEAPU8.slice(
                    endtime_p, 
                    endtime_p + 8
                ).buffer
            )
            const nsamples_u64:BigUint64Array = new BigUint64Array(
                this.wasm.HEAPU8.slice(
                    nsamples_p, 
                    nsamples_p + 8
                ).buffer
            )
            const samplerate_f64:Float64Array = new Float64Array(
                this.wasm.HEAPU8.slice(
                    samplerate_p, 
                    samplerate_p + 8
                ).buffer
            )
            const code:string = new TextDecoder().decode(
                this.wasm.HEAPU8.slice(
                    code_p, 
                    code_p + 32
                ).buffer
            );
        
            const t_start = new Date(Number(starttime_u64[0]! / 1000000n))
            const t_end   = new Date(Number(endtime_u64[0]! / 1000000n))
            return {
                start:      t_start,
                end:        t_end,
                code:       code,
                samplerate: Number(samplerate_f64[0])
            }

        } finally {
            this.#free_allocated_buffers();
        }
    }



    #allocated_buffers:pointer[] = []

    #malloc(nbytes:number, fill?:number): pointer {
        const p:pointer = this.wasm._malloc(nbytes);
        this.wasm.HEAPU8.set(new Uint8Array(nbytes).fill(fill ?? 0), p)
        this.#allocated_buffers.push(p);
        return p;
    }

    #free_allocated_buffers() {
        for(const buffer_p of this.#allocated_buffers)
            this.wasm._free(buffer_p);
        this.#allocated_buffers = []
    }
}




type Iinitialize = () => Promise<TremorWasm>;

export const initialize:Iinitialize = async () => {
    const wasm:TremorWASM_Module = await (
        await import('./build-wasm/wasm-mseed.js')
    // deno-lint-ignore no-explicit-any
    ).default() as any;

    return new TremorWasm(wasm);
}



async function test_wasm() {
    const wasm:TremorWASM_Module = 
        // deno-lint-ignore no-explicit-any
        await (await import('./build-wasm/wasm-mseed.js')).default() as any;
    //console.log(wasm)


    const t0 = performance.now()
    const buffer:Uint8Array = Deno.readFileSync('/home/superuser/Projects/geo-ui/wasm-cpp/9Y.A02..DH2.D.2022.077')
    const buffer_p:pointer = wasm._malloc(buffer.length)
    wasm.HEAPU8.set(buffer, buffer_p);

    const starttime_p:  pointer = wasm._malloc(8);
    const endtime_p:    pointer = wasm._malloc(8);
    const nsamples_p:   pointer = wasm._malloc(8);
    const samplerate_p: pointer = wasm._malloc(8);
    const code_p:       pointer = wasm._malloc(32);


    const rc:number = wasm._read_mseed(
        buffer_p,
        BigInt(buffer.length), 
        starttime_p, 
        endtime_p, 
        nsamples_p, 
        samplerate_p, 
        code_p,
        /*samplebuffer     = */ 0,
        /*samplebuffersize = */ 0,
    );
    const t1 = performance.now()
    console.log(t1-t0)
    if(rc != 0) {
        console.log('_read_mseed failed')
        return
    }


    const starttime_u64:BigUint64Array = new BigUint64Array(
        wasm.HEAPU8.slice(
            starttime_p, 
            starttime_p + 8
        ).buffer
    )
    const endtime_u64:BigUint64Array = new BigUint64Array(
        wasm.HEAPU8.slice(
            endtime_p, 
            endtime_p + 8
        ).buffer
    )
    const nsamples_u64:BigUint64Array = new BigUint64Array(
        wasm.HEAPU8.slice(
            nsamples_p, 
            nsamples_p + 8
        ).buffer
    )
    const samplerate_f64:Float64Array = new Float64Array(
        wasm.HEAPU8.slice(
            samplerate_p, 
            samplerate_p + 8
        ).buffer
    )
    const code:string = new TextDecoder().decode(
        wasm.HEAPU8.slice(
            code_p, 
            code_p + 32
        ).buffer
    );

    const t_start = new Date(Number(starttime_u64[0]! / 1000000n))
    const t_end   = new Date(Number(endtime_u64[0]! / 1000000n))
    console.log('>>', t_start, t_end, nsamples_u64[0], samplerate_f64[0], code)


    const nsamples:number = Number(nsamples_u64[0]);
    const samplebuffer_p: pointer = wasm._malloc( nsamples );

    const t2 = performance.now()
    const rc2:number = wasm._read_mseed(
        buffer_p,
        BigInt(buffer.length), 
        starttime_p, 
        endtime_p, 
        nsamples_p, 
        samplerate_p, 
        code_p,
        samplebuffer_p,
        nsamples,
    );
    const t3 = performance.now()
    console.log(t3-t2)
    if(rc2 != 0) {
        console.log('_read_mseed failed')
        return
    }

    const samplebuffer:Int32Array = new Int32Array(
        wasm.HEAPU8.slice(
            samplebuffer_p, 
            samplebuffer_p + nsamples*4
        ).buffer
    )
    console.log(samplebuffer)
}



if(import.meta.main) {
    await test_wasm();
    console.log('done')
}
