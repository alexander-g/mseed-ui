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

    /** Optional positions along the x axis to mark with a vertical line */
    $x_axis_markers?: Readonly<Signal<number[]>>

    /** Optional row indices to mark with a horizontal marker */
    $y_axis_markers?: Readonly<Signal<number[]>>

    /** Called when user clicks on a valid item */
    on_click: (selected:number) => void,

    /** Called when user hovers on a valid item, null otherwise */
    on_hover?: (selected:number|null) => void,
}> {
    private static next_clip_id:number = 0
    private clip_path_id:string = `heatmap-clip-${D3Heatamp.next_clip_id++}`


    container_ref: preact.RefObject<HTMLDivElement> = preact.createRef();
    svg_ref:     preact.RefObject<SVGSVGElement> = preact.createRef();
    root_ref:    preact.RefObject<SVGGElement> = preact.createRef();
    heatmap_ref: preact.RefObject<SVGGElement> = preact.createRef();
    xaxis_ref:   preact.RefObject<SVGGElement> = preact.createRef();
    yaxis_ref:   preact.RefObject<SVGGElement> = preact.createRef();
    svgimage_ref:  preact.RefObject<SVGImageElement> = preact.createRef();
    resize_observer: ResizeObserver|null = null

    private margin = { top: 20, right: 5, bottom: 30, left: 60 };
    private $container_size: Signal<Size> = new Signal({ width: 0, height: 0 })
    private $hover_position: Signal<HoverPosition|null> = new Signal(null)

    private $dimensions:Readonly<Signal<SVGPlotDimensions>> = signals.computed(() =>
        this.#get_dimensions()
    )
    private $svg_viewbox:Readonly<Signal<string>> = signals.computed(() => {
        const dimensions:SVGPlotDimensions = this.$dimensions.value
        return `0 0 ${dimensions.svg_width} ${dimensions.svg_height}`
    })
    private $plot_width:Readonly<Signal<number>> = signals.computed(() =>
        this.$dimensions.value.plot_width
    )
    private $plot_height:Readonly<Signal<number>> = signals.computed(() =>
        this.$dimensions.value.plot_height
    )
    private $x_axis_transform:Readonly<Signal<string>> = signals.computed(() =>
        `translate(0,${this.$plot_height.value})`
    )


    render(): JSX.Element {
        return <div
            class = "d3-container"
            style = {{ width: '100%', height: '100%' }}
            ref   = {this.container_ref}
        >
                <svg 
                    width   = "100%"
                    height  = "100%"
                    viewBox = {this.$svg_viewbox}
                    ref     = {this.svg_ref} 
                >
                <defs>
                    {/* mask to make sure the image stays withing plot boundaries */}
                    <clipPath id={this.clip_path_id}>
                        <rect
                            x = "0"
                            y = "0"
                            width = {this.$plot_width}
                            height = {this.$plot_height}
                        />
                    </clipPath>
                </defs>

                <g 
                    ref = {this.root_ref}
                    transform = {`translate(${this.margin.left},${this.margin.top})`} 
                >
                    
                    <g clip-path={`url(#${this.clip_path_id})`}>
                        <g 
                            ref = {this.heatmap_ref}
                            transform = {this.$transform_str}
                        >
                            <image 
                                x      = "0" 
                                y      = "0" 
                                width  = {this.$plot_width} 
                                height = {this.$plot_height} 
                                image-rendering = 'pixelated'
                                preserveAspectRatio = "none"
                                onClick = {this.#svgimage_onclick}
                                onMouseMove = {this.#svgimage_onmousemove}
                                onMouseLeave = {this.#svgimage_onmouseleave}
                                ref = {this.svgimage_ref} 
                            />
                        </g>
                        <g 
                            transform = {this.$transform_str}
                            style = {{ pointerEvents: 'none' }}
                        >
                            {this.$x_marker_lines}
                            {this.$y_marker_rects}
                        </g>
                    </g>


                    
                    <g 
                        class = "axis" 
                        transform = {this.$x_axis_transform} 
                        ref = {this.xaxis_ref} 
                    />
                    <g ref={this.yaxis_ref} class="axis" />
                    {this.$hover_overlay}
                </g>
            </svg>
        </div>
    }


    /** The current number of rows and columns. Cached here to avoid recomputation */
    private $rowscols:Signal<{cols:number, rows:number}|null> = new Signal(null)

    #_ = this.props.$data.subscribe( () => {
        this.$rowscols.value = this.#get_rows_cols()
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

        const container:HTMLDivElement|null = this.container_ref.current
        if(container != null) {
            this.#update_container_size(container.clientWidth, container.clientHeight)
            this.resize_observer = new ResizeObserver(this.#on_container_resize)
            this.resize_observer.observe(container)
        }
    }

    override componentWillUnmount(): void {
        this.resize_observer?.disconnect()
        this.resize_observer = null
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

    private $x_marker_positions:Readonly<Signal<number[]>> = signals.computed(() => {
        const colsrows:{cols:number, rows:number}|null = this.$rowscols.value
        if(colsrows == null)
            return []
        return this.#x_marker_positions(this.$plot_width.value, colsrows.cols)
    })

    private $x_marker_lines:Readonly<Signal<JSX.Element[]>> = signals.computed(() => {
        const colsrows:{cols:number, rows:number}|null = this.$rowscols.value
        if(colsrows == null)
            return []
        if(colsrows.rows <= 0)
            return []

        const marker_positions:number[] = this.$x_marker_positions.value
        const plot_width:number  = this.$plot_width.value
        const plot_height:number = this.$plot_height.value
        const marker_width:number = plot_width / colsrows.cols

        return marker_positions.map((x:number, marker_index:number) => (
            <rect
                key          = {`${marker_index}-${x}`}
                x            = {`${x}`}
                y            = "0"
                width        = {`${marker_width}`}
                height       = {`${plot_height}`}
                fill         = "#4cc9f0"
                fill-opacity = "0.5"
                stroke       = "none"
            />
        ))
    })

    private $y_marker_rects:Readonly<Signal<JSX.Element[]>> = signals.computed(() => {
        const colsrows:{cols:number, rows:number}|null = this.$rowscols.value
        if(colsrows == null)
            return []
        if(colsrows.rows <= 0)
            return []

        const plot_width:number  = this.$plot_width.value
        const plot_height:number = this.$plot_height.value
        const marker_positions:number[] = this.#y_marker_positions(plot_height, colsrows.rows)
        const marker_height:number = plot_height / colsrows.rows

        return marker_positions.map((y:number, marker_index:number) => (
            <rect
                key          = {`${marker_index}-${y}`}
                x            = "0"
                y            = {`${y}`}
                width        = {`${plot_width}`}
                height       = {`${marker_height}`}
                fill         = "#4cc9f0"
                fill-opacity = "0.5"
                stroke       = "none"
            />
        ))
    })

    private $hover_overlay:Readonly<Signal<JSX.Element|null>> = signals.computed(() => {
        const hover:HoverPosition|null = this.$hover_position.value
        if(hover == null)
            return null

        return <g
            transform = {`translate(${hover.overlay_x},${hover.overlay_y})`}
            style = {{ pointerEvents: 'none', fontFamily:'sans' }}
        >
            <rect
                x = "0"
                y = "0"
                width = "200"
                height = "56"
                fill = "#000000"
                fill-opacity = "0.75"
                stroke = "#ffffff"
                stroke-opacity = "0.4"
            />
            <text x = "8" y = "17" fill = "#ffffff" font-size = "11">
                {`${hover.x_label}`}
            </text>
            <text x = "8" y = "33" fill = "#ffffff" font-size = "11">
                {`${hover.y_label}`}
            </text>
            <text x = "8" y = "49" fill = "#ffffff" font-size = "11">
                {hover.data_label}
            </text>
        </g>
    })


    update_axes = () => {
        // NOTE: accessing $signals up here to make sure they are subscribed to
        const t:d3.ZoomTransform = this.$zoom_transform.value
        const x_axis:number[]    = this.props.$x_axis.value
        const colsrows:{cols:number, rows:number}|null = this.$rowscols.value
        if(colsrows == null)
            return;
        const { cols, rows } = colsrows;

        const dimensions:SVGPlotDimensions = this.#get_dimensions()
        const w:number = dimensions.plot_width
        const h:number = dimensions.plot_height

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


        const ncols:number = all_x[all_x.length-1]! - all_x[0]! +1
        const nrows:number = all_y[all_y.length-1]! - all_y[0]! +1

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


    #svgimage_onclick:preact.MouseEventHandler<SVGImageElement> = (event) => {
        const [mx, my] = d3.pointer(event, this.svgimage_ref.current);
        const dimensions:SVGPlotDimensions = this.#get_dimensions()
        const w:number = dimensions.plot_width
        const h:number = dimensions.plot_height
        const { cols, rows } = this.$rowscols.value!;

        const imx:number = Math.floor((mx / w) * cols);
        const imy:number = Math.floor((my / h) * rows);


        const items:DataItem[] = this.props.$data.value
        for(const itemindex in items) {
            const item:DataItem = items[itemindex]!;
            if(item.y == imy && item.x == imx) {
                console.log(`Clicked on data item ${itemindex} at ${[imx, imy]}`)
                this.props.on_click( Number(itemindex) );
                return;
            }
        }
        console.log(`No data item at ${[imx, imy]}`)
    }

    #svgimage_onmousemove:preact.MouseEventHandler<SVGImageElement> = (event) => {
        const [mx, my] = d3.pointer(event, this.svgimage_ref.current)
        const [root_x, root_y] = d3.pointer(event, this.root_ref.current)
        const position:HoverPosition|null = 
            this.#hover_position_from_mouse(mx, my, root_x, root_y)
        this.$hover_position.value = position
        if(this.props.on_hover)
            this.props.on_hover(position?.item_index ?? null)
    }

    #svgimage_onmouseleave:preact.MouseEventHandler<SVGImageElement> = () => {
        this.$hover_position.value = null
        if(this.props.on_hover)
            this.props.on_hover(null)
    }


    /** Map marker values from x axis space to x plot coordinates */
    #x_marker_positions(plot_width:number, cols:number): number[] {
        const markers:number[]|undefined = this.props.$x_axis_markers?.value
        if(markers == undefined || markers.length == 0)
            return []
        if(cols <= 0)
            return []

        const x_axis:number[] = this.props.$x_axis.value
        const positions:number[] = []

        for(const marker of markers) {
            const col_position:number|null = this.#marker_column_position(marker, x_axis, cols)
            if(col_position == null)
                continue

            const x_position:number = (col_position / cols) * plot_width
            positions.push(x_position)
        }

        return positions
    }

    /** Map y marker row indices to plot coordinates */
    #y_marker_positions(plot_height:number, rows:number): number[] {
        const markers:number[]|undefined = this.props.$y_axis_markers?.value
        if(markers == undefined || markers.length == 0)
            return []
        if(rows <= 0)
            return []

        const positions:number[] = []
        for(const marker of markers) {
            if(!Number.isFinite(marker))
                continue
            if(marker < 0 || marker >= rows)
                continue

            positions.push((marker / rows) * plot_height)
        }

        return positions
    }

    /** Convert marker value to a column index using x axis interpolation */
    #marker_column_position(marker:number, x_axis:number[], cols:number): number|null {
        if(!Number.isFinite(marker))
            return null
        if(x_axis.length < 2) {
            if(marker >= 0 && marker <= cols)
                return marker
            return null
        }

        const first_x:number = x_axis[0]!
        const last_x:number = x_axis[x_axis.length - 1]!
        if(marker < first_x || marker > last_x) {
            if(marker >= 0 && marker <= cols)
                return marker
            return null
        }

        let left:number = 0
        let right:number = x_axis.length - 1
        while(left < right) {
            const mid:number = Math.floor((left + right) / 2)
            const mid_value:number = x_axis[mid]!
            if(mid_value < marker)
                left = mid + 1
            else
                right = mid
        }

        const upper:number = left
        if(upper <= 0)
            return 0

        const lower:number = upper - 1
        const lower_value:number = x_axis[lower]!
        const upper_value:number = x_axis[upper]!
        const delta:number = upper_value - lower_value
        if(delta == 0)
            return lower

        const ratio:number = (marker - lower_value) / delta
        return lower + ratio
    }


    /** Compute svg and plot dimensions from container size */
    #get_dimensions(): SVGPlotDimensions {
        const measured:Size = this.$container_size.value

        const svg_width:number   = measured.width
        const svg_height:number  = measured.height
        const plot_width:number  = 
            Math.max(svg_width - this.margin.left - this.margin.right, 1)
        const plot_height:number = 
            Math.max(svg_height - this.margin.top - this.margin.bottom, 1)

        return {svg_width, svg_height, plot_width, plot_height}
    }

    /** Update container dimensions when parent size changes */
    #update_container_size(width:number, height:number): void {
        const next_width:number = Math.max(Math.floor(width), 0)
        const next_height:number = Math.max(Math.floor(height), 0)
        const current:Size = this.$container_size.value
        if(current.width == next_width && current.height == next_height)
            return

        this.$container_size.value = {
            width: next_width,
            height: next_height,
        }
    }

    /** Called when the top <div> changes size */
    #on_container_resize = (entries:ResizeObserverEntry[]) => {
        const first:ResizeObserverEntry|undefined = entries[0]
        if(first == undefined)
            return

        this.#update_container_size(
            first.contentRect.width, 
            first.contentRect.height
        )
    }

    /** Map current mouse position to overlay values */
    #hover_position_from_mouse(
        mx:number, 
        my:number, 
        root_x:number, 
        root_y:number
    ): HoverPosition|null {
        const colsrows:{cols:number, rows:number}|null = this.$rowscols.value
        if(colsrows == null)
            return null
        if(colsrows.cols <= 0 || colsrows.rows <= 0)
            return null

        const dimensions:SVGPlotDimensions = this.#get_dimensions()
        const w:number = dimensions.plot_width
        const h:number = dimensions.plot_height

        const clamped_x:number = Math.max(0, Math.min(mx, w))
        const clamped_y:number = Math.max(0, Math.min(my, h))

        const col:number = Math.min(
            Math.floor((clamped_x / w) * colsrows.cols),
            colsrows.cols - 1,
        )
        const row:number = Math.min(
            Math.floor((clamped_y / h) * colsrows.rows),
            colsrows.rows - 1,
        )
        if(col < 0 || row < 0)
            return null

        const x_axis:number[] = this.props.$x_axis.value
        const y_axis:string[] = this.props.$y_axis.value
        const x_seconds:number|undefined = x_axis[col]
        const y_value:string|undefined = y_axis[row]
        if(x_seconds == undefined || y_value == undefined)
            return null

        let hover_item_index:number|null = this.props.$data.value.findIndex(
            (item:DataItem) => item.x == col && item.y == row
        )
        if(hover_item_index < 0)
            hover_item_index = null;
        const hover_item:DataItem|undefined = 
            (hover_item_index != null)
            ? this.props.$data.value[hover_item_index] 
            : undefined;
        const data_label:string = 
            (hover_item == undefined)
            ? 'no data'
            : ``

        const overlay_x:number = Math.max(0, Math.floor(root_x) + 12)
        const overlay_y:number = Math.max(0, Math.floor(root_y) + 12)

        return {
            overlay_x,
            overlay_y,
            x_label: strftime('%Y-%m-%dT%H:%M:%S', new Date(x_seconds * 1000)),
            y_label: y_value,
            data_label,
            item_index: hover_item_index,
        }
    }
}

type SVGPlotDimensions = {
    svg_width:  number, 
    svg_height:  number, 
    plot_width:  number, 
    plot_height: number 
}


type Size = {
    width:  number,
    height: number,
}

type HoverPosition = {
    overlay_x: number,
    overlay_y: number,
    x_label: string,
    y_label: string,
    data_label: string,
    item_index: number|null
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
