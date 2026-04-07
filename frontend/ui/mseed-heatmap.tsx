import { preact, Signal, signals, JSX } from "../dep.ts"

import {type MSEED_Meta} from "../../wasm-cpp/mseed-wasm.ts"
import type { QuakeEvent } from "../lib/quakeml.ts";
import { D3Heatamp, type DataItem as HeatmapDataItem } from "../ui/d3-heatmap.tsx"
import { type Station } from "../lib/station-xml.ts";

import { range } from 'd3';



// 5 minutes atm
const HARDCODED_BIN_LENGTH_SECONDS:number = 60*5;


type HeatmapDataItemWithFile = HeatmapDataItem & {
    mseedindex: number,
    timestamp:  number,
}

export type InferenceEvent = {
    code:string,
    time:Date
}



export class MSEED_Heatmap extends preact.Component<{
    /** Metadata loaded from MSEED files */
    $mseed_meta:Readonly< Signal<MSEED_Meta[]> >,

    $inference: Readonly<Signal<InferenceEvent[]> >,

    /** Events loaded from QUAKEML files. To be visualized as vertical markers. */
    $events:    Readonly<Signal<QuakeEvent[]> >,

    /** Called when user clicks on a pixel in the heatmap. Receives the
     *  index of the file and the from/to data indices within the file. */
    on_click: (selected_mseed_index:number, i0:number, i1:number) => void,

    /** Called when user hover on a pixel in the heatmap. 
     *  Receives the index of the mseed file.  */
    on_mseed_hover?: (mseed_index:number|null) => void,

    /** The currently highlighted station. Can be both input and output. */
    $highlighted_station?: Signal<Station|null>
}> {
    render(): JSX.Element {
        return <D3Heatamp
            $data    = {this.$transformed_files}
            $x_axis  = {this.$x_axis}
            $y_axis  = {this.$y_axis}
            $x_axis_markers = { this.$event_timestamps }
            $y_axis_markers = { this.$highlighted_rows }
            on_click = {this.on_heatmap_select}
            on_hover = {this.on_heatmap_hover}
        />
    }

    /** Get the time of each event */
    $event_timestamps:Readonly<Signal<number[]>> = signals.computed(() => {
        return this.props.$events.value.map( e => e.time.getTime()/1000 )
    })

    private $transformed:Readonly<Signal<TransformedHeatmapData>> = signals.computed(() => {
        const files:MSEED_Meta[] = this.props.$mseed_meta.value
        const inference:InferenceEvent[] = this.props.$inference.value
        return this.transform_heatmap_data(files, inference, HARDCODED_BIN_LENGTH_SECONDS)
    })

    $transformed_files:Readonly<Signal<HeatmapDataItemWithFile[]>> = signals.computed(() => {
        return this.$transformed.value.items
    })

    $x_axis:Readonly<Signal<number[]>> = signals.computed(() => {
        return this.$transformed.value.x_axis
    })

    $y_axis:Readonly<Signal<string[]>> = signals.computed(() => {
        return this.$transformed.value.y_axis
    })


    /** Itemize MSEED meta data into bins of equal size */
    transform_heatmap_data(
        files:     MSEED_Meta[], 
        inference: InferenceEvent[],
        bin_length_seconds: number,
    ):TransformedHeatmapData {
        if(files.length == 0) {
            return {
                items: [],
                x_axis: [],
                y_axis: [],
            }
        }

        const inferencemap:Record<string, Date[]> = inference2map(inference)
        const all_times:number[] = files
            .map((item:MSEED_Meta) => [item.start.getTime(), item.end.getTime()])
            .flat()
            .sort((a:number,b:number)=>a-b)

        const tmin:number   = all_times[0]! / 1000
        const tmax:number   = all_times[all_times.length-1]! / 1000
        // aligning to bin length
        const tstart:number = tmin - (tmin % bin_length_seconds)
        const tend:number   = tmax - (tmax % bin_length_seconds)
        const x_axis:number[] = range(tstart, tend, bin_length_seconds)

        const all_codes:string[] = Array.from(
            new Set(files.map((item:MSEED_Meta) => item.code))
        ).sort()

        const all_items:HeatmapDataItemWithFile[] = []
        for(let fileindex:number = 0; fileindex < files.length; fileindex++) {
            const meta:MSEED_Meta = files[fileindex]!
            const meta_start_s:number = meta.start.getTime() / 1000
            const meta_end_s:number   = meta.end.getTime() / 1000
            // aligning to bin length
            const t0:number = meta_start_s - (meta_start_s % bin_length_seconds)
            const t1:number = meta_end_s - (meta_end_s % bin_length_seconds)
            const index0:number = (t0 - tstart) / bin_length_seconds
            const index1:number = (t1 - tstart) / bin_length_seconds
            const yindex:number = all_codes.indexOf(meta.code)

            for(let j:number = index0; j < index1 + 1; j++) {
                const timestamp:number = j * bin_length_seconds + tstart
                const date:Date = new Date(timestamp * 1000)
                all_items.push({
                    x: j,
                    y: yindex,
                    value: find_inference(inferencemap, meta.code, date) * 0.9 + Math.random() * 0.1,
                    mseedindex: fileindex,
                    timestamp,
                })
            }
        }

        return {
            items: all_items,
            x_axis,
            y_axis: all_codes,
        }
    }


    on_heatmap_select = (index:number) => {
        const item:HeatmapDataItemWithFile|undefined = this.$transformed_files.value[index];
        if(item == undefined) {
            console.error(`No corresponding item for index ${index}`)
            return;
        }
        const meta:MSEED_Meta = this.props.$mseed_meta.value[item.mseedindex]!
        
        // starting time in the file, but not necessarily in the first item
        const meta_start_s = meta.start.getTime() / 1000
        // need to align to bin length
        // TODO: un-hardcode
        const first_item_start_s = meta_start_s - (meta_start_s % HARDCODED_BIN_LENGTH_SECONDS)
        const t0 = item.timestamp;

        const start_seconds_within_file = t0 - first_item_start_s;
        
        const i0 = (start_seconds_within_file) * meta.samplerate;
        const i1 = (start_seconds_within_file + HARDCODED_BIN_LENGTH_SECONDS) * meta.samplerate;
        this.props.on_click(item.mseedindex, i0, i1);
    }

    /** Transforming the input $highlighted_station to the y-axis */
    private $highlighted_rows:Readonly<Signal<number[]>> = signals.computed( () => {
        const y_axis:string[] = this.$transformed.value.y_axis
        const station:Station|null = this.props.$highlighted_station?.value ?? null;
        if(station == null)
            return []

        const output:number[] = []
        for(const index in y_axis)
            if(y_axis[index]!.includes(`.${station.code}.`))
                output.push(Number(index))
        return output;
    } )

    on_heatmap_hover = (index:number|null) => {
        if(!this.props.on_mseed_hover)
            return;

        if(index == null){
            this.props.on_mseed_hover(null)
            return;
        }
        const item:HeatmapDataItemWithFile|undefined = this.$transformed_files.value[index];
        if(item == undefined) {
            console.error(`No corresponding item for index ${index}`)
            return;
        }
        this.props.on_mseed_hover(item.mseedindex)
    }
}


type TransformedHeatmapData = {
    items:  HeatmapDataItemWithFile[],
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

