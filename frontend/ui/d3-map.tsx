import { preact, Signal, signals, JSX } from "../dep.ts"
import { OverlayDiv } from "./overlay-div.tsx";

import * as d3 from "d3";
import * as d3tile from "d3-tile"


// @ts-ignore for debugging
globalThis.d3 = d3;
// @ts-ignore for debugging
globalThis.d3tile = d3tile;



export type Marker = {
    latitude:  number;
    longitude: number;
}


type D3MapProps = {
    $markers: Readonly<Signal<Marker[]>>

    width:  number,
    height: number,
}

export class D3Map extends preact.Component<D3MapProps> {
    static override defaultProps = { width: 600, height: 500 };
    static readonly scale_min:number = 1 << 8
    static readonly scale_max:number = 1 << 22
    static readonly fit_padding_ratio:number = 0.85

    svg_ref: preact.RefObject<SVGSVGElement> = preact.createRef();

    zoom_behavior: d3.ZoomBehavior<SVGSVGElement, unknown>|null = null
    current_transform: d3.ZoomTransform = d3.zoomIdentity

    /** SVG map elements */
    $svg_tiles:Signal<JSX.Element[]> = new Signal([])

    /** SVG bubbles */
    $svg_annotations:Signal<JSX.Element[]> = new Signal([])

    $markers_empty:Readonly<Signal<boolean>> = signals.computed(
        () => (this.props.$markers.value.length == 0)
    )


    render(): JSX.Element {
        const { width, height } = this.props;

        return <div class="d3-container d3-map" style={{position:"relative"}}>
            <svg
                ref = {this.svg_ref} 
                // TODO: viewbox =

                width  = {width}
                height = {height}
                // debug
                style  = {{backgroundColor:"rgb(224,230,224)"}}
            >
                <g class="tiles" pointer-events="none">
                    { this.$svg_tiles }
                </g>
                <g class="annotations">
                    { this.$svg_annotations }
                </g>
            </svg>

            <OverlayDiv $visible={this.$markers_empty} >
                No stations loaded.
            </OverlayDiv>
        </div>
    }

    override componentDidMount(): void {
        const { width, height } = this.props;

        const zoom:d3.ZoomBehavior<SVGSVGElement, unknown> = 
            d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([D3Map.scale_min, D3Map.scale_max])
            .extent([[0, 0], [this.props.width, this.props.height]])   // TODO: what if width/height changes?
            .on("zoom", (event) => this.on_zoom(event.transform));     // TODO: use a $signal instead
        
        const transform:d3.ZoomTransform = 
            d3.zoomIdentity.translate(width >> 1, height >> 1).scale(1 << 12)

        this.zoom_behavior = zoom
        this.current_transform = transform

        d3.select(this.svg_ref.current!)
            .call(zoom)
            .call(zoom.transform, transform);

    }

