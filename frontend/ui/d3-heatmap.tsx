import { preact, Signal, signals, JSX } from "../dep.ts"

import * as d3 from "d3";





export type DataItem = {
    x:     number,
    y:     number,
    value: number,
}



export class D3Heatamp extends preact.Component<{
    $data:  Readonly<Signal<DataItem[]>>,
    $x_axis:Readonly<Signal<number[]>>,
    $y_axis:Readonly<Signal<string[]>>,

    width:  number,
    height: number,

    on_click: (selected:number) => void,
}> {
    static override defaultProps = { width: 1400, height: 500 };

    svg_ref:     preact.RefObject<SVGSVGElement> = preact.createRef();
    root_ref:    preact.RefObject<SVGGElement> = preact.createRef();
    heatmap_ref: preact.RefObject<SVGGElement> = preact.createRef();
    xaxis_ref:   preact.RefObject<SVGGElement> = preact.createRef();
    yaxis_ref:   preact.RefObject<SVGGElement> = preact.createRef();
    svgimage_ref:  preact.RefObject<SVGImageElement> = preact.createRef();

    private margin = { top: 20, right: 5, bottom: 30, left: 60 };



    render(): JSX.Element {
        const { width, height } = this.props;
        const w:number = width - this.margin.left - this.margin.right;
        const h:number = height - this.margin.top - this.margin.bottom;
        
        const svg_width:number  = width + this.margin.left + this.margin.right
        const svg_height:number = height + this.margin.top + this.margin.bottom

        return <div class="d3-container">
            <svg 
                ref    = {this.svg_ref} 
                // dont understand why by .toFixed() is needed
                width  = {svg_width.toFixed(0)}
                height = {svg_height.toFixed(0)}
            >
                <g 
                    ref = {this.root_ref}
                    transform = {`translate(${this.margin.left},${this.margin.top})`} 
                >
                    
                    <g 
                        ref = {this.heatmap_ref}
                        transform = {this.$transform_str}
                    >
                        
                        <image 
                            x="0" 
                            y="0" 
                            width={`${w}`} 
                            height={`${h}`} 
                            ref={this.svgimage_ref} 
                            image-rendering='pixelated'
                            onClick = {this.svgimage_onclick}
                            preserveAspectRatio = "none"
                        />
                    </g>


                    
                    <g ref={this.xaxis_ref} class="axis" transform={`translate(0,${h})`} />
                    <g ref={this.yaxis_ref} class="axis" />
                </g>
            </svg>
        </div>
    }

    #rowscols:{cols:number, rows:number}|null = null

    /** The current number of rows and columns. Cached here to avoid recomputation */
    private $rowscols:Signal<{cols:number, rows:number}|null> = new Signal(null)

    #_ = this.props.$data.subscribe( () => {
        this.#rowscols = this.#get_rows_cols()
        this.$rowscols.value = this.#rowscols
    } )


    /** The currently active D3 zoom/translation state */
    private $zoom_transform:Signal<d3.ZoomTransform> = new Signal(
        new d3.ZoomTransform( /*k = */ 1, /*x = */  0, /*y = */  0 )
    )

    override componentDidMount(): void {
        const zoom:d3.ZoomBehavior<SVGSVGElement, unknown> = 
            d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([1, 25])
            .on("zoom", (event) => this.$zoom_transform.value = event.transform);
        d3.select(this.svg_ref.current!).call(zoom);
    }


    /** D3 ZoomTransform converted to a CSS transform string */
    private $transform_str:Readonly<Signal<string>> = signals.computed( () => {
        const t:d3.ZoomTransform = this.$zoom_transform.value;

        const k: number = t.k ?? 1;
        const tx:number = t.x ?? 0;
        const ty:number = t.y ?? 0;
        const transform_str = `translate(${tx},${ty}) scale(${k})`;
        return transform_str;
    })


    update_axes = () => {
        // NOTE: accessing $signals up here to make sure they are subscribed to
        const t:d3.ZoomTransform = this.$zoom_transform.value
        const x_axis:number[]    = this.props.$x_axis.value
        const { width, height }  = this.props;
        const colsrows:{cols:number, rows:number}|null = this.$rowscols.value
        if(colsrows == null)
            return;
        const { cols, rows } = colsrows;

        const w:number = width  - this.margin.left - this.margin.right;
        const h:number = height - this.margin.top  - this.margin.bottom;

        const zx:d3.ScaleLinear<number,number> = t.rescaleX(
            d3.scaleLinear()
            .domain([0, cols])
            .range([0, w])
        )
        const zy:d3.ScaleLinear<number,number> = t.rescaleY(
            d3.scaleLinear()
            .domain([0, rows])
            .range([0, h])
        )


        const step_size_x:number = Math.floor((zx.invert(w) - zx.invert(0)) / 10)

        // index of first data column at plot position 0 (clipped)
        const first_col_in_bounds:number = Math.max(zx.invert(0), 0)
        const last_col_in_bounds:number = Math.min(zx.invert(w), cols)
        

        const d3_x_axis:d3.Axis<d3.NumberValue> = 
            d3.axisBottom(zx)
            .tickValues(
                d3.range( 
                    Math.ceil(first_col_in_bounds), 
                    Math.floor(last_col_in_bounds), 
                    step_size_x 
                )
            )
            // TODO: too many assumptions for this component
            .tickFormat( t => strftime('%Y-%m-%dT%H:%M:%S', new Date( x_axis[Number(t)]! * 1000 ) )  )
        const d3_y_axis:d3.Axis<d3.NumberValue> = 
            d3.axisLeft(zy)
            .tickValues(d3.range(0, rows, 5))
            .tickFormat( d => Math.floor(Number(d)).toFixed(0)
        )

        d3.select(this.xaxis_ref.current)
            // @ts-ignore this is correct 
            .call(d3_x_axis);
        d3.select(this.yaxis_ref.current)
            // @ts-ignore this is correct 
            .call(d3_y_axis);
    }
    #_2 = signals.effect( this.update_axes )


    /** Compute the current number of rows and columns from the data input */
    #get_rows_cols(): {cols:number, rows:number}|null {
        const data:DataItem[] = this.props.$data.value;
        if(data.length == 0)
            return null;

        const all_x:number[]  = data.map( item => item.x ).sort((a,b)=>a-b)
        const all_y:number[]  = data.map( item => item.y ).sort((a,b)=>a-b)


        const ncols:number = all_x[all_x.length-1]! - all_x[0]!
        const nrows:number = all_y[all_y.length-1]! - all_y[0]!

        return {
            cols: ncols,
            rows: nrows,
        }
    }

    /** Render the current data input onto the <image> element. */
    update_heatmap = async () => {
        // NOTE: $data.value is up here to make sure its subscribed
        const data:DataItem[] = this.props.$data.value;
        const colsrows:{cols:number, rows:number}|null = this.$rowscols.value
        if(colsrows == null)
            return;
        const { cols, rows } = colsrows;
        const [h,w] = [rows, cols];

        const canvas = new OffscreenCanvas(w, h);
        const ctx:OffscreenRenderingContext = canvas.getContext('2d')!;
        ctx.clearRect(0,0,w,h)
        ctx.fillStyle = "#888888";
        ctx.fillRect(0, 0, w, h);


        const imdata:ImageData = ctx.getImageData(0,0,w,h);
        const buffer:Uint8ClampedArray = imdata.data; // w*h*4
        for(const item of data) {
            const index:number = item.y * w * 4 + item.x * 4;
            buffer[index + 0] = item.value * 255; 
            buffer[index + 1] = item.value * 255;
            buffer[index + 2] = 0;
            buffer[index + 3] = 255;
        }
        ctx.putImageData(imdata,0,0);


        const blob = await canvas.convertToBlob({ type: 'image/png' });
        const f = new File([blob], "file.png", { type: blob.type });
        
        const svgimage:SVGImageElement = this.svgimage_ref.current!
        svgimage.href.baseVal = URL.createObjectURL(f)
    }
    #_1 = signals.effect( () => { this.update_heatmap() } )


    svgimage_onclick:preact.MouseEventHandler<SVGImageElement> = (event) => {
        const [mx, my] = d3.pointer(event, this.svgimage_ref.current);
        const { width, height } = this.props;
        const w:number = width - this.margin.left - this.margin.right;
        const h:number = height - this.margin.top - this.margin.bottom;
        const { cols, rows } = this.#rowscols!;

        const imx:number = Math.floor((mx / w) * cols);
        const imy:number = Math.floor((my / h) * rows);


        const items:DataItem[] = this.props.$data.value
        for(const itemindex in items) {
            const item:DataItem = items[itemindex]!;
            if(item.y == imy && item.x == imx) {
                //console.log(item, this.props.$y_axis.value[item.y], new Date( this.props.$x_axis.value[item.x]! * 1000 ));
                console.log(`Clicked on data item ${itemindex} at ${[imx, imy]}`)
                this.props.on_click( Number(itemindex) );
                return;
            }
        }
        console.log(`No data item at ${[imx, imy]}`)
    }


    // #id = self.crypto.randomUUID();

    // #outer_dimmer(): JSX.Element|null {
    //     const mask_id = `mask-${this.#id}`

    //     const { width = 800, height = 500 } = this.props;
    //     const w:number = width - this.margin.left - this.margin.right;
    //     const h:number = height - this.margin.top - this.margin.bottom;

    //     return <>
    //         <mask id = {mask_id} mask-type="luminance">
    //             <rect 
    //                 x      = "0" 
    //                 y      = "0" 
    //                 width  = {`${width}`} 
    //                 height = {`${height}`} 
    //                 fill   = "white" 
    //             />

    //             <rect 
    //                 x      = {`${this.margin.left}`} 
    //                 y      = {`${this.margin.top}`} 
    //                 width  = {`${w}`} 
    //                 height = {`${h}`} 
    //                 fill   = "black" 
    //             />
    //         </mask>

    //         <rect 
    //             x       = "0" 
    //             y       = "0" 
    //             width   = {`${width}`} 
    //             height  = {`${height}`} 
    //             fill    = "white" 
    //             opacity = "1.0" 
    //             mask    = {`url(#${mask_id})`}
    //         />
    //     </>
    // }
}


function strftime(fmt:string, d:Date){
    const z = (n:number) => String(n).padStart(2,'0');
    const map:Record<string, string> = {
        '%Y': String(d.getFullYear()),
        '%m': z(d.getMonth()+1),
        '%d': z(d.getDate()),
        '%H': z(d.getHours()),
        '%M': z(d.getMinutes()),
        '%S': z(d.getSeconds()),
    };
    return fmt.replace(/%[YmdHMS]/g, (m:string) => map[m] ?? m);
}