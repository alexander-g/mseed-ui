import { preact, Signal, signals, JSX } from "../dep.ts"

import {type MSEED_Meta} from "../../wasm-cpp/mseed-wasm.ts"
import type { QuakeEvent } from "../lib/quakeml.ts";
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
    $events:    Readonly<Signal<QuakeEvent[]> >,
    on_click: (selected_file_index:number, i0:number, i1:number) => void,
}> {
    render(): JSX.Element {
        return <D3Heatamp
            $data    = {this.$transformed_files}
            $x_axis  = {this.$x_axis}
            $y_axis  = {this.$y_axis}
            $x_axis_markers = {this.$transformed_events}
            on_click = {this.on_heatmap_select}
        />
    }

    /** Get the time of each event */
    $transformed_events:Readonly<Signal<number[]>> = signals.computed(() => {
        return this.props.$events.value.map( e => e.time.getTime()/1000 )
    })

    private $transformed:Readonly<Signal<TransformedHeatmapData>> = signals.computed(() => {
        const files:MSEED_Meta[] = this.props.$files.value
        const inference:InferenceEvent[] = this.props.$inference.value
        return this.transform_heatmap_data(files, inference)
    })

    $transformed_files:Readonly<Signal<DataItemWithFile[]>> = signals.computed(() => {
        return this.$transformed.value.files
    })

    $x_axis:Readonly<Signal<number[]>> = signals.computed(() => {
        return this.$transformed.value.x_axis
    })

    $y_axis:Readonly<Signal<string[]>> = signals.computed(() => {
        return this.$transformed.value.y_axis
    })


    transform_heatmap_data(
        files:     MSEED_Meta[], 
        inference: InferenceEvent[]
    ):TransformedHeatmapData {
        if(files.length == 0) {
            return {
                files: [],
                x_axis: [],
                y_axis: [],
            }
        }

        const inferencemap:Record<string, Date[]> = inference2map(inference)
        const all_times:number[] = files
            .map((item:MSEED_Meta) => [item.start.getTime(), item.end.getTime()])
            .flat()
            .sort((a:number,b:number)=>a-b)

        const tmin:number = all_times[0]! / 1000
        const tmax:number = all_times[all_times.length-1]! / 1000
        const tstart:number = tmin - (tmin % HARDCODED_BIN_LENGTH_SECONDS)
        const tend:number = tmax - (tmax % HARDCODED_BIN_LENGTH_SECONDS)
        const x_axis:number[] = range(tstart, tend, HARDCODED_BIN_LENGTH_SECONDS)

        const all_codes:string[] = Array.from(
            new Set(files.map((item:MSEED_Meta) => item.code))
        ).sort()

        const all_items:DataItemWithFile[] = []
        for(let fileindex:number = 0; fileindex < files.length; fileindex++) {
            const meta:MSEED_Meta = files[fileindex]!
            const meta_start_s:number = meta.start.getTime() / 1000
            const meta_end_s:number = meta.end.getTime() / 1000
            const t0:number = meta_start_s - (meta_start_s % HARDCODED_BIN_LENGTH_SECONDS)
            const t1:number = meta_end_s - (meta_end_s % HARDCODED_BIN_LENGTH_SECONDS)
            const index0:number = (t0 - tstart) / HARDCODED_BIN_LENGTH_SECONDS
            const index1:number = (t1 - tstart) / HARDCODED_BIN_LENGTH_SECONDS
            const yindex:number = all_codes.indexOf(meta.code)

            for(let j:number = index0; j < index1 + 1; j++) {
                const timestamp:number = j * HARDCODED_BIN_LENGTH_SECONDS + tstart
                const date:Date = new Date(timestamp * 1000)
                all_items.push({
                    x: j,
                    y: yindex,
                    value: find_inference(inferencemap, meta.code, date) * 0.9 + Math.random() * 0.1,
                    fileindex,
                    timestamp,
                })
            }
        }

        return {
            files: all_items,
            x_axis,
            y_axis: all_codes,
        }
    }


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
        
        const i0 = (start_seconds_within_file) * meta.samplerate;
        const i1 = (start_seconds_within_file + HARDCODED_BIN_LENGTH_SECONDS) * meta.samplerate;
        this.props.on_click(item.fileindex, i0, i1);
    }

}


type TransformedHeatmapData = {
    files: DataItemWithFile[],
    x_axis: number[],
    y_axis: string[],
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