    center_on_markers(): void {
        const markers:Marker[] = this.props.$markers.value;
        if(markers.length == 0)
            return;

        if(this.zoom_behavior == null || this.svg_ref.current == null)
            return;


        let latitude_min:number = markers[0]!.latitude
        let latitude_max:number = markers[0]!.latitude
        let longitude_min:number = markers[0]!.longitude
        let longitude_max:number = markers[0]!.longitude

        for(const marker of markers){
            latitude_min = Math.min(latitude_min, marker.latitude)
            latitude_max = Math.max(latitude_max, marker.latitude)
            longitude_min = Math.min(longitude_min, marker.longitude)
            longitude_max = Math.max(longitude_max, marker.longitude)
        }

        const base_projection:d3.GeoProjection = d3.geoMercator()
            .scale(1 / (2 * Math.PI))
            .translate([0, 0])

        let x_min:number = Number.POSITIVE_INFINITY
        let x_max:number = Number.NEGATIVE_INFINITY
        let y_min:number = Number.POSITIVE_INFINITY
        let y_max:number = Number.NEGATIVE_INFINITY

        for(const marker of markers){
            const projected:[number,number]|null =
                base_projection([marker.longitude, marker.latitude])
            if(projected == null)
                continue;

            x_min = Math.min(x_min, projected[0])
            x_max = Math.max(x_max, projected[0])
            y_min = Math.min(y_min, projected[1])
            y_max = Math.max(y_max, projected[1])
        }

        if(!Number.isFinite(x_min) || !Number.isFinite(y_min))
            return;

        const center_x:number = (x_min + x_max) / 2
        const center_y:number = (y_min + y_max) / 2
        const span_x:number = x_max - x_min
        const span_y:number = y_max - y_min

        let next_scale:number = this.current_transform.k

        if(span_x > 0 && span_y > 0){
            const usable_width:number = this.props.width * D3Map.fit_padding_ratio
            const usable_height:number = this.props.height * D3Map.fit_padding_ratio
            const fit_scale_x:number = usable_width / span_x
            const fit_scale_y:number = usable_height / span_y
            next_scale = Math.min(fit_scale_x, fit_scale_y)
        } else if(span_x > 0) {
            const usable_width:number = this.props.width * D3Map.fit_padding_ratio
            next_scale = usable_width / span_x
        } else if(span_y > 0) {
            const usable_height:number = this.props.height * D3Map.fit_padding_ratio
            next_scale = usable_height / span_y
        }

        next_scale = Math.max(D3Map.scale_min, Math.min(D3Map.scale_max, next_scale))

        const transform:d3.ZoomTransform = d3.zoomIdentity
            .translate(
                (this.props.width / 2) - (center_x * next_scale), 
                (this.props.height / 2) - (center_y * next_scale)
            )
            .scale(next_scale)

        d3.select(this.svg_ref.current)
            .call(this.zoom_behavior.transform, transform)
    }
    #_1 = signals.effect(() => this.center_on_markers())


    on_zoom(transform:d3.ZoomTransform): void {
        this.current_transform = transform

        const tilelayout:d3tile.TileLayout = 
            d3tile.tile()
            .extent([[0, 0], [this.props.width, this.props.height]])
            .tileSize(512)
            .clampX(false);

        const deltas:number[] = [0];
        const svg_tilegroups:JSX.Element[] = []
        for(const d of deltas){
            const svg_tiles:JSX.Element[] = []

            const tiles:d3tile.Tiles = tilelayout.zoomDelta(d)(transform);
            for(const tile of tiles){
                const url:string = url4tile(...d3tile.tileWrap(tile))
                
                const [tile_x, tile_y] = tile;
                const image_x:number = (tile_x + tiles.translate[0]) * tiles.scale
                const image_y:number = (tile_y + tiles.translate[1]) * tiles.scale

                const svg_tile:JSX.Element = 
                    <image 
                        xlink:href = {url}
                        x = {image_x}
                        y = {image_y}
                        width  = {tiles.scale}
                        height = {tiles.scale}
                    />
                svg_tiles.push(svg_tile);
            }

            svg_tilegroups.push(
                <g class={`tilegroup-delta${d}`}>
                    { svg_tiles }
                </g>
            )
        }
        this.$svg_tiles.value = svg_tilegroups;

        const projection:d3.GeoProjection = d3.geoMercator()
            .scale(transform.k / (2 * Math.PI))
            .translate([transform.x, transform.y])

        const svg_markers:JSX.Element[] = []
        for(const marker of this.props.$markers.value) {
            const projected:[number,number]|null = 
                projection([marker.longitude, marker.latitude]);
            if(projected == null)
                continue;

            svg_markers.push(
                <circle
                    cx = {projected[0]}
                    cy = {projected[1]}
                    r  = {10}
                    fill   = "red"
                    stroke = "#fff"
                    stroke-width = {1}
                />
            )
        }
        this.$svg_annotations.value = svg_markers;
    }
}


function url4tile(x:number, y:number, z:number): string {
    return `https://tile.opentopomap.org/${z}/${x}/${y}.png`;
}
