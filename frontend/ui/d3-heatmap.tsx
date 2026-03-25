import { preact, Signal, signals, JSX } from "../dep.ts"


import { 
    axisBottom,
    axisLeft,
    interpolateInferno,
    pointer,
    range,
    select,
    scaleBand,
    scaleLinear,
    scaleSequential,
    ScaleBand,
    zoom,
    ZoomTransform,
} from "d3";



export type DataItem = {
    x:     number,
    y:     number,
    value: number,
}



export class D3Heatamp extends preact.Component<{
    //cols:   number,
    //rows:   number,
    $data:  Readonly<Signal<DataItem[]>>,
    width:  number,
    height: number,
}> {
    static override defaultProps = { /* cols: 50, rows: 30, */ width: 1400, height: 500 };

    svg_ref:     preact.RefObject<SVGSVGElement> = preact.createRef();
    root_ref:    preact.RefObject<SVGGElement> = preact.createRef();
    heatmap_ref: preact.RefObject<SVGGElement> = preact.createRef();
    xaxis_ref:   preact.RefObject<SVGGElement> = preact.createRef();
    yaxis_ref:   preact.RefObject<SVGGElement> = preact.createRef();
    svgimage_ref:  preact.RefObject<SVGImageElement> = preact.createRef();

    private margin = { top: 20, right: 5, bottom: 30, left: 60 };

    override state = {
        transform: new ZoomTransform( /*k = */ 1, /*x = */  0, /*y = */  0 )
    };



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

    #_ = this.props.$data.subscribe( () => {
        console.log('$data', this.props.$data.value.length);
        
        this.#rowscols = this.#get_rows_cols()
        this.update_axes()
        this.update_heatmap()
    } )


    override componentDidMount(): void {
        const z = zoom<SVGSVGElement, unknown>()
            .scaleExtent([1, 10])
            .on("zoom", (event) => {
                this.setState({ transform: event.transform });
            });
        select(this.svg_ref.current!).call(z);

        
        const color = scaleSequential(interpolateInferno).domain([0, 1]);
        this.update_heatmap();
        this.update_axes();
    }

    override componentDidUpdate(): void {
        this.update_axes();
    }


    $transform_str: Signal<string> = new Signal('');

    update_axes() {

        const { width, height } = this.props;
        const colsrows = this.#rowscols
        if(colsrows == null)
            return;
        const { cols, rows } = colsrows;

        const w:number = width - this.margin.left - this.margin.right;
        const h:number = height - this.margin.top - this.margin.bottom;

        const t:ZoomTransform = this.state.transform
        const sx = scaleLinear().domain([0, cols]).range([0, w])
        const zx = (t && t.rescaleX)? t.rescaleX(sx) : sx;
        const sy = scaleLinear().domain([0, rows]).range([0, h])
        const zy = (t && t.rescaleY) ? t.rescaleY(sy) : sy;

        select(this.xaxis_ref.current)
            .call(
                // @ts-ignore this is correct 
                axisBottom(zx)
                .tickValues(range(0, cols, 500))
            );
        select(this.yaxis_ref.current)
            .call(
                // @ts-ignore this is correct
                axisLeft(zy)
                .tickValues(range(0, rows, 5))
                .tickFormat( d => Math.floor(Number(d)).toFixed(0)  )
                //.tickFormat( t => strftime('%Y-%m-%d', new Date( 1984, 0, Number(t) ) )  )
            );
        
        
        const k: number = t.k ?? 1;
        const tx:number = t.x ?? 0;
        const ty:number = t.y ?? 0;
        const transform_str = `translate(${tx},${ty}) scale(${k})`;
        this.$transform_str.value = transform_str;

    }



    #get_rows_cols(): {cols:number, rows:number}|null {
        const data:DataItem[] = this.props.$data.value;
        if(data.length == 0)
            return null;

        const all_x:number[]  = data.map( item => item.x ).sort()
        const all_y:number[]  = data.map( item => item.y ).sort()
        const ncols:number = (new Set(all_x)).size
        const nrows:number = (new Set(all_y)).size
        return {
            cols: ncols,
            rows: nrows,
        }
    }

    async update_heatmap() {
        const colsrows = this.#rowscols
        if(colsrows == null)
            return;
        const { cols, rows } = colsrows;

        /* const { width, height } = this.props;
        const w:number = width - this.margin.left - this.margin.right;
        const h:number = height - this.margin.top - this.margin.bottom */

        const [h,w] = [rows, cols];
        console.log('w/h', w,h)
       

        const canvas = new OffscreenCanvas(w, h);
        const ctx:OffscreenRenderingContext = canvas.getContext('2d')!;
        ctx.clearRect(0,0,w,h)
        ctx.fillStyle = "#888888";
        ctx.fillRect(0, 0, w, h);


        const imdata:ImageData = ctx.getImageData(0,0,w,h);
        const buffer:Uint8ClampedArray = imdata.data; // w*h*4
        for(const item of this.props.$data.value) {
            const index:number = item.y * w * 4 + item.x * 4;
            buffer[index + 0] = (item.y / h) * 255; 
            buffer[index + 1] = item.value * 255;
            buffer[index + 2] = item.value * 255;
            buffer[index + 3] = 255;
        }
        ctx.putImageData(imdata,0,0);


        const blob = await canvas.convertToBlob({ type: 'image/png' });
        const f = new File([blob], "file.png", { type: blob.type });
        
        const svgimage = this.svgimage_ref.current!
        svgimage.href.baseVal = URL.createObjectURL(f)

    }

    svgimage_onclick:preact.MouseEventHandler<SVGImageElement> = (event) => {
        const [mx, my] = pointer(event, this.svgimage_ref.current);
        console.log(mx,my)
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