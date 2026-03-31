import { preact, Signal, signals, JSX } from "../dep.ts"

import {type MSEED_Meta} from "../../wasm-cpp/mseed-wasm.ts"
import { D3Heatamp, type DataItem } from "../ui/d3-heatmap.tsx"

import { range } from 'd3';



// 5 minutes atm
const HARDCODED_BIN_LENGTH_SECONDS:number = 60*5;


type DataItemWithFile = DataItem & {
    fileindex: number,
    timestamp: number,
}

export type InferenceEvent = {
    code:string,
    time:Date
}



export class MSEED_Heatmap extends preact.Component<{
    $files: Readonly< Signal<MSEED_Meta[]> >,
    $inference: Readonly<Signal<InferenceEvent[]> >,
    on_click: (selected_file_index:number, i0:number, i1:number) => void,
}> {
    render(): JSX.Element {
        return <D3Heatamp
            $data    = {this.$transformed_files}
            $x_axis  = {this.$x_axis}
            $y_axis  = {this.$y_axis}
            on_click = {this.on_heatmap_select}
        />
    }


    $transformed_files:Signal<DataItemWithFile[]> = new Signal([])
    $x_axis:Signal<number[]> = new Signal([])
    $y_axis:Signal<string[]> = new Signal([])

    #_ = this.props.$files.subscribe( () => {
        const files:MSEED_Meta[] = this.props.$files.value;
        if(files.length == 0) {
            this.$transformed_files.value = []
            return;
        }

        const inference:InferenceEvent[] = this.props.$inference.value;
        const inferencemap = inference2map(inference)


        const all_times:number[] = 
            files.map( item => [item.start.getTime(), item.end.getTime()] )
            .flat()
            .sort((a,b)=>a-b)
        
        const tmin:number = all_times[0]! / 1000
        const tmax:number = all_times[all_times.length-1]! / 1000
        const tstart:number = tmin - (tmin % HARDCODED_BIN_LENGTH_SECONDS)
        const tend:  number = tmax - (tmax % HARDCODED_BIN_LENGTH_SECONDS)

        const x_axis:number[] = range(tstart, tend, HARDCODED_BIN_LENGTH_SECONDS)
        this.$x_axis.value = x_axis;


        const all_codes:string[] = Array.from(
            new Set(files.map( item => item.code ))
        ).sort()
        this.$y_axis.value = all_codes;

        const all_items:DataItemWithFile[] = []
        for(const i in files) {
            const meta:MSEED_Meta = files[i]!

            const meta_start_s:number = meta.start.getTime() / 1000
            const meta_end_s:number   = meta.end.getTime()   / 1000

            const t0:number = 
                meta_start_s - (meta_start_s % HARDCODED_BIN_LENGTH_SECONDS);
            const t1:number = 
                meta_end_s   - (meta_end_s   % HARDCODED_BIN_LENGTH_SECONDS);
            
            const index0:number = (t0 - tstart) / HARDCODED_BIN_LENGTH_SECONDS;
            const index1:number = (t1 - tstart) / HARDCODED_BIN_LENGTH_SECONDS;
            const n:number = index1 - index0 + 1
            const yindex:number = all_codes.indexOf(meta.code)


            for(let j:number = index0; j < index1+1; j++) {
                const d = new Date( (j*HARDCODED_BIN_LENGTH_SECONDS+tstart)*1000 )
                all_items.push( 
                    {
                        x:         j, 
                        y:         yindex, 
                        //value:     Math.random(), 
                        value:     find_inference(inferencemap, meta.code, d) * 0.9 + Math.random()*0.1,
                        fileindex: Number(i), 
                        timestamp: j*HARDCODED_BIN_LENGTH_SECONDS+tstart 
                    } 
                );
            }
        }
        this.$transformed_files.value = all_items;
    })


    on_heatmap_select = (index:number) => {
        const item:DataItemWithFile|undefined = this.$transformed_files.value[index];
        if(item == undefined) {
            console.log(`No corresponding item for index ${index}`)
            return;
        }
        const meta:MSEED_Meta = this.props.$files.value[item.fileindex]!
        
        const meta_start_s = meta.start.getTime() / 1000
        const t0 = item.timestamp;

        const start_seconds_within_file = t0 - meta_start_s;
        console.log('DEBUG:', meta_start_s, t0, start_seconds_within_file)
        
        const i0 = (start_seconds_within_file) * meta.samplerate;
        const i1 = (start_seconds_within_file + HARDCODED_BIN_LENGTH_SECONDS) * meta.samplerate;
        this.props.on_click(item.fileindex, i0, i1);
    }


    //doesnt work for some reason
/*     $transformed_files:Readonly<Signal<DataItem[]>> = signals.computed( () => {
        const files:MSEED_Meta[] = this.props.$files.value;
        console.log('transform:', files)

        const all_items:DataItem[] = []
        for(const i in files) {
            const meta:MSEED_Meta = files[i]!

            const meta_start:number = meta.start.getTime()
            const meta_end:number   = meta.end.getTime()

            const t0:number = 
                meta_start - (meta_start % HARDCODED_BIN_LENGTH_SECONDS);
            const t1:number = 
                meta_end   - (meta_end   % HARDCODED_BIN_LENGTH_SECONDS);

            for(let t:number = t0; t < t1; t+=HARDCODED_BIN_LENGTH_SECONDS)
                all_items.push( {x:t, y:Number(i), value:Math.random()} )
        }
        return all_items;
    }) */
}



function inference2map(inferences:InferenceEvent[]): Record<string, Date[]> {
    const output:Record<string, Date[]> = {}
    for(const inference of inferences) {
        output[inference.code] = (output[inference.code] ?? []).concat([inference.time])
    }
    return output;
}

function find_inference(inferencemap:Record<string, Date[]>, code:string, date:Date) {
    for(const eventtime of inferencemap[code] ?? []) {
        if(eventtime.getTime() == date.getTime())
            return 1;
    }
    return 0;
}


function _find_inference(inference:InferenceEvent[], code:string, date:Date) {
    for(const event of inference) {
        if(event.code == code && event.time.getTime() == date.getTime())
            return 1;
    }
    return 0;
}
