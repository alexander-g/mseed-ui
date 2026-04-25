

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
    nsamples:   number
}

type MSEED_ReadResult = {
    data: Int32Array|null;
    meta: MSEED_Meta;
}


export class TremorWasm {
    constructor(private wasm:TremorWASM_Module){}

    async read_metadata(file:File): Promise<MSEED_Meta|Error> {
        const readresult:MSEED_ReadResult|Error = await this._read(file, 0);
        return (readresult instanceof Error)? readresult : readresult.meta;
    }

    private async _read(file:File, nsamplestoread:number): Promise<MSEED_ReadResult|Error> {
        try {
            const buffer:Uint8Array = await file.bytes()
            const buffer_p:pointer  = this.#malloc(buffer.length)
            this.wasm.HEAPU8.set(buffer, buffer_p);

            const starttime_p:  pointer = this.#malloc(8);
            const endtime_p:    pointer = this.#malloc(8);
            const nsamples_p:   pointer = this.#malloc(8);
            const samplerate_p: pointer = this.#malloc(8);
            const code_p:       pointer = this.#malloc(32);
            
            nsamplestoread = Math.max(0, nsamplestoread);
            if(nsamplestoread < 0)
                return new Error('Invalid number of samples to read')
            const samplebuffersize:number = 
                nsamplestoread * Int32Array.BYTES_PER_ELEMENT;
            const samplebuffer_p:pointer = 
                (nsamplestoread > 0) ? this.#malloc(samplebuffersize) : 0;

            const rc:number = this.wasm._read_mseed(
                buffer_p,
                BigInt(buffer.length), 
                starttime_p, 
                endtime_p, 
                nsamples_p, 
                samplerate_p, 
                code_p,
                samplebuffer_p,
                nsamplestoread,
            );
            if(rc != 0)
                return new Error(`Could not read mseed. (${rc})`)
        
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
                ).buffer,
            ).replace(/\0/g, '');

            const samplebuffer:Int32Array|null = 
                (nsamplestoread > 0)
                ? new Int32Array(
                    this.wasm.HEAPU8.slice(
                        samplebuffer_p, 
                        samplebuffer_p + samplebuffersize
                    ).buffer
                )
                : null;
            
        
            const t_start = new Date(Number(starttime_u64[0]! / 1000000n))
            const t_end   = new Date(Number(endtime_u64[0]! / 1000000n))
            return {
                meta: {
                    start:      t_start,
                    end:        t_end,
                    code:       code,
                    samplerate: Number(samplerate_f64[0]),
                    nsamples:   Number(nsamples_u64[0])
                },
                data: samplebuffer,
            }
        } catch(e) {
            console.log('WASM error:', e)
            return e as Error;
        } finally {
            this.#free_allocated_buffers();
        }
    }

    async read_data(file:File): Promise<Int32Array|Error> {
        const meta:MSEED_Meta|Error = await this.read_metadata(file);
        if(meta instanceof Error)
            return meta as Error;

        const readresult:MSEED_ReadResult|Error = 
            await this._read(file, meta.nsamples)
        return (readresult instanceof Error)? readresult : readresult.data!;
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


